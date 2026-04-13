/**
 * Debug trace system for OCR pipeline. When debug mode is enabled,
 * captures every step: raw image, preprocessed image, Tesseract
 * output, line classification decisions, and final parsed result.
 *
 * Toggle via Settings page or URL param ?debug=true on /scanner.
 * Trace is stored in memory and displayed in a debug overlay.
 */

export interface TraceStep {
  timestamp: number;
  label: string;
  data: string | Record<string, unknown>;
}

export interface OCRTrace {
  id: string;
  startedAt: number;
  mode: 'badge_qr' | 'business_card' | 'badge_photo';
  steps: TraceStep[];
  rawImageDataUrl?: string;
  preprocessedImageDataUrl?: string;
  ocrRawText?: string;
  ocrConfidence?: number;
  ocrLines?: string[];
  cleanedLines?: string[];
  classificationLog?: string[];
  finalResult?: Record<string, unknown>;
  durationMs?: number;
}

const DEBUG_KEY = 'musteleads_debug';
const TRACE_HISTORY_KEY = 'musteleads_traces';
const MAX_TRACES = 10;

let currentTrace: OCRTrace | null = null;

/**
 * Check if debug mode is enabled.
 */
export function isDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(DEBUG_KEY) === 'true';
}

/**
 * Toggle debug mode on/off.
 */
export function setDebugEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DEBUG_KEY, enabled ? 'true' : 'false');
}

/**
 * Start a new trace for an OCR scan.
 */
export function traceStart(
  mode: OCRTrace['mode'],
): void {
  if (!isDebugEnabled()) return;
  currentTrace = {
    id: `trace_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    startedAt: Date.now(),
    mode,
    steps: [],
    classificationLog: [],
  };
  traceStep('scan_started', { mode });
}

/**
 * Add a step to the current trace.
 */
export function traceStep(
  label: string,
  data: string | Record<string, unknown>,
): void {
  if (!currentTrace) return;
  currentTrace.steps.push({
    timestamp: Date.now(),
    label,
    data,
  });
}

/**
 * Capture the raw camera image (before any processing).
 */
export function traceRawImage(dataUrl: string): void {
  if (!currentTrace) return;
  currentTrace.rawImageDataUrl = dataUrl;
  traceStep('raw_image_captured', {
    size: dataUrl.length,
  });
}

/**
 * Capture the preprocessed image (after grayscale/contrast/upscale).
 */
export function tracePreprocessedImage(dataUrl: string): void {
  if (!currentTrace) return;
  currentTrace.preprocessedImageDataUrl = dataUrl;
  traceStep('preprocessed_image', {
    size: dataUrl.length,
  });
}

/**
 * Capture raw Tesseract OCR output.
 */
export function traceOCRResult(
  text: string,
  confidence: number,
  lines: string[],
): void {
  if (!currentTrace) return;
  currentTrace.ocrRawText = text;
  currentTrace.ocrConfidence = confidence;
  currentTrace.ocrLines = [...lines];
  traceStep('ocr_result', {
    confidence,
    lineCount: lines.length,
    rawText: text.slice(0, 500),
  });
}

/**
 * Capture cleaned lines (after cleanOCRLine + garbage/branding filter).
 */
export function traceCleanedLines(lines: string[]): void {
  if (!currentTrace) return;
  currentTrace.cleanedLines = [...lines];
  traceStep('cleaned_lines', { lines });
}

/**
 * Log a line classification decision.
 */
export function traceClassification(
  line: string,
  decision: string,
  field?: string,
): void {
  if (!currentTrace) return;
  const entry = `"${line}" → ${decision}${field ? ` (${field})` : ''}`;
  currentTrace.classificationLog?.push(entry);
  traceStep('classify_line', { line, decision, field });
}

/**
 * Capture the final parsed result.
 */
export function traceFinalResult(
  result: Record<string, unknown>,
): void {
  if (!currentTrace) return;
  currentTrace.finalResult = result;
  currentTrace.durationMs = Date.now() - currentTrace.startedAt;
  traceStep('final_result', {
    ...result,
    durationMs: currentTrace.durationMs,
  });
}

/**
 * Finish and save the current trace to history.
 */
export function traceEnd(): OCRTrace | null {
  if (!currentTrace) return null;
  currentTrace.durationMs = Date.now() - currentTrace.startedAt;
  traceStep('scan_complete', {
    durationMs: currentTrace.durationMs,
  });

  // Save to localStorage (keep last N traces).
  const trace = { ...currentTrace };
  saveTrace(trace);

  // Sync trace to server in the background.
  import('@/lib/serverSync').then(m => m.syncTraceToServer(trace as unknown as Record<string, unknown>)).catch(() => {});

  const result = currentTrace;
  currentTrace = null;
  return result;
}

/**
 * Get the current in-progress trace (for live overlay).
 */
export function getCurrentTrace(): OCRTrace | null {
  return currentTrace;
}

/**
 * Save a trace to localStorage history.
 */
function saveTrace(trace: OCRTrace): void {
  try {
    const raw = localStorage.getItem(TRACE_HISTORY_KEY);
    const history: OCRTrace[] = raw ? JSON.parse(raw) : [];
    // Don't persist the full image data URLs in history — too large.
    const lightweight = {
      ...trace,
      rawImageDataUrl: trace.rawImageDataUrl
        ? `[${Math.round(trace.rawImageDataUrl.length / 1024)}KB image]`
        : undefined,
      preprocessedImageDataUrl: trace.preprocessedImageDataUrl
        ? `[${Math.round(trace.preprocessedImageDataUrl.length / 1024)}KB image]`
        : undefined,
    };
    history.unshift(lightweight);
    if (history.length > MAX_TRACES) {
      history.length = MAX_TRACES;
    }
    localStorage.setItem(TRACE_HISTORY_KEY, JSON.stringify(history));
  } catch {
    // Storage full or other error — ignore.
  }
}

/**
 * Get all saved traces from history.
 */
export function getTraceHistory(): OCRTrace[] {
  try {
    const raw = localStorage.getItem(TRACE_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Clear trace history.
 */
export function clearTraceHistory(): void {
  localStorage.removeItem(TRACE_HISTORY_KEY);
}
