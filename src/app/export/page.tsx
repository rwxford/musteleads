'use client';

import { useEffect, useMemo } from 'react';
import { useLeadStore } from '@/leads/LeadStore';
import {
  generateCSV,
  downloadCSV,
  shareCSV,
  filterLeads,
} from '@/export/CSVExporter';
import {
  generateMultiVCard,
  downloadVCard,
} from '@/export/VCardGenerator';
import { recordExport, getExportHistory } from '@/export/ExportHistory';
import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { ExportRecord } from '@/export/ExportHistory';

export default function ExportPage() {
  const { leads, loadLeads } = useLeadStore();
  const [history, setHistory] = useState<ExportRecord[]>([]);

  useEffect(() => {
    loadLeads();
    setHistory(getExportHistory());
  }, [loadLeads]);

  const pendingLeads = useMemo(
    () => leads.filter((l) => l.syncStatus === 'pending'),
    [leads],
  );

  function handleExportCSV(onlyPending: boolean) {
    const target = onlyPending ? pendingLeads : leads;
    if (target.length === 0) return;
    const csv = generateCSV(target);
    const filename = `musteleads_${new Date().toISOString().slice(0, 10)}.csv`;
    downloadCSV(csv, filename);
    const record: ExportRecord = {
      id: uuidv4(),
      exportedAt: new Date().toISOString(),
      leadCount: target.length,
      format: 'csv',
      leadIds: target.map((l) => l.id),
    };
    recordExport(record);
    setHistory((prev) => [...prev, record]);
  }

  function handleExportVCard() {
    if (leads.length === 0) return;
    const vcf = generateMultiVCard(leads);
    const filename = `musteleads_${new Date().toISOString().slice(0, 10)}.vcf`;
    downloadVCard(vcf, filename);
    const record: ExportRecord = {
      id: uuidv4(),
      exportedAt: new Date().toISOString(),
      leadCount: leads.length,
      format: 'vcf',
      leadIds: leads.map((l) => l.id),
    };
    recordExport(record);
    setHistory((prev) => [...prev, record]);
  }

  async function handleShareCSV() {
    if (leads.length === 0) return;
    const csv = generateCSV(leads);
    const filename = `musteleads_${new Date().toISOString().slice(0, 10)}.csv`;
    await shareCSV(csv, filename);
  }

  return (
    <div className="flex min-h-screen flex-col px-4 pt-6">
      <h1 className="text-xl font-bold">Export</h1>
      <p className="mt-1 text-xs text-white/40">
        {leads.length} total leads · {pendingLeads.length} pending
      </p>

      {/* Export actions */}
      <div className="mt-6 flex flex-col gap-3">
        <button
          onClick={() => handleExportCSV(false)}
          disabled={leads.length === 0}
          className="flex h-12 items-center justify-center rounded-xl bg-white text-sm font-semibold text-black transition-opacity disabled:opacity-30 active:opacity-80"
        >
          Export All as CSV
        </button>
        <button
          onClick={() => handleExportCSV(true)}
          disabled={pendingLeads.length === 0}
          className="flex h-12 items-center justify-center rounded-xl border border-white/20 text-sm font-medium transition-opacity disabled:opacity-30 active:opacity-80"
        >
          Export Pending Only ({pendingLeads.length})
        </button>
        <button
          onClick={handleExportVCard}
          disabled={leads.length === 0}
          className="flex h-12 items-center justify-center rounded-xl border border-white/20 text-sm font-medium transition-opacity disabled:opacity-30 active:opacity-80"
        >
          Export All as vCard (.vcf)
        </button>
        <button
          onClick={handleShareCSV}
          disabled={leads.length === 0}
          className="flex h-12 items-center justify-center rounded-xl border border-white/20 text-sm font-medium transition-opacity disabled:opacity-30 active:opacity-80"
        >
          Share CSV
        </button>
      </div>

      {/* Export history */}
      <section className="mt-10">
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
                className="flex items-center justify-between rounded-lg border border-white/10 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium">
                    {rec.leadCount} leads · {rec.format.toUpperCase()}
                  </p>
                  <p className="text-xs text-white/40">
                    {new Date(rec.exportedAt).toLocaleString()}
                  </p>
                </div>
                <span className="rounded bg-white/10 px-2 py-0.5 text-xs text-white/50">
                  {rec.format}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
