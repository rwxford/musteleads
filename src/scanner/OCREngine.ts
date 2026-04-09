/**
 * Shared Tesseract.js wrapper used by both business card and badge
 * OCR. Lazily initializes a single worker on first use and caches
 * it for subsequent recognitions.
 */

import type { Worker } from 'tesseract.js';

export interface OCRResult {
  text: string;
  confidence: number;
  lines: string[];
}

const EMPTY_RESULT: OCRResult = { text: '', confidence: 0, lines: [] };

let workerInstance: Worker | null = null;
let workerInitPromise: Promise<Worker> | null = null;

/**
 * Return the cached worker, creating it on the first call.
 * Uses a dynamic import to avoid pulling WASM into the SSR bundle.
 */
async function getWorker(): Promise<Worker> {
  if (workerInstance) {
    return workerInstance;
  }

  // Prevent multiple concurrent initializations.
  if (workerInitPromise) {
    return workerInitPromise;
  }

  workerInitPromise = (async () => {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng');
    workerInstance = worker;
    return worker;
  })();

  try {
    return await workerInitPromise;
  } catch (err) {
    // Reset so the next call can retry.
    workerInitPromise = null;
    throw err;
  }
}

/**
 * Convert a Blob to a data-URL string that Tesseract can consume.
 */
function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read image blob.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Run OCR on an image source (Blob or data-URL / object-URL string).
 * Returns structured text, confidence, and individual lines.
 * Never throws — returns an empty result on failure.
 */
export async function recognizeImage(
  imageSource: Blob | string,
): Promise<OCRResult> {
  try {
    const worker = await getWorker();

    const input =
      imageSource instanceof Blob
        ? await blobToDataURL(imageSource)
        : imageSource;

    const { data } = await worker.recognize(input);

    const text = (data.text ?? '').trim();
    const lines = text
      .split('\n')
      .map((l: string) => l.trim())
      .filter(Boolean);

    return {
      text,
      confidence: data.confidence ?? 0,
      lines,
    };
  } catch (err) {
    console.error('[OCREngine] Recognition failed:', err);
    return EMPTY_RESULT;
  }
}

/**
 * Terminate the cached worker and release resources. Safe to call
 * even if the worker was never created.
 */
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
