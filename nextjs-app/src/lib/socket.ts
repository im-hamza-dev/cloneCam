import { io, type Socket } from "socket.io-client";
import { SIGNAL_URL } from "./constants";

let socket: Socket | null = null;

/** Base URL for the signal server. Same value on server and client to avoid hydration mismatch. */
export function getSignalUrl(): string {
 return SIGNAL_URL
}

/** True when socket will use same-origin /signal proxy (only call from client). */
export function isUsingSignalProxy(): boolean {
  if (typeof window === "undefined") return false;
  return !SIGNAL_URL;
}

export function getSocket(): Socket {
  if (socket) return socket;

  const url = getSignalUrl();
  const hasDirectUrl = url.startsWith("http://") || url.startsWith("https://");
  const useProxy =
    !hasDirectUrl &&
    typeof window !== "undefined" &&
    !SIGNAL_URL;

  const isNgrok =
    hasDirectUrl &&
    /ngrok-free\.app|ngrok-free\.dev|ngrok\.io/.test(url);

  const baseOpts = {
    autoConnect: false,
    transports: ["polling", "websocket"],
    ...(isNgrok && { extraHeaders: { "ngrok-skip-browser-warning": "true" } }),
  };

  if (useProxy) {
    socket = io({
      ...baseOpts,
      path: "/signal/socket.io",
    });
  } else {
    socket = io(url, baseOpts);
  }

  return socket;
}

export function resetSocket() {
  if (!socket) return;
  try {
    socket.disconnect();
  } finally {
    socket = null;
  }
}
