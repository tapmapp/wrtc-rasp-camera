const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const webrtc = require("wrtc");
const { createImageData, createCanvas, loadImage } = require("canvas");
const { RTCVideoSource, RTCVideoSink, i420ToRgba, rgbaToI420 } =
  require("wrtc").nonstandard;

require("@tensorflow/tfjs-backend-cpu");
require("@tensorflow/tfjs-backend-webgl");

const tf = require("@tensorflow/tfjs");
const bodyPix = require("@tensorflow-models/body-pix");

let net;

async function loadBodyPix() {
  await tf.ready();
  const backend = tf.getBackend();
  console.log("Using TensorFlow backend: ", backend);

  net = await bodyPix.load();
  // net = await blazeface.load();
}

loadBodyPix();

let lastFrame = null;

let loading = false;

const width = 260;
const height = 200;

const stream = new webrtc.MediaStream();
const source = new RTCVideoSource();
const track = source.createTrack();

const lastFrameCanvas = createCanvas(width, height);
const lastFrameContext = lastFrameCanvas.getContext("2d");
const rgba = new Uint8ClampedArray(width * height * 4);
const rgbaFrame = createImageData(rgba, width, height);

const imgCanvas = createCanvas(20, 20);
const imgContext = imgCanvas.getContext("2d");

loadImage("./btc-icon.png").then((image) => {
  console.log("btc loaded!");
  imgContext.drawImage(image, 0, 0);
});

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

setInterval(() => {
  segment();
});

let lastPrediciton;

async function segment() {
  if (lastFrame && !loading) {
    loading = true;
    i420ToRgba(lastFrame, rgbaFrame);
    lastFrameContext.putImageData(rgbaFrame, 0, 0);
    try {
      const pixels = tf.browser.fromPixels(lastFrameCanvas);
      net.segmentPerson(pixels).then((predictions) => {
        if (predictions) {
          lastPrediciton = predictions;
          predictions.allPoses.forEach((pose) => {
            pose.keypoints.forEach((keypoint) => {
              if (keypoint.part === "leftEye") {
                /*
                lastFrameContext.beginPath();
                lastFrameContext.strokeStyle = "red";
                lastFrameContext.fillRect(
                  keypoint.position.x,
                  keypoint.position.y,
                  2,
                  2
                );
                */

                lastFrameContext.drawImage(
                  imgCanvas,
                  keypoint.position.x - 10,
                  keypoint.position.y - 3
                );
                lastFrameContext.stroke();
              }
              if (keypoint.part === "rightEye") {
                /*
                lastFrameContext.beginPath();
                lastFrameContext.strokeStyle = "red";
                lastFrameContext.fillRect(
                  keypoint.position.x,
                  keypoint.position.y,
                  2,
                  2
                );
                */
                lastFrameContext.drawImage(
                  imgCanvas,
                  keypoint.position.x - 10,
                  keypoint.position.y - 3
                );
                lastFrameContext.stroke();
              }
            });
          });
          const imageData = lastFrameContext.getImageData(0, 0, width, height);
          const i420Frame = {
            width: width,
            height: height,
            data: new Uint8ClampedArray(width * height * 1.5),
          };
          rgbaToI420(imageData, i420Frame);
          source.onFrame(i420Frame);
          loading = false;
        }
      });
    } catch (error) {
      console.log(error);
      loading = false;
    }
  } else if (lastFrame) {
    console.log("busy");
    source.onFrame(lastFrame);
    loading = false;
  }
}

// async function detect() {
//   if (lastFrame && !loading) {
//     loading = true;
//     try {
//       const newCanvas = createCanvas(80, 60);
//       const newContext = newCanvas.getContext("2d");

//       const rgba = new Uint8ClampedArray(width * height * 4);

//       const frame = lastFrameContext.getImageData(
//         0,
//         0,
//         newCanvas.width,
//         newCanvas.height
//       );
//       newContext.putImageData(frame, 0, 0);

//       const pixels = tf.browser.fromPixels(newCanvas);

//       console.log(pixels);

//       const predictions = await net.detect(pixels);

//       if (predictions.length > 0) {
//         lastPrediction = predictions;
//         console.log(lastPrediction);
//       }

//       loading = false;
//     } catch (error) {
//       console.log(error);
//     }
//   }
// }

app.listen(5000, () => console.log("server started"));
