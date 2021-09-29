const { RTCVideoSource, RTCVideoSink, rgbaToI420 } =
  require("wrtc").nonstandard;
const { createCanvas, loadImage } = require("canvas");
const RaspividJpegStream = require("raspivid-jpeg-stream");
const axios = require("axios");

const {
  RTCPeerConnection,
  RTCSessionDescription,
  MediaStream,
} = require("wrtc");

const stream = new MediaStream();
const peer = createPeer();
const source = new RTCVideoSource();
const track = source.createTrack();
stream.addTrack(track);
peer.addTrack(track, stream);
const sink = new RTCVideoSink(track);

startStreaming(source);

function startStreaming(source) {
  const width = 320;
  const height = 240;

  const camera = new RaspividJpegStream({
    width: width,
    height: height,
    timeout: 0,
    framerate: 24,
    bitrate: 25000000,
  });

  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");

  console.log("running!");

  return new Promise((resolve) => {
    camera.on("data", (framet) => {
      loadImage(framet).then((image) => {
        context.drawImage(image, 0, 0, width, height);

        try {
          const rgbaFrame = context.getImageData(0, 0, width, height);
          const i420Frame = {
            width,
            height,
            data: new Uint8ClampedArray(1.5 * width * height),
          };
          rgbaToI420(rgbaFrame, i420Frame);
          source.onFrame(i420Frame);
          resolve();
        } catch (error) {
          console.log(error);
          resolve();
        }
      });
    });
  }).catch((err) => resolve());
}

setTimeout(() => {
  track.stop();
  sink.stop();
}, 10000);

function createPeer() {
  const peer = new RTCPeerConnection({
    iceServers: [
      {
        urls: "stun:stun.stunprotocol.org",
      },
    ],
  });
  peer.onnegotiationneeded = () => handleNegotiationNeededEvent(peer);

  return peer;
}

async function handleNegotiationNeededEvent(peer) {
  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);
  const payload = {
    sdp: peer.localDescription,
  };

  const { data } = await axios.post(
    "http://192.168.1.128:5000/broadcast",
    payload
  );
  const desc = new RTCSessionDescription(data.sdp);
  peer.setRemoteDescription(desc).catch((e) => console.log(e));
}
