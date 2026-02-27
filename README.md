# SnapCam (Phone cam → Laptop webcam)

Stream your **phone camera** to your **laptop browser** using **WebRTC**, with a tiny **Socket.io signaling server**.

## What’s in this repo

- `server/`: Node.js + Express + Socket.io signaling server (port **3001**)
- `nextjs-app/`: Next.js 14 app (port **3000**)
  - Laptop page: `/`
  - Mobile page: `/mobile/[roomId]`

## Local development

### 1) Start signaling server (:3001)

```bash
cd server
npm install
npm start
```

Health check: `GET /health` → `{ ok: true }`

### 2) Start Next.js app (:3000)

```bash
cd nextjs-app
npm install
npm run dev
```

### 3) Set `NEXT_PUBLIC_SIGNAL_URL` correctly

If your phone is on the same Wi‑Fi and you want it to reach your laptop’s signaling server, **do not use `localhost`**.

- **Good**: `http://192.168.1.50:3001` (your laptop’s LAN IP)
- **Bad**: `http://localhost:3001` (points to the phone itself)

Copy `.env.example` to `.env.local` (or set env var another way):

```bash
NEXT_PUBLIC_SIGNAL_URL=http://192.168.1.50:3001
```

Then restart `next dev`.

### 4) Use HTTPS when opening the app on your phone

Browsers only allow camera access on **secure** pages (HTTPS or `localhost`). If you open the app on your phone via `http://192.168.x.x:3000`, you’ll see “Camera requires a secure page…”.

**Options:**

- **Tunnel (local testing):** Expose your laptop with an HTTPS URL and open that on your phone.
  - [ngrok](https://ngrok.com): `ngrok http 3000` (Next.js) and optionally `ngrok http 3001` (signaling server). Use the `https://` URLs; set `NEXT_PUBLIC_SIGNAL_URL` to the signaling server’s ngrok URL.
  - [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps): similar idea, free tier available.
- **Deploy:** Deploy the Next.js app (e.g. Vercel) and the signaling server (e.g. Railway). Then the app and server are served over HTTPS and the camera will work on your phone.

## How it works (WebRTC flow)

There are two peers:

- **Laptop** opens `/`
  - Creates a room via `GET /create-room`
  - Shows a QR code to `/mobile/<roomId>`
  - Joins the room as `join-laptop(roomId)`
  - Receives the phone’s media via `ontrack` and renders it in `<video>`
- **Mobile** opens `/mobile/<roomId>`
  - Calls `getUserMedia(...)` to capture camera + microphone
  - Joins the room as `join-mobile(roomId)`
  - Adds tracks to an `RTCPeerConnection`
  - Creates an **offer** and sends it through signaling

Signaling messages relayed by the server (Socket.io):

- `offer` → mobile → laptop
- `answer` → laptop → mobile
- `ice-candidate` ↔ both directions

Control plane (Socket.io, laptop → mobile):

- `flip-camera` → mobile toggles `facingMode` and `replaceTrack(...)`
- `change-quality` → mobile restarts `getUserMedia(...)` with new constraints and `replaceTrack(...)`

## Deploy

- **Signaling server**: deploy to Railway (or any Node host)
  - Set `PORT` if your platform requires it (server defaults to `3001`)
- **Next.js app**: deploy to Vercel
  - Set `NEXT_PUBLIC_SIGNAL_URL` to your deployed signaling server URL (https)

## Notes / limitations

- This demo streams **to the laptop browser** (it does not create a true OS-level “webcam device”).
- WebRTC connectivity depends on network/NAT; the app uses Google STUN servers.

