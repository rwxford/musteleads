/**
 * Shared Tesseract.js wrapper used by both business card and badge
 * OCR. Lazily initializes a single worker on first use and caches
 * it for subsequent recognitions.
 */

import type { Worker } from 'tesseract.js';
import {
  isDebugEnabled,
  traceStep,
  tracePreprocessedImage,
  traceOCRResult,
} from './DebugTrace';

export interface OCRResult {
  text: string;
  confidence: number;
  lines: string[];
}

const EMPTY_RESULT: OCRResult = { text: '', confidence: 0, lines: [] };

let workerInstance: Worker | null = null;
let workerInitPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (workerInstance) {
    return workerInstance;
  }

  if (workerInitPromise) {
    return workerInitPromise;
  }

  workerInitPromise = (async () => {
    const debug = isDebugEnabled();
    if (debug) traceStep('tesseract_init_start', 'Loading Tesseract.js worker');

    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng');

    if (debug) traceStep('tesseract_init_done', 'Worker ready');

    workerInstance = worker;
    return worker;
  })();

  try {
    return await workerInitPromise;
  } catch (err) {
    workerInitPromise = null;
    throw err;
  }
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read image blob.'));
    reader.readAsDataURL(blob);
  });
}

const MIN_OCR_WIDTH = 1500;

/**
 * Gentle image pre-processing: grayscale + mild contrast + upscale.
 * NO binarization. NO manual rotation.
 */
export async function preprocessImage(
  imageSource: Blob | string,
): Promise<string> {
  const debug = isDebugEnabled();
  const dataUrl =
    imageSource instanceof Blob
      ? await blobToDataURL(imageSource)
      : imageSource;

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () =>
      reject(new Error('Failed to load image for preprocessing.'));
    el.src = dataUrl;
  });

  let width = img.naturalWidth;
  let height = img.naturalHeight;

  if (debug) {
    traceStep('preprocess_input', {
      originalWidth: img.naturalWidth,
      originalHeight: img.naturalHeight,
    });
  }

  if (width < MIN_OCR_WIDTH) {
    const scale = MIN_OCR_WIDTH / width;
    width = MIN_OCR_WIDTH;
    height = Math.round(height * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;

  ctx.drawImage(img, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;

  const contrastFactor = 1.2;

  for (let i = 0; i < data.length; i += 4) {
    const gray =
      data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    const adjusted = Math.min(
      255,
      Math.max(0, (gray - 128) * contrastFactor + 128),
    );
    data[i] = adjusted;
    data[i + 1] = adjusted;
    data[i + 2] = adjusted;
  }

  ctx.putImageData(imageData, 0, 0);

  const result = canvas.toDataURL('image/png');

  if (debug) {
    traceStep('preprocess_output', {
      outputWidth: width,
      outputHeight: height,
      contrastFactor,
    });
    tracePreprocessedImage(result);
  }

  return result;
}

/**
 * Run OCR on an image source. Uses Tesseract's built-in
 * auto-rotation. Never throws — returns empty result on failure.
 */
export async function recognizeImage(
  imageSource: Blob | string,
): Promise<OCRResult> {
  const debug = isDebugEnabled();

  try {
    const worker = await getWorker();

    if (debug) traceStep('ocr_start', 'Running Tesseract.recognize()');
    const t0 = Date.now();

    const processed = await preprocessImage(imageSource);

    const { data } = await worker.recognize(processed, {
      rotateAuto: true,
    });

    const text = (data.text ?? '').trim();
    const lines = text
      .split('\n')
      .map((l: string) => l.trim())
      .filter(Boolean);

    const result = {
      text,
      confidence: data.confidence ?? 0,
      lines,
    };

    if (debug) {
      traceStep('ocr_complete', {
        durationMs: Date.now() - t0,
        confidence: result.confidence,
        lineCount: lines.length,
      });
      traceOCRResult(text, result.confidence, lines);
    }

    return result;
  } catch (err) {
    console.error('[OCREngine] Recognition failed:', err);
    if (debug) traceStep('ocr_error', String(err));
    return EMPTY_RESULT;
  }
}

export async function terminateOCR(): Promise<void> {
  if (workerInstance) {
    try {
      await workerInstance.terminate();
    } catch {
      // Best-effort cleanup.
    }
    workerInstance = null;
  }
  workerInitPromise = null;
}
