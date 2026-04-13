'use client';

import { useState } from 'react';
import type { OCRTrace } from '@/scanner/DebugTrace';
import {
  isDebugEnabled,
  getCurrentTrace,
  getTraceHistory,
  clearTraceHistory,
} from '@/scanner/DebugTrace';

/**
 * Debug overlay that shows OCR trace details. Appears as a floating
 * button in the bottom-right when debug mode is on. Tap to expand.
 */
export default function DebugOverlay() {
  const [expanded, setExpanded] = useState(false);
  const [selectedTrace, setSelectedTrace] = useState<OCRTrace | null>(null);
  const [tab, setTab] = useState<'current' | 'history'>('current');

  if (typeof window === 'undefined' || !isDebugEnabled()) {
    return null;
  }

  const current = getCurrentTrace();
  const history = getTraceHistory();

  const trace = tab === 'current' ? current : selectedTrace;

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="fixed bottom-20 right-3 z-50 bg-yellow-500 text-black
                   text-xs font-bold px-2 py-1 rounded-full shadow-lg"
      >
        🐛 DEBUG
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/95 overflow-y-auto text-xs">
      <div className="p-3">
        {/* Header */}
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-yellow-400 font-bold text-base">
            OCR Debug Trace
          </h2>
          <button
            onClick={() => setExpanded(false)}
            className="text-white bg-gray-700 px-2 py-1 rounded"
          >
            Close
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setTab('current')}
            className={`px-3 py-1 rounded ${
              tab === 'current'
                ? 'bg-yellow-500 text-black'
                : 'bg-gray-700 text-white'
            }`}
          >
            Current
          </button>
          <button
            onClick={() => setTab('history')}
            className={`px-3 py-1 rounded ${
              tab === 'history'
                ? 'bg-yellow-500 text-black'
                : 'bg-gray-700 text-white'
            }`}
          >
            History ({history.length})
          </button>
          <button
            onClick={() => { clearTraceHistory(); setSelectedTrace(null); }}
            className="px-3 py-1 rounded bg-red-800 text-white ml-auto"
          >
            Clear
          </button>
        </div>

        {/* History list */}
        {tab === 'history' && (
          <div className="mb-3 space-y-1">
            {history.map((t, i) => (
              <button
                key={t.id}
                onClick={() => setSelectedTrace(t)}
                className={`w-full text-left p-2 rounded ${
                  selectedTrace?.id === t.id
                    ? 'bg-yellow-900'
                    : 'bg-gray-800'
                }`}
              >
                <span className="text-yellow-400">#{i + 1}</span>{' '}
                {t.mode} — {t.ocrConfidence?.toFixed(0)}% conf —{' '}
                {t.durationMs}ms
              </button>
            ))}
            {history.length === 0 && (
              <p className="text-gray-500">No traces yet.</p>
            )}
          </div>
        )}

        {/* Trace detail */}
        {trace ? (
          <div className="space-y-3">
            {/* Summary */}
            <div className="bg-gray-900 p-2 rounded">
              <div className="text-yellow-400 font-bold mb-1">Summary</div>
              <div>Mode: {trace.mode}</div>
              <div>Confidence: {trace.ocrConfidence?.toFixed(1)}%</div>
              <div>Duration: {trace.durationMs}ms</div>
              <div>OCR lines: {trace.ocrLines?.length ?? 0}</div>
              <div>Cleaned lines: {trace.cleanedLines?.length ?? 0}</div>
            </div>

            {/* Raw image */}
            {trace.rawImageDataUrl &&
              !trace.rawImageDataUrl.startsWith('[') && (
                <div className="bg-gray-900 p-2 rounded">
                  <div className="text-yellow-400 font-bold mb-1">
                    Raw Captured Image
                  </div>
                  <img
                    src={trace.rawImageDataUrl}
                    alt="Raw capture"
                    className="w-full rounded"
                  />
                </div>
              )}

            {/* Preprocessed image */}
            {trace.preprocessedImageDataUrl &&
              !trace.preprocessedImageDataUrl.startsWith('[') && (
                <div className="bg-gray-900 p-2 rounded">
                  <div className="text-yellow-400 font-bold mb-1">
                    After Preprocessing (grayscale + contrast)
                  </div>
                  <img
                    src={trace.preprocessedImageDataUrl}
                    alt="Preprocessed"
                    className="w-full rounded"
                  />
                </div>
              )}

            {/* Raw OCR text */}
            <div className="bg-gray-900 p-2 rounded">
              <div className="text-yellow-400 font-bold mb-1">
                Raw Tesseract Output
              </div>
              <pre className="whitespace-pre-wrap text-green-300 font-mono">
                {trace.ocrRawText || '(empty)'}
              </pre>
            </div>

            {/* OCR lines */}
            <div className="bg-gray-900 p-2 rounded">
              <div className="text-yellow-400 font-bold mb-1">
                OCR Lines (before cleaning)
              </div>
              {trace.ocrLines?.map((line, i) => (
                <div key={i} className="text-gray-300 font-mono">
                  [{i}] &quot;{line}&quot;
                </div>
              )) || <p className="text-gray-500">None</p>}
            </div>

            {/* Cleaned lines */}
            <div className="bg-gray-900 p-2 rounded">
              <div className="text-yellow-400 font-bold mb-1">
                Cleaned Lines (after garbage/branding filter)
              </div>
              {trace.cleanedLines?.map((line, i) => (
                <div key={i} className="text-gray-300 font-mono">
                  [{i}] &quot;{line}&quot;
                </div>
              )) || <p className="text-gray-500">None</p>}
            </div>

            {/* Classification log */}
            <div className="bg-gray-900 p-2 rounded">
              <div className="text-yellow-400 font-bold mb-1">
                Classification Decisions
              </div>
              {trace.classificationLog?.map((entry, i) => (
                <div key={i} className="text-blue-300 font-mono">
                  {entry}
                </div>
              )) || <p className="text-gray-500">None</p>}
            </div>

            {/* Final result */}
            <div className="bg-gray-900 p-2 rounded">
              <div className="text-yellow-400 font-bold mb-1">
                Final Parsed Result
              </div>
              <pre className="whitespace-pre-wrap text-green-300 font-mono">
                {JSON.stringify(trace.finalResult, null, 2) || '(none)'}
              </pre>
            </div>

            {/* Step timeline */}
            <div className="bg-gray-900 p-2 rounded">
              <div className="text-yellow-400 font-bold mb-1">
                Step Timeline
              </div>
              {trace.steps.map((step, i) => (
                <div key={i} className="text-gray-400 font-mono border-b border-gray-800 py-1">
                  <span className="text-gray-600">
                    +{step.timestamp - trace.startedAt}ms
                  </span>{' '}
                  <span className="text-white">{step.label}</span>{' '}
                  <span className="text-gray-500">
                    {typeof step.data === 'string'
                      ? step.data
                      : JSON.stringify(step.data)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-gray-500">
            {tab === 'current'
              ? 'No active trace. Scan something to see trace data.'
              : 'Select a trace from the history above.'}
          </p>
        )}
      </div>
    </div>
  );
}
