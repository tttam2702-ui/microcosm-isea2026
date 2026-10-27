# Microcosm

Microcosm is an interactive audiovisual web artwork about the invisible cellular activity that sustains human life. Visitors explore moving cell imagery through sound, observation, and hand movement captured by a webcam.

Prepared for the ISEA2026 Student Competition in Dubai.

## Run locally

From this folder, start a local web server:

```sh
python3 -m http.server 8000
```

Open [http://localhost:8000](http://localhost:8000) in a modern desktop browser. Click **START**, allow camera access, and move your hand to reveal the pixel bubbles. Moving closer to or farther from the camera changes their size. Use the on-screen controls to adjust speed, zoom, and pixel size.

An internet connection is needed for the p5.js scripts and MediaPipe hand-tracking model. The fonts and artwork assets are included in this repository.
