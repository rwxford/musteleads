/**
 * Shared Tesseract.js wrapper used by both business card and badge
 * OCR. Lazily initializes a single worker on first use and caches
 * it for subsequent recognitions.
 */

import type { Worker } from 'tesseract.js';
import { PSM } from 'tesseract.js';

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

    // PSM 6: assume a single uniform block of text. This works
    // much better for badges and business cards than the default
    // auto-segmentation mode.
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
    });

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
 * Pre-process an image for OCR: grayscale, contrast boost,
 * threshold binarization, and upscale if too small. Returns a
 * data-URL of the processed canvas.
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
    el.onerror = () => reject(new Error('Failed to load image for preprocessing.'));
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
    // Fallback: return the original data-URL unchanged.
    return dataUrl;
  }

  // Draw original image (possibly upscaled).
  ctx.drawImage(img, 0, 0, width, height);

  // Get pixel data and apply processing pipeline.
  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;

  for (let i = 0; i < data.length; i += 4) {
    // 1. Grayscale (luminosity method).
    const gray =
      data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;

    // 2. Contrast boost: value = ((value - 128) * 1.5) + 128.
    const contrasted = Math.min(
      255,
      Math.max(0, (gray - 128) * 1.5 + 128),
    );

    // 3. Threshold binarization — eliminates glare and noise.
    const final = contrasted > 128 ? 255 : 0;

    data[i] = final;
    data[i + 1] = final;
    data[i + 2] = final;
    // Alpha channel (data[i+3]) stays unchanged.
  }

  ctx.putImageData(imageData, 0, 0);

  return canvas.toDataURL('image/png');
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

    // Pre-process for better recognition on badges and glossy cards.
    const processed = await preprocessImage(imageSource);

    const { data } = await worker.recognize(processed);

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
 * Create a new canvas rotated by the given degrees (90, 180, 270).
 * Returns the rotated canvas.
 */
export function rotateCanvas(
  canvas: HTMLCanvasElement,
  degrees: number,
): HTMLCanvasElement {
  const rotated = document.createElement('canvas');
  const ctx = rotated.getContext('2d');
  if (!ctx) return canvas;

  const radians = (degrees * Math.PI) / 180;

  if (degrees === 90 || degrees === 270) {
    rotated.width = canvas.height;
    rotated.height = canvas.width;
  } else {
    rotated.width = canvas.width;
    rotated.height = canvas.height;
  }

  ctx.translate(rotated.width / 2, rotated.height / 2);
  ctx.rotate(radians);
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);

  return rotated;
}

/**
 * Run OCR with automatic rotation detection. Tries 0° first,
 * then 90° and 270° if confidence is below 60%. Returns the
 * result with the highest confidence.
 */
export async function recognizeWithAutoRotate(
  imageSource: Blob | string,
): Promise<OCRResult> {
  try {
    const worker = await getWorker();

    // Pre-process once and load into a canvas for rotation.
    const processed = await preprocessImage(imageSource);

    // Helper: run OCR on a data-URL and return the result.
    const runOCR = async (dataUrl: string): Promise<OCRResult> => {
      const { data } = await worker.recognize(dataUrl);
      const text = (data.text ?? '').trim();
      const lines = text
        .split('\n')
        .map((l: string) => l.trim())
        .filter(Boolean);
      return { text, confidence: data.confidence ?? 0, lines };
    };

    // Try 0° rotation first.
    const result0 = await runOCR(processed);
    if (result0.confidence >= 60) {
      return result0;
    }

    // Load the processed image into a canvas for rotation.
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Failed to load processed image.'));
      el.src = processed;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return result0;
    ctx.drawImage(img, 0, 0);

    let best = result0;

    // Try 90° rotation (landscape badges).
    const canvas90 = rotateCanvas(canvas, 90);
    const result90 = await runOCR(canvas90.toDataURL('image/png'));
    if (result90.confidence > best.confidence) {
      best = result90;
    }
    if (best.confidence >= 60) {
      return best;
    }

    // Try 270° rotation.
    const canvas270 = rotateCanvas(canvas, 270);
    const result270 = await runOCR(canvas270.toDataURL('image/png'));
    if (result270.confidence > best.confidence) {
      best = result270;
    }

    return best;
  } catch (err) {
    console.error('[OCREngine] recognizeWithAutoRotate failed:', err);
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
