// ------------ GLOBALS -------------
let cam;
let camBuffer;
let cellVid;
let veil;
let handMask;
let handLandmarker = null;
let trackedHands = [];
let handAnchors = [];
let bubbles = [];
let nextHandId = 0;
let lastHandVideoTime = -1;
let lastHandDetectionAt = 0;
let lastBubbleSoundAt = 0;
let currentCell = "cell.webm";


const W = 640, H = 480;
const HAND_DETECTION_INTERVAL = 80;
const PALM_MOVE_THRESHOLD = 12;
const FINGER_MOVE_THRESHOLD = 16;
const MAX_BUBBLES = 96;
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]
];

let started = false;
let pixelSize = 12;

let messages = [];

// UI
let speedSlider, zoomSlider, overlaySlider;

// AUDIO
let audioOn = true;
let ambientOsc, ambientNoise, humLFO = 0;
let bloopOsc, bloopEnv;

// Bubble sound
let blobPing, blobEnv;

// Tutorial
let tutorialStep = 0;
let awaitingYesNo = true;


// -------------- preload --------------
function preload() {
  cellVid = createVideo("sources/cell.webm");
}

// -------------- setup ----------------
function setup() {
  let cnv = createCanvas(windowWidth, windowHeight);
  cnv.parent("p5-container");
  cnv.style("z-index","0");
  cnv.style("pointer-events","none");

  cam = createCapture(VIDEO);
  cam.size(W,H);
  cam.hide();
  camBuffer = createGraphics(W, H);
  handMask = createGraphics(W, H);
  handMask.pixelDensity(1);

  cellVid.size(W,H);
  cellVid.hide();
  cellVid.volume(0);

  veil = createGraphics(W,H);
  initHandTracking();

  textFont("monospace");
  textSize(11);

  initAmbient();
  initBloop();
  initPing(); 
  userStartAudio();

  document.getElementById("audio-btn").onclick = () => audioOn = !audioOn;

  speedSlider   = select("#speed");
  zoomSlider    = select("#zoom");
  overlaySlider = select("#pixel");

  populateCellList();
  startTutorial();
}

// -------------- draw orbit -----------
function drawOrbit(){
  noFill();
  stroke(255,60);
  strokeWeight(1);

  push();
  translate(width/2, height/2);
  scale(zoomSlider.value());

  ellipse(0,0,600,400);
  ellipse(0,0,700,250);
  ellipse(0,0,450,600);

  fill(255);
  noStroke();
  let t = frameCount*0.01*speedSlider.value();
  ellipse(cos(t)*300, sin(t)*200,4);
  pop();
}

// -------------- draw ----------------
function draw() {
  background(0);
  updateAmbient();

   if (!started) {
    drawOrbit();

    fill(255);
    textAlign(CENTER, CENTER);
    textFont('Michroma');   // set font
    textSize(15);

    text("click to start", width / 2, height / 2 - 10);

    textSize(10);
    text("wave your hand to see the magic", width / 2, height / 2 + 18);

    return;
  }

  push();
  translate(width/2 - W*zoomSlider.value()/2,
            height/2 - H*zoomSlider.value()/2);
  scale(zoomSlider.value());
  updateHandTracking();
  runBlobEngine();
  pop();

  drawOrbit();

  camBuffer.image(cam, 0, 0, W, H);
  camBuffer.filter(GRAY);
  drawHandConnections();
  push();
  image(camBuffer, 20, 20, 220, 165);
  pop();

  if (started) {
    let sp = map(speedSlider.value(), 0,1, 0.3,2);
    cellVid.speed(sp);
  }
}

// -------------- hand tracking --------
function setHandStatus(message) {
  const status = document.getElementById("hand-status");
  if (status && status.textContent !== message) status.textContent = message;
}

async function initHandTracking() {
  setHandStatus("Loading hand tracking…");
  try {
    const {FilesetResolver, HandLandmarker} = await import(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/vision_bundle.mjs"
    );
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm"
    );
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
      },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.7,
      minHandPresenceConfidence: 0.6,
      minTrackingConfidence: 0.6
    });
    setHandStatus("Show your hand");
  } catch (error) {
    console.error("Hand tracking could not start:", error);
    setHandStatus("Hand tracking unavailable");
  }
}

function updateHandTracking() {
  if (!handLandmarker || !cam || !cam.elt) return;

  const video = cam.elt;
  const now = performance.now();
  if (video.readyState < 2 || video.currentTime === lastHandVideoTime) {
    if (now - lastHandDetectionAt > 350) {
      trackedHands = [];
      handAnchors = [];
      setHandStatus("Show your hand");
    }
    return;
  }
  if (now - lastHandDetectionAt < HAND_DETECTION_INTERVAL) return;

  lastHandVideoTime = video.currentTime;
  lastHandDetectionAt = now;
  try {
    trackedHands = handLandmarker.detectForVideo(video, now).landmarks || [];
    const moving = emitBubblesForHandMovement(trackedHands, now);
    setHandStatus(trackedHands.length ? (moving ? "Hand moving" : "Move your hand") : "Show your hand");
  } catch (error) {
    console.error("Hand detection stopped:", error);
    handLandmarker = null;
    trackedHands = [];
    handAnchors = [];
    setHandStatus("Hand tracking unavailable");
  }
}

function emitBubblesForHandMovement(hands, now) {
  const availableAnchors = handAnchors.slice();
  const nextAnchors = [];
  let movementAmount = 0;

  for (const landmarks of hands) {
    if (landmarks.length < 21) continue;
    const points = landmarks.map(point => ({x: point.x * W, y: point.y * H}));
    const palmIndices = [0, 5, 9, 13, 17];
    const palm = {
      x: palmIndices.reduce((sum, index) => sum + points[index].x, 0) / palmIndices.length,
      y: palmIndices.reduce((sum, index) => sum + points[index].y, 0) / palmIndices.length
    };
    const tips = [4, 8, 12, 16, 20].map(index => points[index]);
    const palmWidth = dist(points[5].x, points[5].y, points[17].x, points[17].y);
    const palmLength = dist(points[0].x, points[0].y, points[9].x, points[9].y);
    // Apparent palm size grows as the hand approaches the camera.
    const handSize = (palmWidth + palmLength) / 2;

    let closestIndex = -1;
    let closestDistance = 140;
    for (let i = 0; i < availableAnchors.length; i++) {
      const anchor = availableAnchors[i];
      if (!anchor) continue;
      const distance = dist(palm.x, palm.y, anchor.palm.x, anchor.palm.y);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = i;
      }
    }

    if (closestIndex === -1) {
      nextAnchors.push({palm, tips, handSize, id: nextHandId++});
      continue;
    }

    const anchor = availableAnchors[closestIndex];
    availableAnchors[closestIndex] = null;
    anchor.handSize = lerp(anchor.handSize, handSize, 0.45);
    const baseRadius = map(anchor.handSize, 35, 150, 18, 98, true);
    const palmShift = {
      x: palm.x - anchor.palm.x,
      y: palm.y - anchor.palm.y
    };
    const palmDistance = Math.hypot(palmShift.x, palmShift.y);
    const movementPoints = [];
    if (palmDistance >= PALM_MOVE_THRESHOLD) {
      movementPoints.push({point: palm, shift: palmShift, distance: palmDistance});
      anchor.palm = palm;
      movementAmount = Math.max(movementAmount, palmDistance);
    }

    const movingTips = tips.map((tip, index) => ({
      point: tip,
      index,
      shift: {x: tip.x - anchor.tips[index].x, y: tip.y - anchor.tips[index].y},
      distance: dist(tip.x, tip.y, anchor.tips[index].x, anchor.tips[index].y)
    })).filter(tip => tip.distance >= FINGER_MOVE_THRESHOLD)
      .sort((a, b) => b.distance - a.distance)
      .slice(0, 2);

    for (const tip of movingTips) {
      movementPoints.push(tip);
      anchor.tips[tip.index] = tip.point;
      movementAmount = Math.max(movementAmount, tip.distance);
    }

    if (movementPoints.length) spawnBubbleCluster(movementPoints, baseRadius, now, anchor.id);
    nextAnchors.push(anchor);
  }

  handAnchors = nextAnchors;
  if (movementAmount > 0 && audioOn && now - lastBubbleSoundAt > 180) {
    blobPing.freq(map(movementAmount, 12, 70, 220, 620, true));
    blobEnv.play(blobPing);
    lastBubbleSoundAt = now;
  }
  return movementAmount > 0;
}

function spawnBubbleCluster(movementPoints, baseRadius, now, handId) {
  const lead = movementPoints[0];
  // One clear bubble carries the near/far scale; smaller ones make each gesture feel varied.
  spawnBubble(lead.point, baseRadius * random(0.9, 1.06), lead.shift, now, handId, true);

  const strongestMotion = Math.max(...movementPoints.map(movement => movement.distance));
  const satelliteCount = constrain(
    floor(map(strongestMotion, 12, 90, 5, 9, true)) + floor(random(2)), 5, 10
  );
  const sizeMix = [0.13, 0.24, 0.49, 0.18, 0.63, 0.32, 0.11, 0.42, 0.2, 0.55];
  for (let i = 0; i < satelliteCount; i++) {
    const source = movementPoints[i % movementPoints.length];
    const angle = random(TWO_PI);
    const spread = baseRadius * random(0.7, 1.75);
    const point = {
      x: source.point.x - source.shift.x * random(0.1, 0.55) + Math.cos(angle) * spread,
      y: source.point.y - source.shift.y * random(0.1, 0.55) + Math.sin(angle) * spread
    };
    const radius = Math.max(4, baseRadius * sizeMix[i] * random(0.85, 1.15));
    spawnBubble(point, radius, source.shift, now, handId, false);
  }
}

function spawnBubble(point, radius, shift, now, handId, primary) {
  bubbles.push({
    x: point.x - shift.x * 0.16 + random(-radius * 0.12, radius * 0.12),
    y: point.y - shift.y * 0.16 + random(-radius * 0.12, radius * 0.12),
    r: radius,
    glitchSeed: random(1000),
    glitchPhase: floor(random(3)),
    handId,
    primary,
    born: now,
    duration: random(115, 165)
  });
  if (bubbles.length > MAX_BUBBLES) bubbles.splice(0, bubbles.length - MAX_BUBBLES);
}

function drawHandConnections() {
  camBuffer.push();
  camBuffer.stroke(70, 255, 205, 230);
  camBuffer.strokeWeight(4);
  for (const landmarks of trackedHands) {
    if (landmarks.length < 21) continue;
    for (const [from, to] of HAND_CONNECTIONS) {
      camBuffer.line(
        landmarks[from].x * W, landmarks[from].y * H,
        landmarks[to].x * W, landmarks[to].y * H
      );
    }
  }
  camBuffer.noStroke();
  camBuffer.fill(255, 110, 200);
  for (const landmarks of trackedHands) {
    if (landmarks.length < 21) continue;
    for (const point of landmarks) {
      camBuffer.circle(point.x * W, point.y * H, 11);
    }
  }
  camBuffer.pop();
}

function drawHandBubbles() {
  handMask.clear();
  handMask.noStroke();
  const circles = [];
  const now = performance.now();
  bubbles = bubbles.filter(bubble => now - bubble.born < bubble.duration);

  for (const bubble of bubbles) {
    const glitchFrame = Math.floor((now - bubble.born) / 32);
    if (glitchFrame > 0 && (glitchFrame + bubble.glitchPhase) % 3 === 0) continue;
    const jump = glitchFrame === 0 ? 0 : bubble.r * 0.06;
    const circle = {
      cx: bubble.x + Math.sin(glitchFrame * 23 + bubble.glitchSeed) * jump,
      cy: bubble.y + Math.cos(glitchFrame * 31 + bubble.glitchSeed) * jump,
      r: bubble.r * (glitchFrame % 2 ? 0.96 : 1),
      alpha: 255,
      handId: bubble.handId,
      primary: bubble.primary
    };
    handMask.fill(255, circle.alpha);
    handMask.ellipse(circle.cx, circle.cy, circle.r * 2);
    circles.push(circle);
  }
  return circles;
}

function drawBubbleConnections(circles) {
  stroke(180, 115);
  strokeWeight(0.8);
  for (let i = 1; i < circles.length; i++) {
    const circle = circles[i];
    let nearest = null;
    let nearestDistance = Infinity;
    for (let j = 0; j < i; j++) {
      const candidate = circles[j];
      if (candidate.handId !== circle.handId) continue;
      const distance = dist(circle.cx, circle.cy, candidate.cx, candidate.cy);
      if (distance < nearestDistance) {
        nearest = candidate;
        nearestDistance = distance;
      }
    }
    if (nearest && nearestDistance < Math.min(260, Math.max(130, (circle.r + nearest.r) * 2.4))) {
      line(circle.cx, circle.cy, nearest.cx, nearest.cy);
    }
  }
}

// -------------- blob engine ----------
function runBlobEngine(){
  image(cellVid,0,0);

  veil.clear();
  veil.copy(cellVid,0,0,W,H,0,0,W,H);
  veil.filter(GRAY);

  const circles = drawHandBubbles();

  let pixMin = 2;
  let pixMax = 44;
  pixelSize = int(map(overlaySlider.value(), 0, 1, pixMin, pixMax));

  if (circles.length) {
    cellVid.loadPixels();
    handMask.loadPixels();
    noStroke();

    for (let x = 0; x < cellVid.width; x += pixelSize) {
      for (let y = 0; y < cellVid.height; y += pixelSize) {
        const maskX = Math.min(W - 1, x + Math.floor(pixelSize / 2));
        const maskY = Math.min(H - 1, y + Math.floor(pixelSize / 2));
        const maskAlpha = handMask.pixels[(maskY * W + maskX) * 4 + 3];
        if (maskAlpha < 16) continue;

        let idx = (y*cellVid.width+x)*4;
        fill(cellVid.pixels[idx],
             cellVid.pixels[idx+1]*0.7,
             cellVid.pixels[idx+2]*1.3,
             maskAlpha);
        rect(x,y,pixelSize,pixelSize);
      }
    }

    const ctx = veil.drawingContext;
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.drawImage(handMask.canvas, 0, 0, W, H);
    ctx.restore();
  }
  image(veil,0,0);

  drawBubbleConnections(circles);
  noFill();
  for (const circle of circles) {
    stroke(circle.primary ? 255 : 215, circle.primary ? 255 : 190);
    strokeWeight(circle.primary ? 1.3 : 0.8);
    ellipse(circle.cx, circle.cy, circle.r * 2);
  }
}

// --------- click interaction ----------
function mousePressed(){
  if(!started){
    cellVid.loop();
    started = true;
  } else {
    bloopOsc.freq(random(140,200));
    bloopEnv.play(bloopOsc);
  }
}

// -------- AUDIO HELPERS --------------

function initAmbient(){
  ambientOsc = new p5.Oscillator('sine');
  ambientOsc.freq(70); ambientOsc.amp(0); ambientOsc.start();
  ambientNoise = new p5.Noise('white');
  ambientNoise.amp(0); ambientNoise.start();
}

function initBloop(){
  bloopOsc=new p5.Oscillator('sine');
  bloopOsc.start(); bloopOsc.amp(0);
  bloopEnv=new p5.Envelope();
  bloopEnv.setADSR(.01,.1,0,.1);
  bloopEnv.setRange(.6,0);
}

function initPing(){
  if (blobPing) blobPing.stop();

  let wave = 'triangle';
  let env  = [0.01, 0.05, 0, 0.1];

  if (currentCell === "cell 2.webm") {
    wave = 'sine';
    env  = [0.005, 0.08, 0, 0.12];
  }
  
if (currentCell === "cell 3.webm") {
  wave = 'sine';
  env  = [0.04, 0.2, 0, 0.25];
}

  blobPing = new p5.Oscillator(wave);
  blobPing.start();
  blobPing.amp(0);

  blobEnv = new p5.Envelope();
  blobEnv.setADSR(...env);
  blobEnv.setRange(0.3, 0);
}


function updateAmbient(){
  if(audioOn){
    humLFO+=.01;
    ambientS=70+sin(humLFO*.5)*12;
    ambientOsc.freq(ambientS);
    ambientOsc.amp(.12+sin(humLFO*.25)*.03,.5);
    ambientNoise.amp(.018+.007*noise(humLFO),.5);
  } else {
    ambientOsc.amp(0,.6);
    ambientNoise.amp(0,.6);
  }
}

function windowResized(){
  resizeCanvas(windowWidth,windowHeight);
}

// -------- tutorial logic --------------
function startTutorial(){
  messages = [];
  tutorialStep = 0;
  awaitingYesNo = true;
  typeMessages([
    "Welcome!",
    "Are you ready?",
    "[PRESS Y] Yes     [PRESS N] No"
  ]);
}

function handleYes(){
  switch(tutorialStep){
    case 0:
      tutorialStep = 1;
      typeMessages([
        "Great! Have you allowed camera permission?",
        "[PRESS Y] Yes     [PRESS N] No"
      ]);
      break;

    case 1:
      tutorialStep = 2;
      typeMessages([
        "Awesome.",
        "Observation panel instructions:",
        "1. Speed adjusts cell flow",
        "2. Zoom changes microscope view",
        "3. Pixelation changes resolution",
        "Do you understand?",
        "[PRESS Y] Yes     [PRESS N] No"
      ]);
      break;

    case 2:
      tutorialStep = 3;
      typeMessages([
        "Nice! Selection panel:",
        "Click any of the three cells to explore.",
        "Everything good?",
        "[PRESS Y] Yes     [PRESS N] No"
      ]);
      break;

    case 3:
      typeMessages([
        "Perfect — Enjoy the experience!"
      ]);
      awaitingYesNo = false;
      break;
  }
}

function handleNo(){
  switch(tutorialStep){
    case 0:
      typeMessages(["No rush — press Y when you're ready."]);
      break;

    case 1:
      typeMessages([
        "Enable your camera in browser permissions, then press Y."
      ]);
      break;

    case 2:
      typeMessages([
        "Recap:",
        "Speed = flow",
        "Zoom = scale",
        "Pixelation = clarity",
        "Got it now?",
        "[PRESS Y] Yes     [PRESS N] No"
      ]);
      break;

    case 3:
      tutorialStep = 0;
      startTutorial();
      break;
  }
}

function keyTyped(){
  if(!awaitingYesNo) return;
  if(key === 'y' || key === 'Y') handleYes();
  if(key === 'n' || key === 'N') handleNo();
}

// -------- staged messages -----
function typeMessages(list, delay = 1500){
  let i = 0;
  awaitingYesNo = false;
  let interval = setInterval(() => {
    addMessage(list[i]);
    i++;
    if(i >= list.length){
      clearInterval(interval);
      setTimeout(()=> awaitingYesNo = true, 300);
    }
  }, delay);
}

// --------- messages ----------
function addMessage(t){
  let box=document.querySelector("#msg-box");
  let d=document.createElement("div");
  d.className="msg";
  d.textContent = t;
  box.appendChild(d);
  messages.push(d);
  if(messages.length>5){
    let gone = messages.shift();
    gone.style.opacity = 0;
    setTimeout(()=>gone.remove(),600);
  }
}

// ===== FLOATING INFO NEW =====
function showFloatingInfo(title, body, duration = 15000) {
  const box = document.getElementById("cell-info");

  box.innerHTML = `
    <div style="font-family: Michroma, monospace; font-size:14px; letter-spacing:1px;">
      ${title}
    </div>
    <div style="width:120px;height:1px;background:rgba(255,255,255,0.6);margin:6px 0 8px 0;"></div>
    <div style="font-family: monospace; font-size:11px; line-height:1.5; max-width:360px;">
      ${body}
    </div>
  `;

  box.style.opacity = 1;

  setTimeout(() => {
    box.style.opacity = 0;
  }, duration);

  setTimeout(() => {
    box.innerHTML = "";
  }, duration + 1000);
}


// -------- cell select---------
function populateCellList(){
  let div = document.querySelector("#cell-list");

  let vids = [
    {video:"cell.webm",   png:"cell-selection.png"},
    {video:"cell 2.webm", png:"cell-selection-2.png"},
    {video:"cell 3.webm", png:"cell-selection-3.png"}
  ];

  vids.forEach(v => {
    let img = document.createElement("img");
    img.src = "sources/" + v.png;
    img.className = "thumb";

    img.onclick = () => {
      cellVid.stop();
      cellVid = createVideo("sources/" + v.video);
      cellVid.size(W,H);
      cellVid.hide();
      if(started) cellVid.loop();

        currentCell = v.video;
  initPing();
     if (v.video === "cell.webm")
  showFloatingInfo(
    "RPE1_",
    "Represents a healthy human cell that performs quiet, continuous labour—maintaining structure, moving resources, and responding to changes in its environment."
  );

if (v.video === "cell 2.webm")
  showFloatingInfo(
    "HFF1_ EB3",
    "Represents a human fibroblast quietly assembling its internal infrastructure through the growth of microtubules."
  );

if (v.video === "cell 3.webm")
  showFloatingInfo(
    "Neural progenitors",
    "Represent developing human cells performing early organisational labour—forming connections, coordinating growth, and preparing neural networks."
  );
    };

    div.appendChild(img);
  });
}
