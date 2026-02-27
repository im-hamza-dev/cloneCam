"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { getSocket, resetSocket } from "@/lib/socket";
import { usePeer } from "@/lib/usePeer";

type FacingMode = "user" | "environment";
type Quality = "360p" | "720p" | "1080p";

function qualityToConstraints(quality: Quality) {
  if (quality === "360p") {
    return { width: 640, height: 360, frameRate: 30 };
  }
  if (quality === "1080p") {
    return { width: 1920, height: 1080, frameRate: 30 };
  }
  return { width: 1280, height: 720, frameRate: 30 };
}

const SECURE_CONTEXT_MSG =
  "Camera requires a secure page (HTTPS or localhost). From your phone, open this app over HTTPS.";

function getMediaDevices(): MediaDevices {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error(SECURE_CONTEXT_MSG);
  }
  return navigator.mediaDevices;
}

async function getCameraStream(facingMode: FacingMode, quality: Quality): Promise<MediaStream> {
  const media = getMediaDevices();
  const q = qualityToConstraints(quality);
  try {
    return await media.getUserMedia({
      video: {
        facingMode,
        width: { ideal: q.width },
        height: { ideal: q.height },
        frameRate: { ideal: q.frameRate }
      },
      audio: true
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "OverconstrainedError" || name === "NotFoundError") {
      return await media.getUserMedia({
        video: { facingMode },
        audio: true
      });
    }
    throw err;
  }
}

export default function MobilePage() {
  const params = useParams();
  const roomId = ((params?.roomId as string) ?? "").trim().toUpperCase();
  const { pcRef, createPeer, closePeer } = usePeer();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const facingRef = useRef<FacingMode>("user");
  const qualityRef = useRef<Quality>("720p");
  const tracksAddedRef = useRef<boolean>(false);

  const [status, setStatus] = useState<"waiting" | "live" | "error">("waiting");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [facing, setFacing] = useState<FacingMode>("user");
  const [quality, setQuality] = useState<Quality>("720p");

  const badge = useMemo(() => {
    if (status === "live") return { text: "LIVE", cls: "bg-emerald-500/15 text-emerald-200 ring-emerald-500/30" };
    if (status === "error") return { text: "ERROR", cls: "bg-rose-500/15 text-rose-200 ring-rose-500/30" };
    return { text: "Waiting", cls: "bg-amber-500/15 text-amber-200 ring-amber-500/30" };
  }, [status]);

  const cleanup = () => {
    closePeer();
    resetSocket();
    tracksAddedRef.current = false;
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop();
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const applyNewStream = async (newStream: MediaStream) => {
    const pc = pcRef.current;
    if (!pc) return;

    const videoTrack = newStream.getVideoTracks()[0] ?? null;
    const audioTrack = newStream.getAudioTracks()[0] ?? null;

    if (videoTrack) {
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender) await sender.replaceTrack(videoTrack);
    }
    if (audioTrack) {
      const sender = pc.getSenders().find((s) => s.track?.kind === "audio");
      if (sender) await sender.replaceTrack(audioTrack);
    }

    const prev = streamRef.current;
    streamRef.current = newStream;
    if (videoRef.current) {
      videoRef.current.srcObject = newStream;
      void videoRef.current.play().catch(() => {});
    }
    if (prev) {
      for (const t of prev.getTracks()) t.stop();
    }
  };

  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;

    async function init() {
      try {
        if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
          setErrorMessage(SECURE_CONTEXT_MSG);
          setStatus("error");
          return;
        }
        const stream = await getCameraStream("user", "720p");
        if (cancelled) return;
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => {});
        }

        const socket = getSocket();
        socket.connect();

        const joinRoom = () => socket.emit("join-mobile", roomId);
        if (socket.connected) joinRoom();
        else socket.once("connect", joinRoom);

        const ensurePeer = () => {
          const pc = createPeer();

          pc.onicecandidate = (ev) => {
            if (!ev.candidate) return;
            const payload = ev.candidate.toJSON ? ev.candidate.toJSON() : ev.candidate;
            socket.emit("ice-candidate", payload);
          };

          return pc;
        };

        let makingOffer = false;

        socket.off("laptop-ready");
        socket.on("laptop-ready", async () => {
          const pc = ensurePeer();
          const local = streamRef.current;
          if (!local) return;

          pc.onnegotiationneeded = async () => {
            if (makingOffer) return;
            try {
              makingOffer = true;
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              socket.emit("offer", pc.localDescription);
              setErrorMessage("");
              setStatus("live");
            } catch (e) {
              setErrorMessage(e instanceof Error ? e.message : "Offer failed");
              setStatus("error");
            } finally {
              makingOffer = false;
            }
          };

          if (!tracksAddedRef.current) {
            for (const track of local.getTracks()) {
              pc.addTrack(track, local);
            }
            tracksAddedRef.current = true;
          }
        });

        const iceQueue: RTCIceCandidateInit[] = [];
        const drainIceQueue = async (pc: RTCPeerConnection) => {
          while (iceQueue.length > 0) {
            const p = iceQueue.shift()!;
            try {
              await pc.addIceCandidate(new RTCIceCandidate(p));
            } catch {
              // ignore
            }
          }
        };

        socket.off("answer");
        socket.on("answer", async (answer) => {
          try {
            const pc = ensurePeer();
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
            await drainIceQueue(pc);
          } catch (e) {
            setErrorMessage(e instanceof Error ? e.message : "Answer failed");
            setStatus("error");
          }
        });

        socket.off("ice-candidate");
        socket.on("ice-candidate", async (payload) => {
          const pc = ensurePeer();
          if (!payload || (payload.candidate == null && payload.type !== "candidate")) return;
          if (!pc.remoteDescription) {
            iceQueue.push(payload as RTCIceCandidateInit);
            return;
          }
          try {
            await pc.addIceCandidate(new RTCIceCandidate(payload));
          } catch {
            // ignore
          }
        });

        socket.off("flip-camera");
        socket.on("flip-camera", async () => {
          const nextFacing: FacingMode = facingRef.current === "user" ? "environment" : "user";
          try {
            const s = await getCameraStream(nextFacing, qualityRef.current);
            if (cancelled) return;
            facingRef.current = nextFacing;
            setFacing(nextFacing);
            await applyNewStream(s);
          } catch {
            setErrorMessage("Flip camera failed");
            setStatus("error");
          }
        });

        socket.off("change-quality");
        socket.on("change-quality", async (payload) => {
          const nextQuality: Quality = payload?.quality === "360p" || payload?.quality === "1080p" ? payload.quality : "720p";
          try {
            const s = await getCameraStream(facingRef.current, nextQuality);
            if (cancelled) return;
            qualityRef.current = nextQuality;
            setQuality(nextQuality);
            await applyNewStream(s);
          } catch {
            setErrorMessage("Quality change failed");
            setStatus("error");
          }
        });

        socket.off("peer-disconnected");
        socket.on("peer-disconnected", () => {
          setErrorMessage("");
          setStatus("waiting");
          cleanup();
        });

        socket.off("disconnect");
        socket.on("disconnect", () => {
          setErrorMessage("");
          setStatus("waiting");
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Something went wrong";
        setErrorMessage(msg === "Permission denied" || msg.includes("denied") ? "Camera/mic access denied" : msg);
        setStatus("error");
      }
    }

    void init();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [roomId]);

  if (!roomId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#080c14] text-slate-100">
        <div className="rounded-xl bg-slate-900/80 px-6 py-4 ring-1 ring-slate-700">
          <p className="text-sm font-semibold">Invalid room</p>
          <p className="mt-1 text-xs text-slate-400">Open this page from the QR code on the laptop.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#080c14] text-slate-100">
      <div className="relative h-screen w-screen overflow-hidden bg-black">
        <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />

        <div className={`absolute left-4 top-4 rounded-full px-3 py-1 text-xs font-semibold ring-1 backdrop-blur-sm ${badge.cls}`}>
          {badge.text}
        </div>

        {status === "error" && errorMessage && (
          <div className="absolute left-4 right-4 top-14 rounded-lg bg-rose-950/90 px-3 py-3 text-xs text-rose-200 ring-1 ring-rose-500/30">
            <p className="font-medium">{errorMessage}</p>
            {errorMessage === SECURE_CONTEXT_MSG && (
              <p className="mt-2 text-rose-300/90">
                Local: use a tunnel (e.g. ngrok, Cloudflare Tunnel) so the phone opens <strong>https://…</strong>. Or deploy the app to Vercel for HTTPS.
              </p>
            )}
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
          <div className="mx-auto flex max-w-md flex-col gap-2">
            <div className="flex items-center justify-between text-xs text-slate-200">
              <div className="rounded-lg bg-slate-950/40 px-3 py-2 ring-1 ring-white/10">
                Room <span className="ml-2 font-semibold tracking-widest">{roomId}</span>
              </div>
              <div className="rounded-lg bg-slate-950/40 px-3 py-2 ring-1 ring-white/10">
                Camera <span className="ml-2 font-semibold">{facing === "user" ? "Front" : "Back"}</span>
              </div>
            </div>
            <div className="text-xs text-slate-300">Keep this page open while streaming.</div>
          </div>
        </div>
      </div>
    </main>
  );
}

