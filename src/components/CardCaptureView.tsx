'use client';

import { useRef, useState, useCallback, useEffect } from 'react';

interface CardCaptureViewProps {
  onCapture: (imageBlob: Blob) => void;
  isActive: boolean;
}

type CaptureStatus = 'idle' | 'loading' | 'streaming' | 'preview' | 'permission-denied' | 'error';

// Business card aspect ratio: 85.6mm × 53.98mm ≈ 1.586:1.
const CARD_ASPECT = 85.6 / 53.98;

export default function CardCaptureView({ onCapture, isActive }: CardCaptureViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CaptureStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Start / stop the camera based on isActive.
  useEffect(() => {
    if (!isActive) {
      stopStream();
      setStatus('idle');
      setPreviewUrl(null);
      return;
    }

    let cancelled = false;

    const startCamera = async () => {
      setStatus('loading');
      setErrorMessage('');

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        if (!cancelled) {
          setStatus('streaming');
        }
      } catch (err: unknown) {
        if (cancelled) return;

        const message = err instanceof Error ? err.message : String(err);

        if (
          message.toLowerCase().includes('permission') ||
          message.toLowerCase().includes('notallowederror')
        ) {
          setStatus('permission-denied');
          setErrorMessage(
            'Camera permission was denied. Please allow camera access in your browser settings.',
          );
        } else {
          setStatus('error');
          setErrorMessage(message);
        }
      }
    };

    startCamera();

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [isActive, stopStream]);

  // Clean up on unmount.
  useEffect(() => {
    return () => {
      stopStream();
    };
  }, [stopStream]);

  // Revoke preview object URL on cleanup.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    // Use the video's actual resolution (not the CSS display
    // size) so OCR gets the highest quality input available.
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        setStatus('preview');
        onCapture(blob);
      },
      'image/jpeg',
      0.92,
    );
  }, [onCapture]);

  const handleRetake = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setStatus('streaming');
  }, [previewUrl]);

  // ── Permission denied ──
  if (status === 'permission-denied') {
    return (
      <div className="relative w-full overflow-hidden rounded-2xl bg-zinc-900" style={{ aspectRatio: '16/9' }}>
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/40">
            <path d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
          <p className="text-sm text-white/60">{errorMessage}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-black"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ── Generic error ──
  if (status === 'error') {
    return (
      <div className="relative w-full overflow-hidden rounded-2xl bg-zinc-900" style={{ aspectRatio: '16/9' }}>
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-400">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          <p className="text-sm text-white/60">{errorMessage || 'Camera is not available.'}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-black"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ── Preview after capture ──
  if (status === 'preview' && previewUrl) {
    return (
      <div className="flex w-full flex-col items-center gap-4">
        <div className="relative w-full overflow-hidden rounded-2xl bg-zinc-900" style={{ aspectRatio: '16/9' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="Captured card" className="h-full w-full object-cover" />
        </div>
        <button
          onClick={handleRetake}
          className="rounded-full border border-white/20 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10"
        >
          Retake
        </button>
      </div>
    );
  }

  // ── Live camera feed ──
  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div className="relative w-full overflow-hidden rounded-2xl bg-zinc-900" style={{ aspectRatio: '16/9' }}>
        <video
          ref={videoRef}
          playsInline
          muted
          className="h-full w-full object-cover"
        />

        {/* Card-shaped guide overlay. */}
        {status === 'streaming' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              className="rounded-lg border-2 border-white/60"
              style={{
                width: '80%',
                aspectRatio: `${CARD_ASPECT}`,
              }}
            />
          </div>
        )}

        {/* Loading overlay. */}
        {status === 'loading' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/80">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            <p className="text-sm text-white/60">Starting camera…</p>
          </div>
        )}

        {/* Off-screen canvas for frame capture. */}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {status === 'streaming' && (
        <button
          onClick={handleCapture}
          className="rounded-full bg-white px-8 py-3 text-sm font-semibold text-black transition-transform active:scale-95"
        >
          Capture
        </button>
      )}
    </div>
  );
}
