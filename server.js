const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const webrtc = require("wrtc");
const { createImageData, createCanvas } = require("canvas");
const { RTCVideoSource, RTCVideoSink, i420ToRgba, rgbaToI420 } =
  require("wrtc").nonstandard;
const tf = require("@tensorflow/tfjs");
const bodyPix = require("@tensorflow-models/body-pix");
const blazeface = require("@tensorflow-models/blazeface");

let net;

async function loadBodyPix() {
  await tf.ready();
  const backend = tf.getBackend();
  console.log("Using TensorFlow backend: ", backend);
  //net = await cocoSsd.load();
  net = await blazeface.load();
}

loadBodyPix();

let senderStream;
let lastFrame = null;

let loading = false;

const width = 160;
const height = 120;

const stream = new webrtc.MediaStream();
const source = new RTCVideoSource();
const track = source.createTrack();

const lastFrameCanvas = createCanvas(width, height);
const lastFrameContext = lastFrameCanvas.getContext("2d");
const rgba = new Uint8ClampedArray(width * height * 4);
const rgbaFrame = createImageData(rgba, width, height);

stream.addTrack(track);

app.use(express.static("public"));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.post("/consumer", async ({ body }, res) => {
  const peer = new webrtc.RTCPeerConnection({
    iceServers: [
      {
        urls: "stun:stun.stunprotocol.org",
      },
    ],
  });
  const desc = new webrtc.RTCSessionDescription(body.sdp);
  await peer.setRemoteDescription(desc);
  stream.getTracks().forEach((track) => peer.addTrack(track, stream));

  const answer = await peer.createAnswer();
  await peer.setLocalDescription(answer);
  const payload = {
    sdp: peer.localDescription,
  };

  res.json(payload);
});

app.post("/broadcast", async ({ body }, res) => {
  console.log("broadcasting...");
  const peer = new webrtc.RTCPeerConnection({
    iceServers: [
      {
        urls: "stun:stun.stunprotocol.org",
      },
    ],
  });

  peer.ontrack = (e) => handleTrackEvent(e, peer);

  const desc = new webrtc.RTCSessionDescription(body.sdp);

  await peer.setRemoteDescription(desc);
  const answer = await peer.createAnswer();

  await peer.setLocalDescription(answer);
  const payload = {
    sdp: peer.localDescription,
  };

  res.json(payload);
});

function handleTrackEvent(e, peer) {
  const sink = new RTCVideoSink(e.track);
  sink.addEventListener("frame", onFrame);
  senderStream = e.streams[0];
}

function onFrame({ frame }) {
  lastFrame = frame;
}

let lastPath;

setInterval(() => segment());

async function segment() {
  const date = new Date().getTime();
  if (lastFrame && !loading) {
    loading = true;
    i420ToRgba(lastFrame, rgbaFrame);
    lastFrameContext.putImageData(rgbaFrame, 0, 0);
    try {
      const pixels = tf.browser.fromPixels(lastFrameCanvas);
      const returnTensors = false; // Pass in `true` to get tensors back, rather than values.

      const predictions = await net.estimateFaces(pixels, returnTensors);

      if (predictions.length > 0) {
        for (let i = 0; i < predictions.length; i++) {
          const start = predictions[i].topLeft;
          const end = predictions[i].bottomRight;
          const landmarks = predictions[i].landmarks;
          const size = [end[0] - start[0], end[1] - start[1]];

          // Render a rectangle over each detected face.
          lastPath = { start, size };
          lastFrameContext.beginPath();
          lastFrameContext.strokeStyle = "red";
          lastFrameContext.rect(start[0], start[1], size[0], size[1]);

          // EYES
          lastFrameContext.fillRect(landmarks[0][0], landmarks[0][1], 2, 2);
          lastFrameContext.fillRect(landmarks[1][0], landmarks[1][1], 2, 2);

          lastFrameContext.fillRect(landmarks[2][0], landmarks[2][1], 2, 2);
          lastFrameContext.fillRect(landmarks[3][0], landmarks[3][1], 2, 2);

          lastFrameContext.fillRect(landmarks[4][0], landmarks[4][1], 2, 2);
          lastFrameContext.fillRect(landmarks[5][0], landmarks[5][1], 2, 2);

          lastFrameContext.stroke();
        }
        const imageData = lastFrameContext.getImageData(0, 0, width, height);
        const i420Frame = {
          width: width,
          height: height,
          data: new Uint8ClampedArray(width * height * 1.5),
        };
        rgbaToI420(imageData, i420Frame);
        source.onFrame(i420Frame);
        loading = false;
      } else {
        source.onFrame(lastFrame);
        loading = false;
      }
    } catch (error) {
      console.log("ERROR!");
      console.log(error);
    }
  } else if (lastFrame) {
    console.log("busy");
    i420ToRgba(lastFrame, rgbaFrame);
    if (lastPath) {
      lastFrameContext.putImageData(rgbaFrame, 0, 0);
      lastFrameContext.beginPath();
      lastFrameContext.strokeStyle = "red";
      lastFrameContext.rect(
        lastPath.start[0],
        lastPath.start[1],
        lastPath.size[0],
        lastPath.size[1]
      );
    }
    lastFrameContext.stroke();
    source.onFrame(lastFrame);
    loading = false;
  }
}

app.listen(5000, () => console.log("server started"));
