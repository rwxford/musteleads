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
 *
 * No PSM override — let Tesseract auto-detect page segmentation.
 * No manual rotation — let Tesseract handle it with rotateAuto.
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

    // Let Tesseract auto-detect page segmentation mode (default).
    // Do NOT set PSM — the default auto mode handles varied layouts
    // better than forcing SINGLE_BLOCK on badge/card images.

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

/** Minimum width (px) for good OCR accuracy. */
const MIN_OCR_WIDTH = 1500;

/**
 * Gentle image pre-processing for OCR: grayscale + mild contrast.
 *
 * NO binarization — threshold binarization destroys text on badges
 * with varying lighting, plastic holders, and gray-on-white text.
 *
 * NO manual rotation — Tesseract's built-in rotateAuto handles it.
 */
export async function preprocessImage(
  imageSource: Blob | string,
): Promise<string> {
  const dataUrl =
    imageSource instanceof Blob
      ? await blobToDataURL(imageSource)
      : imageSource;

  // Load image into an offscreen element.
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () =>
      reject(new Error('Failed to load image for preprocessing.'));
    el.src = dataUrl;
  });

  // Determine output dimensions — upscale small images.
  let width = img.naturalWidth;
  let height = img.naturalHeight;
  if (width < MIN_OCR_WIDTH) {
    const scale = MIN_OCR_WIDTH / width;
    width = MIN_OCR_WIDTH;
    height = Math.round(height * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return dataUrl;
  }

  // Draw original image (possibly upscaled).
  ctx.drawImage(img, 0, 0, width, height);

  // Get pixel data and apply gentle processing.
  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;

  // Contrast factor: 1.2 (gentle). Previous 1.5 was too aggressive.
  const contrastFactor = 1.2;

  for (let i = 0; i < data.length; i += 4) {
    // Grayscale (luminosity method).
    const gray =
      data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;

    // Mild contrast boost only. NO binarization.
    const adjusted = Math.min(
      255,
      Math.max(0, (gray - 128) * contrastFactor + 128),
    );

    data[i] = adjusted;
    data[i + 1] = adjusted;
    data[i + 2] = adjusted;
  }

  ctx.putImageData(imageData, 0, 0);

  return canvas.toDataURL('image/png');
}

/**
 * Run OCR on an image source (Blob or data-URL / object-URL string).
 * Returns structured text, confidence, and individual lines.
 * Never throws — returns an empty result on failure.
 *
 * Uses Tesseract's built-in auto-rotation instead of manual rotation
 * attempts which produced worse results.
 */
export async function recognizeImage(
  imageSource: Blob | string,
): Promise<OCRResult> {
  try {
    const worker = await getWorker();

    // Gentle pre-processing: grayscale + mild contrast + upscale.
    const processed = await preprocessImage(imageSource);

    // Let Tesseract handle rotation detection internally.
    const { data } = await worker.recognize(processed, {
      rotateAuto: true,
    });

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
