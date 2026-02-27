const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const { customAlphabet } = require("nanoid");

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
const nanoidRoom = customAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZ", 6);

const app = express();

// Allow all origins (no extra deps).
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/create-room", (req, res) => {
  const roomId = nanoidRoom();
  res.send(roomId);
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

/**
 * roomId -> { laptopId?: string, mobileId?: string }
 */
const rooms = new Map();

function getRoomState(roomId) {
  const existing = rooms.get(roomId);
  if (existing) return existing;
  const fresh = { laptopId: undefined, mobileId: undefined };
  rooms.set(roomId, fresh);
  return fresh;
}

function otherPeer(roomState, socketId) {
  if (roomState.laptopId && roomState.laptopId !== socketId) return roomState.laptopId;
  if (roomState.mobileId && roomState.mobileId !== socketId) return roomState.mobileId;
  return null;
}

function cleanupRoomIfEmpty(roomId) {
  const state = rooms.get(roomId);
  if (!state) return;
  if (!state.laptopId && !state.mobileId) rooms.delete(roomId);
}

function log(msg) {
  const ts = new Date().toISOString().split("T")[1].slice(0, 12);
  console.log(`[${ts}] ${msg}`);
}

io.on("connection", (socket) => {
  socket.data.roomId = null;
  socket.data.role = null; // "laptop" | "mobile"
  log(`socket connected: ${socket.id}`);

  const join = (role, roomId) => {
    if (!roomId || typeof roomId !== "string") return;
    const normalized = roomId.toUpperCase().trim();
    const state = getRoomState(normalized);

    socket.join(normalized);
    socket.data.roomId = normalized;
    socket.data.role = role;

    log(`${role} joined room ${normalized} (${socket.id})`);

    if (role === "laptop") {
      state.laptopId = socket.id;
      if (state.mobileId) {
        log(`  -> sending mobile-ready to laptop ${socket.id}, laptop-ready to mobile ${state.mobileId}`);
        socket.emit("mobile-ready");
        io.to(state.mobileId).emit("laptop-ready");
      } else {
        log(`  -> waiting for mobile in room ${normalized}`);
      }
    } else {
      state.mobileId = socket.id;
      if (state.laptopId) {
        log(`  -> sending laptop-ready to mobile ${socket.id}, mobile-ready to laptop ${state.laptopId}`);
        socket.emit("laptop-ready");
        io.to(state.laptopId).emit("mobile-ready");
      } else {
        log(`  -> waiting for laptop in room ${normalized}`);
      }
    }
  };

  socket.on("join-laptop", (roomId) => join("laptop", roomId));
  socket.on("join-mobile", (roomId) => join("mobile", roomId));

  const relay = (eventName, payload, skipLog = false) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const state = rooms.get(roomId);
    if (!state) return;
    const targetId = otherPeer(state, socket.id);
    if (!targetId) return;
    if (!skipLog) {
      const targetRole = state.laptopId === targetId ? "laptop" : "mobile";
      log(`relay ${eventName}: ${socket.data.role} -> ${targetRole} (${socket.id} -> ${targetId})`);
    }
    io.to(targetId).emit(eventName, payload);
  };

  socket.on("offer", (payload) => {
    log(`received offer from mobile, sending to laptop`);
    relay("offer", payload);
  });
  socket.on("answer", (payload) => {
    log(`received answer from laptop, sending to mobile`);
    relay("answer", payload);
  });
  let iceCount = 0;
  socket.on("ice-candidate", (payload) => {
    iceCount += 1;
    if (iceCount <= 3 || iceCount % 10 === 0) {
      log(`relay ice-candidate #${iceCount} (${socket.data.role} -> peer)`);
    }
    relay("ice-candidate", payload, true);
  });

  socket.on("flip-camera", (payload) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const state = rooms.get(roomId);
    if (!state) return;
    if (socket.data.role !== "laptop") return;
    if (!state.mobileId) return;
    io.to(state.mobileId).emit("flip-camera", payload ?? null);
  });

  socket.on("change-quality", (payload) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const state = rooms.get(roomId);
    if (!state) return;
    if (socket.data.role !== "laptop") return;
    if (!state.mobileId) return;
    io.to(state.mobileId).emit("change-quality", payload ?? null);
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    const role = socket.data.role;
    log(`socket disconnected: ${socket.id} (${role || "?"})${roomId ? ` room ${roomId}` : ""}`);
    if (!roomId) return;
    const state = rooms.get(roomId);
    if (!state) return;

    const targetId = otherPeer(state, socket.id);
    if (targetId) {
      log(`  -> sending peer-disconnected to other peer ${targetId}`);
      io.to(targetId).emit("peer-disconnected");
    }

    if (state.laptopId === socket.id) state.laptopId = undefined;
    if (state.mobileId === socket.id) state.mobileId = undefined;

    cleanupRoomIfEmpty(roomId);
  });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Signaling server listening on :${PORT}`);
});

