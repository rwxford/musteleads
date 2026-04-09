'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { processQRData } from '@/scanner/QRProcessor';
import CameraView from '@/components/CameraView';
import CardCaptureView from '@/components/CardCaptureView';
import ScanModeToggle from '@/components/ScanModeToggle';

export default function ScannerPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'badge' | 'card'>('badge');
  const [banner, setBanner] = useState<string | null>(null);

  // Prevent double-processing while navigating.
  const processingRef = useRef(false);

  const handleQRScan = useCallback(
    (decodedText: string) => {
      if (processingRef.current) return;
      processingRef.current = true;

      const result = processQRData(decodedText);

      if (result.contact && !result.needsOCR) {
        // Store the scanned data so the review page can read it.
        try {
          sessionStorage.setItem(
            'musteleads:scan-result',
            JSON.stringify({
              contact: result.contact,
              rawQRData: result.rawData,
              type: result.type,
              source: 'badge_qr',
            }),
          );
        } catch {
          // sessionStorage may be unavailable; proceed anyway.
        }
        router.push('/review');
      } else {
        setBanner('Could not decode QR. Try OCR or manual entry.');
        // Allow another scan attempt after a short delay.
        setTimeout(() => {
          processingRef.current = false;
          setBanner(null);
        }, 3000);
      }
    },
    [router],
  );

  const handleQRError = useCallback((error: string) => {
    // Only surface meaningful errors — frame-level decode misses
    // are filtered by CameraView already.
    console.warn('[ScannerPage] QR error:', error);
  }, []);

  const handleCardCapture = useCallback(
    (imageBlob: Blob) => {
      // Convert the Blob to a base64 data URL so it survives
      // sessionStorage (Blobs are not serializable).
      const reader = new FileReader();
      reader.onloadend = () => {
        try {
          sessionStorage.setItem(
            'musteleads:scan-result',
            JSON.stringify({
              cardImageDataUrl: reader.result,
              source: 'business_card',
            }),
          );
        } catch {
          // sessionStorage may be unavailable.
        }
        router.push('/review');
      };
      reader.readAsDataURL(imageBlob);
    },
    [router],
  );

  const handleModeChange = useCallback((newMode: 'badge' | 'card') => {
    processingRef.current = false;
    setBanner(null);
    setMode(newMode);
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center gap-6 px-4 pt-6">
      <ScanModeToggle mode={mode} onModeChange={handleModeChange} />

      {/* Error / info banner. */}
      {banner && (
        <div className="w-full max-w-md rounded-xl bg-zinc-800 px-4 py-3 text-center text-sm text-white/80">
          {banner}
        </div>
      )}

      <div className="w-full max-w-md">
        {mode === 'badge' ? (
          <CameraView
            isActive={mode === 'badge'}
            onScanSuccess={handleQRScan}
            onScanError={handleQRError}
          />
        ) : (
          <CardCaptureView
            isActive={mode === 'card'}
            onCapture={handleCardCapture}
          />
        )}
      </div>

      <p className="max-w-xs text-center text-xs text-white/30">
        {mode === 'badge'
          ? 'Point your camera at a badge QR code to scan.'
          : 'Align the business card inside the frame and tap Capture.'}
      </p>
    </div>
  );
}
