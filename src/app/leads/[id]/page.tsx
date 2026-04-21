'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useLeadStore } from '@/leads/LeadStore';
import { saveLeadAsContact } from '@/export/VCardGenerator';
import { generateCSV, downloadCSV } from '@/export/CSVExporter';

const SOURCE_LABELS: Record<string, string> = {
  badge_qr: 'QR',
  badge_ocr: 'Badge OCR',
  card_ocr: 'Card OCR',
  business_card: 'Card',
  manual: 'Manual',
  cipher_lab: 'CipherLab',
};

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { leads, loadLeads, deleteLead } = useLeadStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadLeads().then(() => setReady(true));
  }, [loadLeads]);

  const lead = leads.find((l) => l.id === params.id);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-white/30">Loading…</p>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <p className="text-white/50">Lead not found.</p>
        <button
          onClick={() => router.push('/leads')}
          className="text-sm underline underline-offset-2"
        >
          Back to Leads
        </button>
      </div>
    );
  }

  function handleSaveContact() {
    if (lead) saveLeadAsContact(lead);
  }

  function handleExportCSV() {
    if (!lead) return;
    const csv = generateCSV([lead]);
    const name =
      `${lead.firstName}_${lead.lastName}`.replace(/\s+/g, '_') ||
      'lead';
    downloadCSV(csv, `${name}.csv`);
  }

  async function handleDelete() {
    if (!lead) return;
    if (confirm('Delete this lead permanently?')) {
      await deleteLead(lead.id);
      router.push('/leads');
    }
  }

  const fields = [
    { label: 'First Name', value: lead.firstName },
    { label: 'Last Name', value: lead.lastName },
    { label: 'Company', value: lead.company },
    { label: 'Title', value: lead.title },
    { label: 'Email', value: lead.email },
    { label: 'Phone', value: lead.phone },
    { label: 'LinkedIn', value: lead.linkedIn, isLink: true },
    { label: 'Event', value: lead.eventName },
    { label: 'Notes', value: lead.notes },
  ];

  return (
    <div className="flex min-h-screen flex-col px-4 pt-6 pb-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="text-sm text-white/50 underline underline-offset-2"
        >
          ← Back
        </button>
        <button
          onClick={() => router.push(`/review?id=${lead.id}`)}
          className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-medium"
        >
          Edit
        </button>
      </div>

      {/* Name + source badge */}
      <div className="mt-6">
        <h1 className="text-2xl font-bold">
          {lead.firstName} {lead.lastName}
        </h1>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="rounded bg-white/10 px-2 py-0.5 text-xs font-medium text-white/70">
            {SOURCE_LABELS[lead.source] || lead.source}
          </span>
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              lead.syncStatus === 'pending'
                ? 'bg-yellow-500/20 text-yellow-300'
                : 'bg-green-500/20 text-green-300'
            }`}
          >
            {lead.syncStatus}
          </span>
        </div>
      </div>

      {/* Fields */}
      <div className="mt-6 flex flex-col gap-3">
        {fields.map(
          (f) =>
            f.value && (
              <div
                key={f.label}
                className="rounded-lg border border-white/10 px-4 py-3"
              >
                <p className="text-[10px] font-medium uppercase tracking-wider text-white/40">
                  {f.label}
                </p>
                {f.isLink && f.value ? (
                  <a href={f.value} target="_blank" rel="noopener noreferrer" className="mt-0.5 text-sm text-blue-400 underline">{f.value}</a>
                ) : (
                  <p className="mt-0.5 text-sm">{f.value}</p>
                )}
              </div>
            ),
        )}
      </div>

      {/* Tags */}
      {lead.tags.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-white/40">
            Tags
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {lead.tags.map((tag, i) => (
              <span
                key={i}
                className="rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-xs"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Timestamp */}
      <p className="mt-4 text-xs text-white/30">
        Scanned {new Date(lead.scannedAt).toLocaleString()}
      </p>

      {/* Actions */}
      <div className="mt-8 flex flex-col gap-3">
        <button
          onClick={handleSaveContact}
          className="flex h-12 items-center justify-center rounded-xl bg-white text-sm font-semibold text-black transition-opacity active:opacity-80"
        >
          Save to Contacts
        </button>
        <button
          onClick={handleExportCSV}
          className="flex h-12 items-center justify-center rounded-xl border border-white/20 text-sm font-medium transition-opacity active:opacity-80"
        >
          Export CSV
        </button>
        <button
          onClick={handleDelete}
          className="flex h-12 items-center justify-center rounded-xl border border-red-500/30 text-sm font-medium text-red-400 transition-opacity active:opacity-80"
        >
          Delete Lead
        </button>
      </div>
    </div>
  );
}
