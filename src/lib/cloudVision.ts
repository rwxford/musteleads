/**
 * Shared Google Cloud Vision text detection. Used by both the
 * `/api/ocr` route (raw OCR for the offline-compatible path and
 * debug) and the `/api/extract` Pipeline A (Cloud Vision text then
 * LLM extraction).
 *
 * Keeps the Vision call in one place so request shape and parsing
 * do not drift between routes.
 */

export interface CloudVisionBlock {
  text: string;
  confidence: number;
  height: number;
}

export interface CloudVisionTextResult {
  text: string;
  /** Overall confidence, 0 to 100. */
  confidence: number;
  blocks: CloudVisionBlock[];
}

interface VisionVertex {
  x?: number;
  y?: number;
}

interface VisionWord {
  symbols?: Array<{ text: string }>;
  confidence?: number;
}

interface VisionParagraph {
  words?: VisionWord[];
}

interface VisionBlock {
  paragraphs?: VisionParagraph[];
  boundingBox?: { vertices?: VisionVertex[] };
}

/**
 * Run TEXT_DETECTION on a base64 image and return the full text,
 * an overall confidence, and per block summaries.
 *
 * Throws on network failure or a Vision API error so callers can
 * decide how to fall back.
 */
export async function cloudVisionDetectText(
  base64Image: string,
  apiKey: string,
): Promise<CloudVisionTextResult> {
  const base64Content = base64Image.includes(',')
    ? base64Image.split(',')[1]
    : base64Image;

  const res = await fetch(
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

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(
      `Cloud Vision request failed (${res.status}): ${JSON.stringify(errorData)}`,
    );
  }

  const data = await res.json();
  const response = data.responses?.[0];
  if (!response) {
    return { text: '', confidence: 0, blocks: [] };
  }
  if (response.error) {
    throw new Error(
      `Cloud Vision processing error: ${JSON.stringify(response.error)}`,
    );
  }

  const fullText: string = response.textAnnotations?.[0]?.description || '';

  const blocks: CloudVisionBlock[] = [];
  const visionBlocks: VisionBlock[] =
    response.fullTextAnnotation?.pages?.[0]?.blocks || [];

  for (const block of visionBlocks) {
    const blockText =
      block.paragraphs
        ?.map((p) =>
          (p.words || [])
            .map(
              (w) => (w.symbols || []).map((s) => s.text).join(''),
            )
            .join(' '),
        )
        .join('\n') || '';

    const confidences: number[] = [];
    for (const p of block.paragraphs || []) {
      for (const w of p.words || []) {
        if (typeof w.confidence === 'number') confidences.push(w.confidence);
      }
    }
    const avgConfidence =
      confidences.length > 0
        ? confidences.reduce((a, b) => a + b, 0) / confidences.length
        : 0;

    const ys = (block.boundingBox?.vertices || [])
      .map((v) => v.y ?? 0)
      .filter((y) => y > 0);
    const height = ys.length >= 2 ? Math.max(...ys) - Math.min(...ys) : 0;

    blocks.push({ text: blockText, confidence: avgConfidence, height });
  }

  const overallConfidence =
    blocks.length > 0
      ? (blocks.reduce((sum, b) => sum + b.confidence, 0) / blocks.length) * 100
      : 0;

  return {
    text: fullText,
    confidence: Math.round(overallConfidence * 10) / 10,
    blocks,
  };
}
