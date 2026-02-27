'use client';

import QRCode from 'qrcode';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getSignalUrl, getSocket, resetSocket } from '@/lib/socket';
import { usePeer } from '@/lib/usePeer';

type Status = 'creating' | 'waiting' | 'connected' | 'disconnected';
type Quality = '360p' | '720p' | '1080p';

function statusDotClass(status: Status) {
  switch (status) {
    case 'creating':
      return 'bg-sky-400';
    case 'waiting':
      return 'bg-amber-400';
    case 'connected':
      return 'bg-emerald-400';
    case 'disconnected':
      return 'bg-rose-400';
  }
}

export default function LaptopPage() {
  const { pcRef, createPeer, closePeer } = usePeer();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);

  const [status, setStatus] = useState<Status>('creating');
  const [createError, setCreateError] = useState<string>('');
  const [roomId, setRoomId] = useState<string>('');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [selectedQuality, setSelectedQuality] = useState<Quality>('720p');
  const [muted, setMuted] = useState<boolean>(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');

  const mobileUrl = useMemo(() => {
    if (!roomId) return '';
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/mobile/${roomId}`;
  }, [roomId]);

  const signalUrl = useMemo(() => getSignalUrl(), []);
  const [signalConnected, setSignalConnected] = useState(false);

  const connected = status === 'connected';

  const cleanup = () => {
    closePeer();
    remoteStreamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    resetSocket();
    setStatus('disconnected');
  };

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        setStatus('creating');

        const timeoutMs = 8000;
        const isNgrokOrigin =
          typeof window !== 'undefined' &&
          /ngrok-free\.app|ngrok-free\.dev|ngrok\.io/.test(
            window.location.origin,
          );
        const fetchHeaders: HeadersInit = {
          ...(isNgrokOrigin && { 'ngrok-skip-browser-warning': 'true' }),
        };

        async function fetchRoomId(
          url: string,
          signal: AbortSignal,
        ): Promise<string> {
          const resp = await fetch(url, {
            cache: 'no-store',
            signal,
            headers: fetchHeaders,
          });
          if (!resp.ok)
            throw new Error(`Signal server returned ${resp.status}`);
          const text = (await resp.text()).trim().toUpperCase();
          if (!text || text.length > 10)
            throw new Error('Invalid room response');
          return text;
        }

        const directUrl = `${signalUrl.replace(/\/$/, '')}/create-room`;
        const useProxyFirst =
          typeof window !== 'undefined' &&
          !/localhost|127\.0\.0\.1/.test(signalUrl);

        let id: string;
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
          try {
            if (useProxyFirst) {
              id = await fetchRoomId('/create-room', controller.signal);
            } else {
              id = await fetchRoomId(directUrl, controller.signal);
            }
          } catch (firstErr) {
            clearTimeout(timeoutId);
            const fallbackUrl = useProxyFirst ? directUrl : '/create-room';
            const controller2 = new AbortController();
            const timeoutId2 = setTimeout(() => controller2.abort(), timeoutMs);
            try {
              id = await fetchRoomId(fallbackUrl, controller2.signal);
            } finally {
              clearTimeout(timeoutId2);
            }
          } finally {
            clearTimeout(timeoutId);
          }
        } catch (e) {
          const msg =
            e instanceof Error
              ? e.name === 'AbortError'
                ? 'Signal server did not respond in time. Is it running on port 3001?'
                : e.message
              : 'Could not create room';
          throw new Error(msg);
        }

        if (cancelled) return;
        setCreateError('');
        setRoomId(id);
        setStatus('waiting');

        const url = `${window.location.origin}/mobile/${id}`;
        const qr = await QRCode.toDataURL(url, {
          margin: 1,
          width: 320,
          color: { dark: '#E2E8F0', light: '#0B1220' },
        });
        if (cancelled) return;
        setQrDataUrl(qr);

        const socket = getSocket();
        setSignalConnected(socket.connected);
        socket.on('connect', () => setSignalConnected(true));
        socket.on('disconnect', () => setSignalConnected(false));
        socket.connect();

        const joinRoom = () => {
          socket.emit('join-laptop', id);
          setStatus('waiting');
        };
        if (socket.connected) joinRoom();
        else socket.once('connect', joinRoom);

        const ensurePeer = () => {
          const pc = createPeer();

          pc.ontrack = (ev) => {
            const stream = ev.streams?.[0];
            if (!stream) return;
            remoteStreamRef.current = stream;
            if (videoRef.current) {
              videoRef.current.srcObject = stream;
              videoRef.current.muted = muted;
              void videoRef.current.play().catch(() => {});
            }
            setStatus('connected');
          };

          pc.onicecandidate = (ev) => {
            if (!ev.candidate) return;
            const payload = ev.candidate.toJSON
              ? ev.candidate.toJSON()
              : ev.candidate;
            socket.emit('ice-candidate', payload);
          };

          pc.onconnectionstatechange = () => {
            if (!pcRef.current) return;
            const st = pcRef.current.connectionState;
            if (st === 'disconnected' || st === 'failed' || st === 'closed') {
              setStatus('disconnected');
            }
          };

          return pc;
        };

        socket.off('mobile-ready');
        socket.on('mobile-ready', () => {
          ensurePeer();
        });

        const iceQueue: RTCIceCandidateInit[] = [];
        const drainIceQueue = async (pc: RTCPeerConnection) => {
          while (iceQueue.length > 0) {
            const payload = iceQueue.shift()!;
            try {
              await pc.addIceCandidate(new RTCIceCandidate(payload));
            } catch {
              // ignore
            }
          }
        };

        socket.off('offer');
        socket.on('offer', async (offer) => {
          const pc = ensurePeer();
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          await drainIceQueue(pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('answer', pc.localDescription);
        });

        socket.off('answer');
        socket.on('answer', async (answer) => {
          const pc = ensurePeer();
          if (!pc.currentRemoteDescription) {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
          }
        });

        socket.off('ice-candidate');
        socket.on('ice-candidate', async (payload) => {
          const pc = ensurePeer();
          if (
            !payload ||
            (payload.candidate == null && payload.type !== 'candidate')
          )
            return;
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

        socket.off('peer-disconnected');
        socket.on('peer-disconnected', () => {
          cleanup();
        });

        socket.off('disconnect');
        socket.on('disconnect', () => {
          setStatus('disconnected');
        });
      } catch (e) {
        if (cancelled) return;
        setCreateError(
          e instanceof Error ? e.message : 'Could not reach signal server',
        );
        setStatus('disconnected');
      }
    }

    void init();

    return () => {
      cancelled = true;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.muted = muted;
  }, [muted]);

  const emitFlipCamera = () => {
    if (!roomId) return;
    const socket = getSocket();
    if (!socket.connected) return;
    socket.emit('flip-camera');
  };

  const emitQuality = (q: Quality) => {
    setSelectedQuality(q);
    if (!roomId) return;
    const socket = getSocket();
    if (!socket.connected) return;
    socket.emit('change-quality', { quality: q });
  };

  const copyMobileUrl = async () => {
    if (!mobileUrl) return;
    try {
      await navigator.clipboard.writeText(mobileUrl);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 1200);
    } catch {
      // ignore
    }
  };

  return (
    <main className="min-h-screen">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-3">
          <span
            className={`h-2.5 w-2.5 rounded-full ${statusDotClass(status)}`}
          />
          <div className="flex flex-col">
            <span className="text-sm font-semibold tracking-wide">SnapCam</span>
            <span className="text-xs text-slate-400">
              {status === 'creating' && 'creating…'}
              {status === 'waiting' && 'waiting…'}
              {status === 'connected' && 'connected'}
              {status === 'disconnected' && 'disconnected'}
            </span>
          </div>
        </div>
        <div className="text-xs text-slate-400">
          Signal: <span className="text-slate-200">{signalUrl}</span>
          {signalConnected ? (
            <span className="ml-2 text-emerald-400">● connected</span>
          ) : (
            <span className="ml-2 text-amber-400">● not connected</span>
          )}
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 px-5 pb-10 lg:grid-cols-2">
        {/* Left: video + controls */}
        <div className="rounded-2xl border border-slate-800 bg-[#0b1220] p-4">
          <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
            <video
              ref={videoRef}
              playsInline
              autoPlay
              className="h-full w-full object-cover"
              muted={muted}
            />

            {connected ? (
              <div className="absolute left-3 top-3 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-200 ring-1 ring-emerald-500/30">
                LIVE
              </div>
            ) : (
              <div className="absolute inset-0 grid place-items-center">
                <div className="flex flex-col items-center gap-3 rounded-xl bg-slate-950/60 px-4 py-3 ring-1 ring-slate-800">
                  {status === 'creating' && (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300/20 border-t-slate-200" />
                      <span className="text-sm text-slate-200">
                        Creating room…
                      </span>
                    </>
                  )}
                  {status === 'waiting' && (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300/20 border-t-slate-200" />
                      <span className="text-sm text-slate-200">
                        Waiting for phone…
                      </span>
                    </>
                  )}
                  {status === 'disconnected' && (
                    <>
                      <span className="text-sm text-slate-200">No stream</span>
                      {createError && (
                        <span className="max-w-xs text-center text-xs text-rose-300">
                          {createError}. Check that the signal server is running
                          at the URL below.
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-300">
                  Quality
                </span>
                {(['360p', '720p', '1080p'] as const).map((q) => (
                  <button
                    key={q}
                    onClick={() => emitQuality(q)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 transition ${
                      selectedQuality === q
                        ? 'bg-slate-200 text-slate-950 ring-slate-200'
                        : 'bg-slate-950/30 text-slate-200 ring-slate-800 hover:ring-slate-700'
                    }`}
                    disabled={!roomId || status === 'creating'}
                  >
                    {q}
                  </button>
                ))}
              </div>

              <button
                onClick={emitFlipCamera}
                className="rounded-lg bg-slate-950/30 px-3 py-1.5 text-xs font-semibold text-slate-200 ring-1 ring-slate-800 transition hover:ring-slate-700 disabled:opacity-50"
                disabled={!roomId || status !== 'connected'}
              >
                Flip Camera
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setMuted((m) => !m)}
                className={`rounded-lg px-3 py-2 text-sm font-semibold ring-1 transition ${
                  muted
                    ? 'bg-amber-500/15 text-amber-200 ring-amber-500/30'
                    : 'bg-slate-950/30 text-slate-200 ring-slate-800 hover:ring-slate-700'
                }`}
              >
                {muted ? 'Unmute Audio' : 'Mute Audio'}
              </button>

              <button
                onClick={cleanup}
                className="rounded-lg bg-rose-500/15 px-3 py-2 text-sm font-semibold text-rose-200 ring-1 ring-rose-500/30 transition hover:bg-rose-500/20"
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>

        {/* Right: QR + instructions */}
        <aside className="rounded-2xl border border-slate-800 bg-[#0b1220] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-slate-100">
                Scan to connect
              </div>
              <div className="mt-1 text-xs text-slate-400">
                Open on your phone (same Wi‑Fi).
              </div>
            </div>
            <div className="rounded-lg bg-slate-950/30 px-3 py-1.5 text-xs font-semibold text-slate-200 ring-1 ring-slate-800">
              Room: <span className="tracking-widest">{roomId || '—'}</span>
            </div>
          </div>

          <div className="mt-4 grid place-items-center rounded-xl bg-slate-950/30 p-4 ring-1 ring-slate-800">
            {qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrDataUrl}
                alt="QR code"
                className="h-64 w-64 rounded-lg"
              />
            ) : (
              <div className="h-64 w-64 animate-pulse rounded-lg bg-slate-800/40" />
            )}
          </div>

          <div className="mt-4">
            <div className="text-xs font-semibold text-slate-300">
              Mobile URL
            </div>
            <div className="mt-1 flex items-center gap-2">
              <input
                value={mobileUrl}
                readOnly
                className="w-full rounded-lg border border-slate-800 bg-slate-950/30 px-3 py-2 text-xs text-slate-200 outline-none"
              />
              <button
                onClick={copyMobileUrl}
                className="shrink-0 rounded-lg bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-white disabled:opacity-50"
                disabled={!mobileUrl}
              >
                {copyState === 'copied' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              If the phone can’t connect, set{' '}
              <span className="text-slate-300">NEXT_PUBLIC_SIGNAL_URL</span> to
              your laptop’s LAN IP (not localhost).
            </div>
          </div>

          {status === 'waiting' && (
            <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
              <strong>Phone open but still waiting?</strong> Laptop and phone
              must use the <em>same</em> Signal URL. With ngrok: set{' '}
              <code className="rounded bg-slate-800 px-1">
                NEXT_PUBLIC_SIGNAL_URL
              </code>{' '}
              in{' '}
              <code className="rounded bg-slate-800 px-1">
                nextjs-app/.env.local
              </code>{' '}
              to your <strong>signal</strong> tunnel URL (port 3001), restart{' '}
              <code className="rounded bg-slate-800 px-1">npm run dev</code>,
              then reload this page.
            </div>
          )}
          <div className="mt-5">
            <div className="text-sm font-semibold text-slate-100">
              How to use
            </div>
            <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-slate-300">
              <li>Run the signaling server on your laptop.</li>
              <li>Open this page on the laptop browser.</li>
              <li>Scan the QR code on your phone.</li>
              <li>Keep the mobile page open. You should see LIVE here.</li>
            </ol>
          </div>
        </aside>
      </section>
    </main>
  );
}
