//----------------------------------------------------
// PHRASES (shortened transition version)
//----------------------------------------------------
let lines = [
  "You are entering a living field.",
  "Every second something works for you.",
  "Quietly. Without permission. Without rest.",
  "They are not machines.",
  "They respond.",
  "Observe what keeps you alive."
];

let index = 0;
let currentText = "";
let typingSpeed = 45;
let finishedLine = false;

//----------------------------------------------------
// TYPE CLICK AUDIO
//----------------------------------------------------
let typeOsc;
let typeEnv;

//----------------------------------------------------
// AMBIENT HUM + HISS (same as LAB)
//----------------------------------------------------
let ambientOsc;
let ambientNoise;
let humLFO = 0;

// keep ON as soon as user interacts
let audioOn = false;
let humLocked = false;

//----------------------------------------------------
// BLOOP (optional, mouse press)
//----------------------------------------------------
let bloopOsc;
let bloopEnv;

//----------------------------------------------------
function setup() {
  let cnv = createCanvas(windowWidth, windowHeight);
  cnv.style("pointer-events", "none");
  cnv.style("z-index", "-1");
  textFont("Inter");

  //------------------------------------------------
  // TYPE CLICK SOUND
  //------------------------------------------------
  typeOsc = new p5.Oscillator("square");
  typeOsc.start();
  typeOsc.amp(0);

  typeEnv = new p5.Envelope();
  typeEnv.setADSR(0.001, 0.03, 0, 0.05);
  typeEnv.setRange(0.18, 0);

  //------------------------------------------------
  // BLOOP
  //------------------------------------------------
  bloopOsc = new p5.Oscillator('sine');
  bloopOsc.start();
  bloopOsc.amp(0);

  bloopEnv = new p5.Envelope();
  bloopEnv.setADSR(0.01, 0.1, 0.0, 0.1);
  bloopEnv.setRange(0.6, 0);

  //------------------------------------------------
  // AMBIENT HUM + HISS
  //------------------------------------------------
  initAmbient();

  userStartAudio();

  document.getElementById("audio-btn").onclick = toggleAudio;

  displayNextLine();
}

function draw() {
  updateAmbient();
}

//----------------------------------------------------
// AMBIENT HUM ENGINE
//----------------------------------------------------
function initAmbient() {
  ambientOsc = new p5.Oscillator('sine');
  ambientOsc.freq(70);
  ambientOsc.amp(0);
  ambientOsc.start();

  ambientNoise = new p5.Noise('white');
  ambientNoise.amp(0);
  ambientNoise.start();
}

function updateAmbient() {
  // Always run hum once unlocked
  if (!audioOn) {
    ambientOsc.amp(0, 0.2);
    ambientNoise.amp(0, 0.2);
    return;
  }

  humLFO += 0.01;

  let driftFreq = 70 + sin(humLFO * 0.5) * 12;
  let driftAmp  = 0.12 + sin(humLFO * 0.25) * 0.03;

  ambientOsc.freq(driftFreq);
  ambientOsc.amp(driftAmp, 0.3);

  ambientNoise.amp(0.018 + noise(humLFO) * 0.007, 0.3);
}

//----------------------------------------------------
// AUDIO TOGGLE
//----------------------------------------------------
function toggleAudio() {
  // If hum has already been unlocked, only mute/unmute
  if (humLocked) {
    audioOn = !audioOn;
    return;
  }

  // First time toggle = unlock forever
  humLocked = true;
  audioOn = true;
}

//----------------------------------------------------
// TYPE ENGINE
//----------------------------------------------------
function displayNextLine() {
  if (index >= lines.length) {
    setTimeout(() => window.location.href = "experience.html", 700);
    return;
  }

  let target = lines[index];
  currentText = "";
  finishedLine = false;
  let charPos = 0;

  let typer = setInterval(() => {
    if (charPos > target.length) {
      clearInterval(typer);
      finishedLine = true;
      index++;
      return;
    }

    currentText = target.substring(0, charPos);
    document.getElementById("textBox").innerHTML = currentText;

    // click tick
    typeOsc.freq(random(500, 900));
    typeEnv.play(typeOsc);

    charPos++;
  }, typingSpeed);
}

//----------------------------------------------------
// MOUSE INPUT
//----------------------------------------------------
function mousePressed() {
  // Unlock hum on first interaction
  if (!humLocked) {
    humLocked = true;
    audioOn = true;
  }

  if (finishedLine) {
    displayNextLine();
  } else {
    // bloop while typing
    bloopOsc.freq(random(140,200));
    bloopEnv.play(bloopOsc);
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
