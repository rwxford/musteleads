'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface CameraViewProps {
  onScanSuccess: (decodedText: string) => void;
  onScanError?: (error: string) => void;
  isActive: boolean;
}

type ScannerStatus = 'idle' | 'loading' | 'scanning' | 'permission-denied' | 'error';

const CAMERA_GRANT_KEY = 'musteleads_camera_granted';

export default function CameraView({ onScanSuccess, onScanError, isActive }: CameraViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // We store the Html5Qrcode instance in a ref so it persists across
  // renders without triggering re-render cycles.
  const scannerRef = useRef<import('html5-qrcode').Html5Qrcode | null>(null);
  const [status, setStatus] = useState<ScannerStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [flash, setFlash] = useState(false);

  // Stable callback ref so the scanner closure always calls the
  // latest version of onScanSuccess without restarting the scanner.
  const onScanSuccessRef = useRef(onScanSuccess);
  onScanSuccessRef.current = onScanSuccess;
  const onScanErrorRef = useRef(onScanError);
  onScanErrorRef.current = onScanError;

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    try {
      const state = scanner.getState();
      // Html5QrcodeScannerState: SCANNING = 2, PAUSED = 3
      if (state === 2 || state === 3) {
        await scanner.stop();
      }
    } catch {
      // Ignore stop errors — the scanner may already be stopped.
    }
  }, []);

  useEffect(() => {
    if (!isActive) {
      stopScanner().then(() => setStatus('idle'));
      return;
    }

    let cancelled = false;
    const readerId = 'musteleads-qr-reader';

    const startScanner = async () => {
      setStatus('loading');
      setErrorMessage('');

      // Check if camera permission is already granted so we can
      // skip any custom permission UI.
      try {
        const permissionStatus = await navigator.permissions.query({
          name: 'camera' as PermissionName,
        });
        if (permissionStatus.state === 'granted') {
          // Permission already granted — no need for custom UI.
        }
      } catch {
        // permissions.query may not be supported; continue normally.
      }

      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
        if (cancelled) return;

        // Reuse or create an instance. The element id must match the
        // rendered container div.
        if (!scannerRef.current) {
          scannerRef.current = new Html5Qrcode(readerId, {
            formatsToSupport: [
              Html5QrcodeSupportedFormats.QR_CODE,
              Html5QrcodeSupportedFormats.DATA_MATRIX,
              Html5QrcodeSupportedFormats.AZTEC,
              Html5QrcodeSupportedFormats.PDF_417,
            ],
            verbose: false,
          });
        }

        const scanner = scannerRef.current;

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
              const minDimension = Math.min(viewfinderWidth, viewfinderHeight);
              const size = Math.floor(minDimension * 0.7);
              return { width: size, height: size };
            },
          },
          (decodedText) => {
            // Trigger visual flash feedback.
            setFlash(true);
            setTimeout(() => setFlash(false), 300);
            onScanSuccessRef.current(decodedText);
          },
          (errorMsg) => {
            // html5-qrcode fires this on every frame that doesn't
            // decode — only forward genuine errors.
            if (
              onScanErrorRef.current &&
              !errorMsg.includes('No QR code found') &&
              !errorMsg.includes('NotFoundException')
            ) {
              onScanErrorRef.current(errorMsg);
            }
          },
        );

        if (!cancelled) {
          // Camera started successfully — persist grant flag.
          try {
            localStorage.setItem(CAMERA_GRANT_KEY, 'true');
          } catch {
            // localStorage may be unavailable.
          }
          setStatus('scanning');
        }
      } catch (err: unknown) {
        if (cancelled) return;

        const message = err instanceof Error ? err.message : String(err);

        if (
          message.toLowerCase().includes('permission') ||
          message.toLowerCase().includes('notallowederror')
        ) {
          setStatus('permission-denied');
          setErrorMessage('Camera permission was denied. Please allow camera access in your browser settings.');
        } else {
          setStatus('error');
          setErrorMessage(message);
        }

        onScanErrorRef.current?.(message);
      }
    };

    startScanner();

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [isActive, stopScanner]);

  // Clean up on unmount — only stop the scanner here, not on
  // re-renders.
  useEffect(() => {
    return () => {
      stopScanner();
      scannerRef.current = null;
    };
  }, [stopScanner]);

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

  return (
    <div className="relative w-full overflow-hidden rounded-2xl bg-zinc-900" style={{ aspectRatio: '16/9' }}>
      {/* html5-qrcode renders the video element inside this div. */}
      <div id="musteleads-qr-reader" ref={containerRef} className="h-full w-full" />

      {/* Loading overlay. */}
      {status === 'loading' && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/80">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          <p className="text-sm text-white/60">Starting camera…</p>
        </div>
      )}

      {/* Flash overlay on successful scan. */}
      {flash && (
        <div className="pointer-events-none absolute inset-0 z-20 animate-pulse bg-white/30" />
      )}
    </div>
  );
}
