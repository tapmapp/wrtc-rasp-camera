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
