import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

/** Base URL for the signal server. Same value on server and client to avoid hydration mismatch. */
export function getSignalUrl(): string {
 return 'http://192.168.18.249:3001'
}

/** True when socket will use same-origin /signal proxy (only call from client). */
export function isUsingSignalProxy(): boolean {
  if (typeof window === "undefined") return false;
  return !process.env.NEXT_PUBLIC_SIGNAL_URL;
}

export function getSocket(): Socket {
  if (socket) return socket;

  const url = getSignalUrl();
  const isLocalhost = url.includes("localhost") || url.includes("127.0.0.1");
  const useProxy =
    !isLocalhost &&
    typeof window !== "undefined" &&
    !process.env.NEXT_PUBLIC_SIGNAL_URL;

  const isNgrok =
    !isLocalhost &&
    /ngrok-free\.app|ngrok-free\.dev|ngrok\.io/.test(useProxy ? window.location.origin : url);

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
