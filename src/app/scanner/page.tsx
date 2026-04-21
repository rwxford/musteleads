'use client';

import { useState, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { processQRData } from '@/scanner/QRProcessor';
import { processCardImage } from '@/scanner/CardOCRProcessor';
import { processBadgeImage } from '@/scanner/BadgeOCRFallback';
import { traceStart, traceRawImage, traceEnd } from '@/scanner/DebugTrace';
import CameraView from '@/components/CameraView';
import CardCaptureView from '@/components/CardCaptureView';
import ScanModeToggle from '@/components/ScanModeToggle';

type ScanStatus = 'idle' | 'processing' | 'needs-ocr' | 'badge-photo';

function ScannerPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMode = searchParams.get('mode') === 'card' ? 'card' : 'badge';

  const [mode, setMode] = useState<'badge' | 'card'>(initialMode);
  const [banner, setBanner] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<ScanStatus>('idle');
  const [ocrConfidence, setOcrConfidence] = useState<number | null>(null);
  const [ocrEngine, setOcrEngine] = useState<string | null>(null);

  // Prevent double-processing while navigating.
  const processingRef = useRef(false);

  // Badge QR scan handler.
  const handleQRScan = useCallback(
    (decodedText: string) => {
      if (processingRef.current) return;
      processingRef.current = true;

      // Haptic feedback on successful scan.
      try {
        if (navigator.vibrate) navigator.vibrate(200);
      } catch { /* ignore */ }

      const result = processQRData(decodedText);

      if (result.contact && !result.needsOCR) {
        try {
          sessionStorage.setItem(
            'musteleads:scan-result',
            JSON.stringify({
              contact: result.contact,
              rawQRData: result.rawData,
              type: result.type,
              source: 'badge_qr',
              ocrEngine: 'none',
              ocrConfidence: 100,
            }),
          );
        } catch { /* sessionStorage may be unavailable */ }
        router.push('/review');
      } else {
        // QR unreadable or encrypted — auto-trigger badge OCR.
        setBanner('QR code detected but encrypted — capturing badge text...');
        setScanStatus('badge-photo');
        processingRef.current = false;
      }
    },
    [router],
  );

  const handleQRError = useCallback((error: string) => {
    console.warn('[ScannerPage] QR error:', error);
  }, []);

  // Badge OCR fallback.
  const handleBadgeOCR = useCallback(
    async (imageBlob: Blob) => {
      setScanStatus('processing');
      setBanner(null);

      traceStart('badge_photo');
      try {
        const reader = new FileReader();
        reader.onloadend = () => traceRawImage(reader.result as string);
        reader.readAsDataURL(imageBlob);
      } catch { /* non-critical */ }

      const result = await processBadgeImage(imageBlob);
      setOcrConfidence(result.confidence);
      setOcrEngine(result.engine);
      traceEnd();

      import('@/lib/serverSync').then(m =>
        m.serverLog('info', 'Badge OCR scan completed', {
          mode: 'badge_photo',
          confidence: result.confidence,
          engine: result.engine,
        }),
      ).catch(() => {});

      try {
        sessionStorage.setItem(
          'musteleads:scan-result',
          JSON.stringify({
            contact: result.contact,
            rawOCRText: result.rawText,
            ocrConfidence: result.confidence,
            ocrEngine: result.engine,
            eventName: result.eventName,
            source: 'badge_ocr',
          }),
        );
      } catch { /* sessionStorage may be unavailable */ }
      router.push('/review');
    },
    [router],
  );

  // Business card capture + OCR.
  const handleCardCapture = useCallback(
    async (imageBlob: Blob) => {
      setScanStatus('processing');
      setBanner(null);

      traceStart('business_card');
      try {
        const reader = new FileReader();
        reader.onloadend = () => traceRawImage(reader.result as string);
        reader.readAsDataURL(imageBlob);
      } catch { /* non-critical */ }

      const result = await processCardImage(imageBlob);
      setOcrConfidence(result.confidence);
      setOcrEngine(result.engine);
      traceEnd();

      import('@/lib/serverSync').then(m =>
        m.serverLog('info', 'Card OCR scan completed', {
          mode: 'business_card',
          confidence: result.confidence,
          engine: result.engine,
        }),
      ).catch(() => {});

      try {
        sessionStorage.setItem(
          'musteleads:scan-result',
          JSON.stringify({
            contact: result.contact,
            rawOCRText: result.rawText,
            ocrConfidence: result.confidence,
            ocrEngine: result.engine,
            eventName: result.eventName,
            source: 'card_ocr',
          }),
        );
      } catch { /* sessionStorage may be unavailable */ }
      router.push('/review');
    },
    [router],
  );

  // Mode switching.
  const handleModeChange = useCallback((newMode: 'badge' | 'card') => {
    processingRef.current = false;
    setBanner(null);
    setScanStatus('idle');
    setOcrConfidence(null);
    setOcrEngine(null);
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

      {/* Processing overlay. */}
      {scanStatus === 'processing' && (
        <div className="w-full max-w-md rounded-xl bg-zinc-800 px-4 py-4 text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          <p className="text-sm text-white/80">
            {navigator.onLine ? 'Processing with Cloud OCR...' : 'Processing offline with Tesseract...'}
          </p>
          <p className="mt-1 text-xs text-white/40">This may take a few seconds.</p>
        </div>
      )}

      {/* OCR confidence indicator. */}
      {ocrConfidence !== null && scanStatus !== 'processing' && (
        <div className="flex items-center gap-2 rounded-full bg-zinc-800 px-3 py-1 text-xs text-white/60">
          <span className={`inline-block h-2 w-2 rounded-full ${
            ocrConfidence >= 90 ? 'bg-green-500' :
            ocrConfidence >= 70 ? 'bg-yellow-500' : 'bg-red-500'
          }`} />
          <span>{ocrEngine === 'cloud-vision' ? 'Cloud' : 'Offline'} OCR: {Math.round(ocrConfidence)}%</span>
        </div>
      )}

      <div className="w-full max-w-md">
        {mode === 'badge' ? (
          scanStatus === 'needs-ocr' || scanStatus === 'badge-photo' ? (
            <div className="flex flex-col items-center gap-4">
              <div className="w-full rounded-xl bg-zinc-800 px-4 py-3 text-center text-sm text-white/80">
                {scanStatus === 'needs-ocr'
                  ? 'QR unreadable — scan badge text with OCR instead.'
                  : 'Take a photo of the badge face.'}
              </div>
              <CardCaptureView
                isActive
                onCapture={handleBadgeOCR}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <CameraView
                isActive={mode === 'badge' && scanStatus === 'idle'}
                onScanSuccess={handleQRScan}
                onScanError={handleQRError}
              />
              <button
                onClick={() => setScanStatus('badge-photo')}
                className="rounded-full border border-white/20 px-5 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/10"
              >
                No QR code? Tap to photograph badge
              </button>
            </div>
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
          ? scanStatus === 'needs-ocr' || scanStatus === 'badge-photo'
            ? 'Take a photo of the badge face so OCR can read the text.'
            : 'Point your camera at a badge QR code to scan.'
          : 'Align the business card inside the frame and tap Capture.'}
      </p>
    </div>
  );
}

export default function ScannerPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen text-white">Loading...</div>}>
      <ScannerPageContent />
    </Suspense>
  );
}
