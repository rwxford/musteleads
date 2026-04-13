'use client';

import { useState, useEffect } from 'react';
import { getExportHistory, type ExportRecord } from '@/export/ExportHistory';
import { db } from '@/leads/LeadDB';
import { useLeadStore } from '@/leads/LeadStore';
import {
  isDebugEnabled,
  setDebugEnabled,
  getTraceHistory,
  clearTraceHistory,
} from '@/scanner/DebugTrace';

export default function SettingsPage() {
  const { loadLeads } = useLeadStore();
  const [defaultEvent, setDefaultEvent] = useState('');
  const [defaultTags, setDefaultTags] = useState('');
  const [history, setHistory] = useState<ExportRecord[]>([]);
  const [installPrompt, setInstallPrompt] = useState<Event | null>(
    null,
  );
  const [isPWA, setIsPWA] = useState(false);

  useEffect(() => {
    // Load persisted settings.
    setDefaultEvent(
      localStorage.getItem('musteleads_default_event') || '',
    );
    setDefaultTags(
      localStorage.getItem('musteleads_default_tags') || '',
    );
    setHistory(getExportHistory());

    // Detect standalone PWA mode.
    const mq = window.matchMedia('(display-mode: standalone)');
    setIsPWA(mq.matches);

    // Capture beforeinstallprompt for install button.
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () =>
      window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  function saveEvent(value: string) {
    setDefaultEvent(value);
    localStorage.setItem('musteleads_default_event', value);
  }

  function saveTags(value: string) {
    setDefaultTags(value);
    localStorage.setItem('musteleads_default_tags', value);
  }

  async function handleClearAll() {
    if (
      !confirm(
        'This will permanently delete ALL leads and export history. Continue?',
      )
    ) {
      return;
    }
    await db.leads.clear();
    localStorage.removeItem('musteleads_exports');
    setHistory([]);
    await loadLeads();
  }

  async function handleInstall() {
    if (!installPrompt) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (installPrompt as any).prompt();
    setInstallPrompt(null);
  }

  return (
    <div className="flex min-h-screen flex-col px-4 pt-6 pb-4">
      <h1 className="text-xl font-bold">Settings</h1>

      {/* Default event */}
      <section className="mt-6">
        <label className="mb-1 block text-xs font-medium text-white/60">
          Default Event Name
        </label>
        <input
          type="text"
          value={defaultEvent}
          onChange={(e) => saveEvent(e.target.value)}
          placeholder="e.g. KubeCon 2025"
          className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-white/30 focus:border-white/60"
        />
      </section>

      {/* Default tags */}
      <section className="mt-5">
        <label className="mb-1 block text-xs font-medium text-white/60">
          Default Tags (comma-separated)
        </label>
        <input
          type="text"
          value={defaultTags}
          onChange={(e) => saveTags(e.target.value)}
          placeholder="e.g. conference, 2025"
          className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-white/30 focus:border-white/60"
        />
      </section>

      {/* Export history */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/40">
          Export History
        </h2>
        {history.length === 0 ? (
          <p className="text-sm text-white/30">No exports yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {[...history].reverse().map((rec) => (
              <li
                key={rec.id}
                className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2.5"
              >
                <div>
                  <p className="text-sm">
                    {rec.leadCount} leads · {rec.format.toUpperCase()}
                  </p>
                  <p className="text-[10px] text-white/40">
                    {new Date(rec.exportedAt).toLocaleString()}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* PWA install */}
      {!isPWA && installPrompt && (
        <section className="mt-8">
          <button
            onClick={handleInstall}
            className="flex h-12 w-full items-center justify-center rounded-xl bg-white text-sm font-semibold text-black transition-opacity active:opacity-80"
          >
            Install Musteleads App
          </button>
        </section>
      )}

      {/* Debug Mode */}
      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-yellow-400/60">
          Developer
        </h2>
        <div className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-white">Debug Mode</p>
            <p className="text-xs text-white/40">
              Show OCR trace overlay with raw images, Tesseract output, and line classification
            </p>
          </div>
          <button
            onClick={() => {
              const next = !isDebugEnabled();
              setDebugEnabled(next);
              window.location.reload();
            }}
            className={`px-3 py-1 rounded-lg text-xs font-bold ${
              isDebugEnabled()
                ? 'bg-yellow-500 text-black'
                : 'bg-gray-700 text-white'
            }`}
          >
            {isDebugEnabled() ? 'ON' : 'OFF'}
          </button>
        </div>
        {isDebugEnabled() && (
          <div className="mt-2 space-y-2">
            <p className="text-xs text-white/40">
              {getTraceHistory().length} traces in history
            </p>
            <button
              onClick={() => { clearTraceHistory(); window.location.reload(); }}
              className="text-xs text-yellow-400 underline"
            >
              Clear trace history
            </button>
          </div>
        )}
      </section>

      {/* Danger zone */}
      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-red-400/60">
          Danger Zone
        </h2>
        <button
          onClick={handleClearAll}
          className="flex h-12 w-full items-center justify-center rounded-xl border border-red-500/30 text-sm font-medium text-red-400 transition-opacity active:opacity-80"
        >
          Clear All Data
        </button>
      </section>

      {/* About */}
      <section className="mt-10 pb-4">
        <p className="text-xs text-white/30">
          Musteleads v0.1.0
        </p>
        <p className="mt-1 text-xs text-white/20">
          Offline-first lead capture for conferences and trade shows.
          Scan badges, capture cards, export to your CRM.
        </p>
      </section>
    </div>
  );
}
