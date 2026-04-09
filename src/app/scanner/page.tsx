'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { processQRData } from '@/scanner/QRProcessor';
import { processCardImage } from '@/scanner/CardOCRProcessor';
import { processBadgeImage } from '@/scanner/BadgeOCRFallback';
import CameraView from '@/components/CameraView';
import CardCaptureView from '@/components/CardCaptureView';
import ScanModeToggle from '@/components/ScanModeToggle';

type ScanStatus = 'idle' | 'processing' | 'needs-ocr';

export default function ScannerPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'badge' | 'card'>('badge');
  const [banner, setBanner] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<ScanStatus>('idle');
  const [ocrConfidence, setOcrConfidence] = useState<number | null>(null);

  // Prevent double-processing while navigating.
  const processingRef = useRef(false);

  // ── Badge QR scan handler ──────────────────────────────────────

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
        // QR unreadable — offer OCR fallback.
        setScanStatus('needs-ocr');
        setBanner(null);
        processingRef.current = false;
      }
    },
    [router],
  );

  const handleQRError = useCallback((error: string) => {
    // Only surface meaningful errors — frame-level decode misses
    // are filtered by CameraView already.
    console.warn('[ScannerPage] QR error:', error);
  }, []);

  // ── Badge OCR fallback ─────────────────────────────────────────

  const handleBadgeOCR = useCallback(
    async (imageBlob: Blob) => {
      setScanStatus('processing');
      setBanner(null);

      const result = await processBadgeImage(imageBlob);
      setOcrConfidence(result.confidence);

      try {
        sessionStorage.setItem(
          'musteleads:scan-result',
          JSON.stringify({
            contact: result.contact,
            rawOCRText: result.rawText,
            ocrConfidence: result.confidence,
            source: 'badge_qr',
          }),
        );
      } catch {
        // sessionStorage may be unavailable.
      }
      router.push('/review');
    },
    [router],
  );

  // ── Business card capture + OCR ────────────────────────────────

  const handleCardCapture = useCallback(
    async (imageBlob: Blob) => {
      setScanStatus('processing');
      setBanner(null);

      const result = await processCardImage(imageBlob);
      setOcrConfidence(result.confidence);

      try {
        sessionStorage.setItem(
          'musteleads:scan-result',
          JSON.stringify({
            contact: result.contact,
            rawOCRText: result.rawText,
            ocrConfidence: result.confidence,
            source: 'business_card',
          }),
        );
      } catch {
        // sessionStorage may be unavailable.
      }
      router.push('/review');
    },
    [router],
  );

  // ── Mode switching ─────────────────────────────────────────────

  const handleModeChange = useCallback((newMode: 'badge' | 'card') => {
    processingRef.current = false;
    setBanner(null);
    setScanStatus('idle');
    setOcrConfidence(null);
    setMode(newMode);
  }, []);

  // ── Rendering ──────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen flex-col items-center gap-6 px-4 pt-6">
      <ScanModeToggle mode={mode} onModeChange={handleModeChange} />

      {/* Error / info banner. */}
      {banner && (
        <div className="w-full max-w-md rounded-xl bg-zinc-800 px-4 py-3 text-center text-sm text-white/80">
          {banner}
        </div>
      )}

      {/* Processing overlay. */}
      {scanStatus === 'processing' && (
        <div className="w-full max-w-md rounded-xl bg-zinc-800 px-4 py-4 text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          <p className="text-sm text-white/80">Processing with OCR…</p>
          <p className="mt-1 text-xs text-white/40">This may take a few seconds.</p>
        </div>
      )}

      {/* OCR confidence indicator. */}
      {ocrConfidence !== null && scanStatus !== 'processing' && (
        <div className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-white/60">
          OCR: {Math.round(ocrConfidence)}% confident
        </div>
      )}

      <div className="w-full max-w-md">
        {mode === 'badge' ? (
          scanStatus === 'needs-ocr' ? (
            // Badge OCR fallback — capture badge face photo.
            <div className="flex flex-col items-center gap-4">
              <div className="w-full rounded-xl bg-zinc-800 px-4 py-3 text-center text-sm text-white/80">
                QR unreadable — scan badge text with OCR instead.
              </div>
              <CardCaptureView
                isActive
                onCapture={handleBadgeOCR}
              />
            </div>
          ) : (
            <CameraView
              isActive={mode === 'badge' && scanStatus === 'idle'}
              onScanSuccess={handleQRScan}
              onScanError={handleQRError}
            />
          )
        ) : (
          <CardCaptureView
            isActive={mode === 'card' && scanStatus !== 'processing'}
            onCapture={handleCardCapture}
          />
        )}
      </div>

      <p className="max-w-xs text-center text-xs text-white/30">
        {mode === 'badge'
          ? scanStatus === 'needs-ocr'
            ? 'Take a photo of the badge face so OCR can read the text.'
            : 'Point your camera at a badge QR code to scan.'
          : 'Align the business card inside the frame and tap Capture.'}
      </p>
    </div>
  );
}
