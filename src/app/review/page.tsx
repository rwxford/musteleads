'use client';

import { useState, useEffect, useCallback, Suspense, type FormEvent } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useLeadStore } from '@/leads/LeadStore';
import { processQRData } from '@/scanner/QRProcessor';
import { saveLeadAsContact } from '@/export/VCardGenerator';
import type { Lead, LeadInput } from '@/types/Lead';

interface FormState {
  firstName: string;
  lastName: string;
  company: string;
  title: string;
  email: string;
  phone: string;
  linkedIn: string;
  notes: string;
  tags: string;
  eventName: string;
}

const emptyForm: FormState = {
  firstName: '',
  lastName: '',
  company: '',
  title: '',
  email: '',
  phone: '',
  linkedIn: '',
  notes: '',
  tags: '',
  eventName: '',
};

function ReviewPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { leads, addLead, updateLead, loadLeads, findDuplicateByEmail } = useLeadStore();

  const sourceParam = searchParams.get('source') || 'manual';
  const rawParam = searchParams.get('raw');
  const editId = searchParams.get('id');

  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // OCR metadata from sessionStorage.
  const [rawOCRText, setRawOCRText] = useState<string | null>(null);
  const [ocrConfidence, setOcrConfidence] = useState<number | null>(null);
  const [ocrEngine, setOcrEngine] = useState<string | null>(null);
  const [ocrTextOpen, setOcrTextOpen] = useState(false);
  const [sessionSource, setSessionSource] = useState<string | null>(null);

  // Duplicate detection.
  const [duplicateLead, setDuplicateLead] = useState<Lead | null>(null);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [pendingSaveAction, setPendingSaveAction] = useState<'save' | 'save-contact' | null>(null);

  // Pre-fill from scan data or from an existing lead being edited.
  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  useEffect(() => {
    // Editing an existing lead.
    if (editId) {
      const existing = leads.find((l) => l.id === editId);
      if (existing) {
        setForm({
          firstName: existing.firstName,
          lastName: existing.lastName,
          company: existing.company,
          title: existing.title,
          email: existing.email,
          phone: existing.phone,
          linkedIn: existing.linkedIn || '',
          notes: existing.notes,
          tags: existing.tags.join(', '),
          eventName: existing.eventName,
        });
      }
      return;
    }

    // Pre-fill from sessionStorage scan result.
    try {
      const stored = sessionStorage.getItem('musteleads:scan-result');
      if (stored) {
        const data = JSON.parse(stored);

        if (data.source) setSessionSource(data.source);
        if (data.rawOCRText) setRawOCRText(data.rawOCRText);
        if (typeof data.ocrConfidence === 'number') setOcrConfidence(data.ocrConfidence);
        if (data.ocrEngine) setOcrEngine(data.ocrEngine);

        if (data.contact) {
          const c = data.contact;
          setForm((prev) => ({
            ...prev,
            firstName: c.firstName || prev.firstName,
            lastName: c.lastName || prev.lastName,
            company: c.company || prev.company,
            title: c.title || prev.title,
            email: c.email || prev.email,
            phone: c.phone || prev.phone,
            linkedIn: c.url && c.url.toLowerCase().includes('linkedin.com') ? c.url : prev.linkedIn,
          }));
        }

        const defaultEvent = localStorage.getItem('musteleads_default_event');
        if (defaultEvent) {
          setForm((prev) => ({ ...prev, eventName: defaultEvent }));
        } else if (data.eventName) {
          setForm((prev) => ({ ...prev, eventName: data.eventName }));
        }

        sessionStorage.removeItem('musteleads:scan-result');
        return;
      }
    } catch { /* sessionStorage may be unavailable */ }

    // Pre-fill from QR scan data (legacy URL-param path).
    if (rawParam) {
      const result = processQRData(rawParam);
      if (result.contact) {
        const c = result.contact;
        setForm((prev) => ({
          ...prev,
          firstName: c.firstName || prev.firstName,
          lastName: c.lastName || prev.lastName,
          company: c.company || prev.company,
          title: c.title || prev.title,
          email: c.email || prev.email,
          phone: c.phone || prev.phone,
        }));
      }
      return;
    }

    // Pre-fill event name from localStorage default.
    const defaultEvent = localStorage.getItem('musteleads_default_event');
    if (defaultEvent) {
      setForm((prev) => ({ ...prev, eventName: defaultEvent }));
    }
  }, [editId, rawParam, leads]);

  const handleChange = useCallback(
    (field: keyof FormState) =>
      (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setForm((prev) => ({ ...prev, [field]: e.target.value }));
        if (field === 'email') setError('');
      },
    [],
  );

  function resolveSource(): Lead['source'] {
    if (editId) {
      const existing = leads.find((l) => l.id === editId);
      if (existing) return existing.source;
    }
    const src = sessionSource || sourceParam;
    if (
      src === 'badge_qr' ||
      src === 'badge_ocr' ||
      src === 'card_ocr' ||
      src === 'business_card' ||
      src === 'manual' ||
      src === 'cipher_lab'
    ) {
      return src;
    }
    return 'manual';
  }

  async function doSave(): Promise<Lead | null> {
    if (!form.email.trim()) {
      setError('Email is required.');
      return null;
    }
    setSaving(true);
    try {
      const tags = form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      if (editId) {
        await updateLead(editId, {
          firstName: form.firstName,
          lastName: form.lastName,
          company: form.company,
          title: form.title,
          email: form.email,
          phone: form.phone,
          linkedIn: form.linkedIn,
          notes: form.notes,
          tags,
          eventName: form.eventName,
        });
        const updated = leads.find((l) => l.id === editId);
        return updated || null;
      }

      const input: LeadInput = {
        firstName: form.firstName,
        lastName: form.lastName,
        company: form.company,
        title: form.title,
        email: form.email,
        phone: form.phone,
        linkedIn: form.linkedIn,
        notes: form.notes,
        tags,
        eventName: form.eventName,
        source: resolveSource(),
        ocrConfidence: ocrConfidence || 0,
        ocrEngine: (ocrEngine as LeadInput['ocrEngine']) || 'none',
        rawQRData: rawParam || undefined,
      };
      return await addLead(input);
    } finally {
      setSaving(false);
    }
  }

  async function attemptSave(action: 'save' | 'save-contact') {
    if (!form.email.trim()) {
      setError('Email is required.');
      return;
    }

    // Check for duplicate (skip when editing).
    if (!editId) {
      const dup = findDuplicateByEmail(form.email);
      if (dup) {
        setDuplicateLead(dup);
        setShowDuplicateModal(true);
        setPendingSaveAction(action);
        return;
      }
    }

    await finishSave(action);
  }

  async function finishSave(action: 'save' | 'save-contact') {
    const lead = await doSave();
    if (lead) {
      if (action === 'save-contact') {
        saveLeadAsContact(lead);
      }
      router.push('/leads');
    }
  }

  async function handleMergeDuplicate() {
    if (!duplicateLead) return;
    // Merge: update existing lead with non-empty fields from new scan.
    const updates: Partial<Lead> = {};
    if (form.firstName && !duplicateLead.firstName) updates.firstName = form.firstName;
    if (form.lastName && !duplicateLead.lastName) updates.lastName = form.lastName;
    if (form.company && !duplicateLead.company) updates.company = form.company;
    if (form.title && !duplicateLead.title) updates.title = form.title;
    if (form.phone && !duplicateLead.phone) updates.phone = form.phone;
    if (form.linkedIn && !duplicateLead.linkedIn) updates.linkedIn = form.linkedIn;
    if (form.notes) updates.notes = [duplicateLead.notes, form.notes].filter(Boolean).join('\n');

    await updateLead(duplicateLead.id, updates);
    setShowDuplicateModal(false);
    router.push('/leads');
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    await attemptSave('save');
  }

  async function handleSaveAndContact(e: FormEvent) {
    e.preventDefault();
    await attemptSave('save-contact');
  }

  const tagPills = form.tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  const confidenceColor = ocrConfidence !== null
    ? ocrConfidence >= 90 ? 'text-green-400' : ocrConfidence >= 70 ? 'text-yellow-400' : 'text-red-400'
    : '';

  return (
    <div className="flex min-h-screen flex-col px-4 pt-6 pb-4">
      <h1 className="text-xl font-bold">
        {editId ? 'Edit Lead' : 'Review Lead'}
      </h1>
      <p className="mt-1 text-xs text-white/40">
        Source: {resolveSource().replace(/_/g, ' ')}
        {ocrEngine && ocrEngine !== 'none' && (
          <span className="ml-2 rounded bg-zinc-800 px-1.5 py-0.5">
            {ocrEngine === 'cloud-vision' ? '☁️ Cloud OCR' : '📱 Offline OCR'}
          </span>
        )}
        {ocrConfidence !== null && (
          <span className={`ml-2 rounded bg-zinc-800 px-1.5 py-0.5 ${confidenceColor}`}>
            {Math.round(ocrConfidence)}% confident
          </span>
        )}
      </p>

      <form className="mt-6 flex flex-col gap-4" onSubmit={handleSave}>
        <Field
          label="First Name"
          value={form.firstName}
          onChange={handleChange('firstName')}
          lowConfidence={ocrConfidence !== null && ocrConfidence < 70 && !!form.firstName}
        />
        <Field
          label="Last Name"
          value={form.lastName}
          onChange={handleChange('lastName')}
          lowConfidence={ocrConfidence !== null && ocrConfidence < 70 && !!form.lastName}
        />
        <Field
          label="Company"
          value={form.company}
          onChange={handleChange('company')}
          lowConfidence={ocrConfidence !== null && ocrConfidence < 70 && !!form.company}
        />
        <Field
          label="Title"
          value={form.title}
          onChange={handleChange('title')}
        />
        <div>
          <label className="mb-1 block text-xs font-medium text-white/60">
            Email <span className="text-red-400">*</span>
          </label>
          <input
            type="email"
            value={form.email}
            onChange={handleChange('email')}
            className={`w-full rounded-lg border px-3 py-2.5 text-sm bg-white/5 outline-none transition-colors focus:border-white/60 ${
              error
                ? 'border-red-500 focus:border-red-500'
                : 'border-white/20'
            }`}
          />
          {error && (
            <p className="mt-1 text-xs text-red-400">{error}</p>
          )}
        </div>
        <Field
          label="Phone"
          value={form.phone}
          onChange={handleChange('phone')}
          type="tel"
        />
        <Field
          label="LinkedIn URL"
          value={form.linkedIn}
          onChange={handleChange('linkedIn')}
          type="url"
          placeholder="https://linkedin.com/in/..."
        />
        <Field
          label="Event Name"
          value={form.eventName}
          onChange={handleChange('eventName')}
        />
        <div>
          <label className="mb-1 block text-xs font-medium text-white/60">
            Tags (comma-separated)
          </label>
          <input
            type="text"
            value={form.tags}
            onChange={handleChange('tags')}
            placeholder="e.g. hot-lead, partner, follow-up"
            className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2.5 text-sm outline-none transition-colors focus:border-white/60"
          />
          {tagPills.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tagPills.map((tag, i) => (
                <span
                  key={i}
                  className="rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-xs"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-white/60">
            Notes
          </label>
          <textarea
            rows={3}
            value={form.notes}
            onChange={handleChange('notes')}
            className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2.5 text-sm outline-none transition-colors focus:border-white/60"
          />
        </div>

        {/* Raw OCR text — collapsible reference section. */}
        {rawOCRText && (
          <div className="rounded-lg border border-white/10 bg-white/5">
            <button
              type="button"
              onClick={() => setOcrTextOpen((prev) => !prev)}
              className="flex w-full items-center justify-between px-3 py-2.5 text-left text-xs font-medium text-white/60"
            >
              <span>Raw OCR Text</span>
              <span className="text-white/30">{ocrTextOpen ? '▲' : '▼'}</span>
            </button>
            {ocrTextOpen && (
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap border-t border-white/10 px-3 py-2.5 text-xs text-white/50">
                {rawOCRText}
              </pre>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="mt-2 flex flex-col gap-3">
          <button
            type="submit"
            disabled={saving}
            className="flex h-12 items-center justify-center rounded-xl bg-white text-base font-semibold text-black transition-opacity disabled:opacity-50 active:opacity-80"
          >
            {saving ? 'Saving...' : 'Save Lead'}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSaveAndContact}
            className="flex h-12 items-center justify-center rounded-xl border border-white/20 text-sm font-medium transition-opacity disabled:opacity-50 active:opacity-80"
          >
            Save &amp; Add to Contacts
          </button>
          <button
            type="button"
            onClick={() => router.push('/scanner')}
            className="flex h-12 items-center justify-center text-sm font-medium text-white/50 transition-opacity active:opacity-80"
          >
            Discard &amp; Scan Again
          </button>
        </div>
      </form>

      {/* Duplicate detection modal */}
      {showDuplicateModal && duplicateLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-zinc-900 p-6">
            <h2 className="text-lg font-bold">Duplicate Detected</h2>
            <p className="mt-2 text-sm text-white/60">
              A lead with email <span className="font-mono text-white/80">{form.email}</span> already exists.
            </p>
            <p className="mt-1 text-xs text-white/40">
              {duplicateLead.firstName} {duplicateLead.lastName} — {duplicateLead.company}
              {duplicateLead.eventName && ` (${duplicateLead.eventName})`}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                onClick={handleMergeDuplicate}
                className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black"
              >
                Update Existing Lead
              </button>
              <button
                onClick={async () => {
                  setShowDuplicateModal(false);
                  if (pendingSaveAction) await finishSave(pendingSaveAction);
                }}
                className="rounded-xl border border-white/20 px-4 py-2.5 text-sm font-medium"
              >
                Save as New Lead
              </button>
              <button
                onClick={() => {
                  setShowDuplicateModal(false);
                  setPendingSaveAction(null);
                }}
                className="px-4 py-2 text-sm text-white/40"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  lowConfidence = false,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  placeholder?: string;
  lowConfidence?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-white/60">
        {label}
        {lowConfidence && (
          <span className="rounded bg-yellow-500/20 px-1 py-0.5 text-[10px] text-yellow-400">
            Low confidence
          </span>
        )}
      </label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`w-full rounded-lg border bg-white/5 px-3 py-2.5 text-sm outline-none transition-colors focus:border-white/60 ${
          lowConfidence ? 'border-yellow-500/50' : 'border-white/20'
        }`}
      />
    </div>
  );
}

export default function ReviewPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen text-white">Loading...</div>}>
      <ReviewPageContent />
    </Suspense>
  );
}
