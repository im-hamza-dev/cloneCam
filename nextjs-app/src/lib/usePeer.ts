import { useRef } from "react";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" }
];

export function usePeer() {
  const pcRef = useRef<RTCPeerConnection | null>(null);

  const createPeer = () => {
    if (pcRef.current) return pcRef.current;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;
    return pc;
  };

  const closePeer = () => {
    const pc = pcRef.current;
    pcRef.current = null;
    if (!pc) return;
    try {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onnegotiationneeded = null;
      pc.onconnectionstatechange = null;
      pc.close();
    } catch {
      // ignore
    }
  };

  return { pcRef, createPeer, closePeer };
}

