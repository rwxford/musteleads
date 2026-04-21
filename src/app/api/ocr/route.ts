import { NextRequest, NextResponse } from 'next/server';

// Simple in-memory rate limit: max 20 requests per minute per IP.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT;
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Try again in a minute.' },
      { status: 429 },
    );
  }

  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'OCR service not configured. Set GOOGLE_CLOUD_VISION_API_KEY.' },
      { status: 503 },
    );
  }

  let body: { image?: string; mode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { image, mode } = body;
  if (!image || typeof image !== 'string') {
    return NextResponse.json(
      { error: 'Missing required field: image (base64 string).' },
      { status: 400 },
    );
  }

  // Strip data URL prefix if present (e.g., "data:image/jpeg;base64,").
  const base64Content = image.includes(',') ? image.split(',')[1] : image;

  try {
    const t0 = Date.now();

    const visionResponse = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { content: base64Content },
              features: [{ type: 'TEXT_DETECTION', maxResults: 50 }],
            },
          ],
        }),
      },
    );

    if (!visionResponse.ok) {
      const errorData = await visionResponse.json().catch(() => ({}));
      console.error('[/api/ocr] Cloud Vision API error:', errorData);
      return NextResponse.json(
        { error: 'Cloud Vision API request failed.', details: errorData },
        { status: 502 },
      );
    }

    const data = await visionResponse.json();
    const processingTimeMs = Date.now() - t0;

    const response = data.responses?.[0];
    if (!response) {
      return NextResponse.json({
        text: '',
        annotations: [],
        blocks: [],
        confidence: 0,
        processingTimeMs,
        mode: mode || 'unknown',
      });
    }

    // Check for Vision API errors in the response.
    if (response.error) {
      return NextResponse.json(
        { error: 'Cloud Vision processing error.', details: response.error },
        { status: 502 },
      );
    }

    // Extract text annotations.
    const textAnnotations = response.textAnnotations || [];
    const fullText = textAnnotations[0]?.description || '';

    // Extract word-level annotations with bounding boxes.
    const wordAnnotations = textAnnotations.slice(1).map(
      (ann: {
        description: string;
        boundingPoly?: {
          vertices: Array<{ x?: number; y?: number }>;
        };
      }) => ({
        text: ann.description,
        boundingBox: ann.boundingPoly?.vertices || [],
      }),
    );

    // Extract structured blocks with confidence from fullTextAnnotation.
    const blocks: Array<{
      text: string;
      confidence: number;
      boundingBox: Array<{ x: number; y: number }>;
      height: number;
    }> = [];

    const fullTextAnnotation = response.fullTextAnnotation;
    if (fullTextAnnotation?.pages?.[0]?.blocks) {
      for (const block of fullTextAnnotation.pages[0].blocks) {
        const blockText = block.paragraphs
          ?.map((p: { words?: Array<{ symbols?: Array<{ text: string }> }> }) =>
            p.words
              ?.map((w: { symbols?: Array<{ text: string }> }) =>
                w.symbols?.map((s: { text: string }) => s.text).join('') || '',
              )
              .join(' ') || '',
          )
          .join('\n') || '';

        const vertices = block.boundingBox?.vertices || [];
        const wordConfidences: number[] = [];
        if (block.paragraphs) {
          for (const p of block.paragraphs) {
            if (p.words) {
              for (const w of p.words) {
                if (typeof w.confidence === 'number') {
                  wordConfidences.push(w.confidence);
                }
              }
            }
          }
        }
        const avgConfidence =
          wordConfidences.length > 0
            ? wordConfidences.reduce((a: number, b: number) => a + b, 0) / wordConfidences.length
            : 0;

        // Calculate block height from bounding box.
        const ys = vertices
          .map((v: { y?: number }) => v.y ?? 0)
          .filter((y: number) => y > 0);
        const height =
          ys.length >= 2 ? Math.max(...ys) - Math.min(...ys) : 0;

        blocks.push({
          text: blockText,
          confidence: avgConfidence,
          boundingBox: vertices,
          height,
        });
      }
    }

    // Overall confidence: average of all block confidences.
    const overallConfidence =
      blocks.length > 0
        ? (blocks.reduce((sum, b) => sum + b.confidence, 0) / blocks.length) * 100
        : 0;

    return NextResponse.json({
      text: fullText,
      annotations: wordAnnotations,
      blocks,
      confidence: Math.round(overallConfidence * 10) / 10,
      processingTimeMs,
      mode: mode || 'unknown',
    });
  } catch (err) {
    console.error('[/api/ocr] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error during OCR processing.' },
      { status: 500 },
    );
  }
}
