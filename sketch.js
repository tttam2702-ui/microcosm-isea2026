//----------------------------------------------------
// AUDIO — all p5.js (NO external file)
//----------------------------------------------------
let audioOn = false;
let ambientOsc;
let ambientNoise;
let bloopOsc;
let bloopEnv;

//----------------------------------------------------
// POETIC TEXT
//----------------------------------------------------
let poeticLines = [
  "they are beautiful",
  "not system",
  "but lives you never notice",
  "every second something works for you",
  "not machine",
  "micro"
];

let displays = ["", "", "", "", "", ""];
let charPositions = [0,0,0,0,0,0];
let typeSpeed = 55;
let lastType = 0;

function randomGlitchChar() {
  const chars = "`~!@#$%^&*()-_=+<>?/[]{}";
  return chars[Math.floor(Math.random()*chars.length)];
}

//----------------------------------------------------
// NETWORK TRACKING
//----------------------------------------------------
let nodes = [];
let maxNodes = 60;
let nodeSize = 55;

function addNode(x,y){
  nodes.push({pos: createVector(x,y), life:255});
  if(nodes.length > maxNodes) nodes.shift();
}

//----------------------------------------------------
// MICROBE FLOATERS
//----------------------------------------------------
class Microbe {
  constructor(x = random(width), y = random(height), col = null) {
    this.x = x;
    this.y = y;
    this.alpha = random(60,150);
    this.size = random(6, 28);
    this.type = floor(random(0,4));
    this.dx = random(-0.3, 0.3);
    this.dy = random(-0.15, 0.15);
    this.rot = random(TWO_PI);
    this.spin = random(-0.01, 0.01);
    this.colorType = col ?? floor(random(0,3));
  }

  update() {
    this.x += this.dx;
    this.y += this.dy;
    this.rot += this.spin;

    let d = dist(this.x, this.y, mouseX, mouseY);
    let repelRadius = 140;

    if (d < repelRadius) {
      let ang = atan2(this.y - mouseY, this.x - mouseX);
      let force = map(d, 0, repelRadius, 2.5, 0.2);
      this.x += cos(ang) * force;
      this.y += sin(ang) * force;
      this.colorType = floor(random(0,3));

      if (random() < 0.02 && microbes.length < maxMicrobes * 2) {
        microbes.push(
          new Microbe(this.x + random(-8,8), this.y + random(-8,8), this.colorType)
        );
      }
    }

    if (this.x < -30) this.x = width + 30;
    if (this.x > width + 30) this.x = -30;
    if (this.y < -30) this.y = height + 30;
    if (this.y > height + 30) this.y = -30;
  }

  show() {
    push();
    translate(this.x, this.y);
    rotate(this.rot);

    switch(this.colorType) {
      case 0: fill(0, 200, 255, this.alpha); stroke(0, 200, 255, this.alpha); break;
      case 1: fill(50, 255, 150, this.alpha); stroke(50, 255, 150, this.alpha); break;
      case 2: fill(255, 255, 255, this.alpha); stroke(255, 255, 255, this.alpha); break;
    }

    switch(this.type) {
      case 0: noStroke(); ellipse(0, 0, this.size * 0.3); break;
      case 1: noFill(); strokeWeight(1.2); ellipse(0, 0, this.size, this.size); break;
      case 2: noStroke(); ellipse(0, 0, this.size * 1.2, this.size * 0.5); break;
      case 3:
        noStroke();
        beginShape();
        for (let a = 0; a < TWO_PI; a += TWO_PI/6){
          let r = this.size * (0.5 + random(-0.15,0.15));
          vertex(cos(a) * r, sin(a) * r);
        }
        endShape(CLOSE);
        break;
    }
    pop();
  }
}

let microbes = [];
let maxMicrobes = 40;

//----------------------------------------------------
// SPECKS
//----------------------------------------------------
class Speck {
  constructor() {
    this.x = random(width);
    this.y = random(height);
    this.alpha = random(30,120);
    this.size = random(1,3);
    this.dx = random(-0.2, 0.2);
    this.dy = random(-0.2, 0.2);
  }
  update(){
    this.x += this.dx;
    this.y += this.dy;
    if(this.x < 0) this.x = width;
    if(this.x > width) this.x = 0;
    if(this.y < 0) this.y = height;
    if(this.y > height) this.y = 0;
  }
  show(){
    noStroke();
    fill(255, this.alpha);
    ellipse(this.x, this.y, this.size);
  }
}
let specks = [];
let maxSpecks = 200;

//----------------------------------------------------
function setup() {
  createCanvas(windowWidth, windowHeight);

  for (let i = 1; i <= poeticLines.length; i++) {
    document.querySelector(`.t${i}`).innerHTML = "";
  }

  document.getElementById("start-btn").onclick = () => {
  window.location.href = "transition.html";
};

  document.getElementById("audio-btn").onclick = toggleAudio;

  // BLOOP
  bloopOsc = new p5.Oscillator('sine');
  bloopOsc.start();
  bloopOsc.amp(0);
  bloopEnv = new p5.Envelope();
  bloopEnv.setADSR(0.01, 0.1, 0.0, 0.1);
  bloopEnv.setRange(0.6, 0);

  // LAB HUM
  ambientOsc = new p5.Oscillator('sine');
  ambientOsc.freq(80);
  ambientOsc.amp(0);
  ambientOsc.start();

  ambientNoise = new p5.Noise('white');
  ambientNoise.amp(0);
  ambientNoise.start();

  userStartAudio();
}

//----------------------------------------------------
function draw() {
  clear();
  drawEllipse();
  typeGlitchLines();
  drawNetwork();
  drawSpecks();
  drawMicrobes();
  updateAmbient();
}

//----------------------------------------------------
function updateAmbient() {
  if (audioOn) {
    ambientOsc.amp(0.15, 1);
    ambientOsc.freq(80 + sin(frameCount * 0.01) * 20);
    ambientNoise.amp(0.02, 1);
  } else {
    ambientOsc.amp(0, 0.4);
    ambientNoise.amp(0, 0.4);
  }
}

//----------------------------------------------------
function drawEllipse() {
  stroke(255);
  strokeWeight(Math.max(1, width / 1440));
  noFill();
  // Keep the arc in the same proportion of the screen as the 1440 × 900 layout.
  const arcWidth = width * (1671 / 1440);
  const arcHeight = height * (1457 / 900);
  const arcTop = height * ((900 / 2 + 600 - 1457 / 2) / 900);
  ellipse(width / 2, arcTop + arcHeight / 2, arcWidth, arcHeight);
}

//----------------------------------------------------
function typeGlitchLines() {
  let now = millis();
  if (now - lastType > typeSpeed) {
    lastType = now;
    for (let i = 0; i < poeticLines.length; i++) {
      if (charPositions[i] < poeticLines[i].length) {
        if (random() < 0.12) displays[i] += randomGlitchChar();
        else {
          displays[i] = poeticLines[i].substring(0, charPositions[i]);
          charPositions[i]++;
        }
      } else if (random() < 0.02) {
        let idx = floor(random(poeticLines[i].length));
        displays[i] =
          poeticLines[i].substring(0, idx) +
          randomGlitchChar() +
          poeticLines[i].substring(idx + 1);
      }
      document.querySelector(`.t${i+1}`).innerHTML = displays[i];
    }
    if (random() < 0.002) {
      displays = ["","","","","",""];
      charPositions = [0,0,0,0,0,0];
    }
  }
}

//----------------------------------------------------
function drawNetwork() {
  if(mouseX > 0 && mouseX < width && mouseY > 0 && mouseY < height){
    addNode(mouseX + random(-4,4), mouseY + random(-4,4));
  }

  nodes.forEach(n => {
    n.life -= 10;
    n.pos.x += random(-0.4, 0.4);
    n.pos.y += random(-0.4, 0.4);
  });
  nodes = nodes.filter(n => n.life > 0);

  stroke(255,150);
  for(let i = 0; i < nodes.length - 1; i++){
    let a = nodes[i].pos;
    let b = nodes[i+1].pos;
    if(dist(a.x,a.y,b.x,b.y) < 150){
      line(a.x,a.y,b.x,b.y);
    }
  }

  blendMode(BURN);
  fill(255, 100);
  stroke(255);
  strokeWeight(2);
  rectMode(CENTER);
  nodes.forEach(n => rect(n.pos.x, n.pos.y, nodeSize, nodeSize));
  blendMode(BLEND);
}

//----------------------------------------------------
function drawSpecks() {
  if(specks.length < maxSpecks) specks.push(new Speck());
  specks.forEach(s => { s.update(); s.show(); });
}

//----------------------------------------------------
function drawMicrobes() {
  if (microbes.length < maxMicrobes && random() < 0.15) {
    microbes.push(new Microbe());
  }
  microbes.forEach(m => { m.update(); m.show(); });
  if (microbes.length > maxMicrobes * 2) microbes.shift();
}

//----------------------------------------------------
function mousePressed() {
  let startFreq = random(140, 200);
  let endFreq = startFreq * 0.4;
  bloopOsc.freq(startFreq);
  bloopEnv.play(bloopOsc);
  setTimeout(() => {
    bloopOsc.freq(endFreq);
  }, 30);
}

//----------------------------------------------------
function windowResized() { resizeCanvas(windowWidth, windowHeight); }
function toggleAudio() { audioOn = !audioOn; }

