/**
 * OCR Router: automatically selects Cloud Vision API (when
 * online) or Tesseract.js (when offline) for OCR processing.
 *
 * Cloud Vision is the primary engine with ~98% accuracy.
 * Tesseract.js is the offline fallback with ~30-50% accuracy.
 */

import type { OCRResult } from './OCREngine';
import { cloudVisionOCR, isCloudVisionAvailable } from './CloudVisionOCR';
import type { CloudVisionResponse } from './CloudVisionOCR';
import { recognizeImage, preprocessImage } from './OCREngine';
import { isDebugEnabled, traceStep } from './DebugTrace';

export type OCREngine = 'cloud-vision' | 'tesseract';

export interface RouterOCRResult {
  ocrResult: OCRResult;
  engine: OCREngine;
  cloudResponse?: CloudVisionResponse;
}

/**
 * Run OCR on an image, automatically choosing the best available
 * engine. Tries Cloud Vision first when online, falls back to
 * Tesseract.js on failure or when offline.
 */
export async function performOCR(
  imageSource: Blob | string,
  mode: 'badge' | 'card',
): Promise<RouterOCRResult> {
  const debug = isDebugEnabled();

  // Convert Blob to base64 data URL if needed.
  let base64Image: string;
  if (imageSource instanceof Blob) {
    base64Image = await blobToDataURL(imageSource);
  } else {
    base64Image = imageSource;
  }

  // Try Cloud Vision first if online.
  if (isCloudVisionAvailable()) {
    try {
      if (debug) traceStep('ocr_router', 'Attempting Cloud Vision API');
      const { ocrResult, cloudResponse } = await cloudVisionOCR(base64Image, mode);

      if (debug) {
        traceStep('ocr_router_result', {
          engine: 'cloud-vision',
          confidence: ocrResult.confidence,
          lineCount: ocrResult.lines.length,
          processingTimeMs: cloudResponse.processingTimeMs,
        });
      }

      return { ocrResult, engine: 'cloud-vision', cloudResponse };
    } catch (err) {
      if (debug) {
        traceStep('ocr_router_cloud_failed', {
          error: err instanceof Error ? err.message : String(err),
          fallback: 'tesseract',
        });
      }
      console.warn('[OCRRouter] Cloud Vision failed, falling back to Tesseract:', err);
    }
  } else {
    if (debug) traceStep('ocr_router', 'Offline — using Tesseract.js');
  }

  // Fallback: Tesseract.js (offline OCR).
  if (debug) traceStep('ocr_router', 'Running Tesseract.js (offline fallback)');

  const ocrResult = await recognizeImage(imageSource);

  if (debug) {
    traceStep('ocr_router_result', {
      engine: 'tesseract',
      confidence: ocrResult.confidence,
      lineCount: ocrResult.lines.length,
    });
  }

  return { ocrResult, engine: 'tesseract' };
}

/**
 * Convert a Blob to a base64 data URL string.
 */
function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read blob as data URL'));
    reader.readAsDataURL(blob);
  });
}
