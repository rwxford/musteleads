/**
 * Client-side wrapper for the /api/ocr endpoint which proxies
 * requests to Google Cloud Vision API. Returns results in a
 * format compatible with the existing OCR pipeline.
 */

import type { OCRResult } from './OCREngine';

export interface CloudVisionBlock {
  text: string;
  confidence: number;
  boundingBox: Array<{ x: number; y: number }>;
  height: number;
}

export interface CloudVisionResponse {
  text: string;
  annotations: Array<{ text: string; boundingBox: Array<{ x: number; y: number }> }>;
  blocks: CloudVisionBlock[];
  confidence: number;
  processingTimeMs: number;
  mode: string;
}

/**
 * Send an image to the Cloud Vision API via our server proxy.
 * Returns an OCRResult compatible with the existing pipeline,
 * plus the raw Cloud Vision response for spatial analysis.
 *
 * Throws on network error or if the server returns an error.
 */
export async function cloudVisionOCR(
  base64Image: string,
  mode: 'badge' | 'card',
): Promise<{ ocrResult: OCRResult; cloudResponse: CloudVisionResponse }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch('/api/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64Image, mode }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(
        errorData.error || `OCR API returned ${res.status}`,
      );
    }

    const cloudResponse: CloudVisionResponse = await res.json();

    const text = cloudResponse.text || '';
    const lines = text
      .split('\n')
      .map((l: string) => l.trim())
      .filter(Boolean);

    const ocrResult: OCRResult = {
      text,
      confidence: cloudResponse.confidence,
      lines,
    };

    return { ocrResult, cloudResponse };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Check if the Cloud Vision API is available by looking at
 * network status. Does not make a request.
 */
export function isCloudVisionAvailable(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine;
}
