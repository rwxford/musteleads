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
  notes: '',
  tags: '',
  eventName: '',
};

function ReviewPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { leads, addLead, updateLead, loadLeads } = useLeadStore();

  const sourceParam = searchParams.get('source') || 'manual';
  const rawParam = searchParams.get('raw');
  const editId = searchParams.get('id');

  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

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
          notes: existing.notes,
          tags: existing.tags.join(', '),
          eventName: existing.eventName,
        });
      }
      return;
    }

    // Pre-fill from QR scan data.
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
    if (
      sourceParam === 'badge_qr' ||
      sourceParam === 'business_card' ||
      sourceParam === 'manual' ||
      sourceParam === 'cipher_lab'
    ) {
      return sourceParam;
    }
    return 'manual';
  }

  async function saveLead(): Promise<Lead | null> {
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
        notes: form.notes,
        tags,
        eventName: form.eventName,
        source: resolveSource(),
        rawQRData: rawParam || undefined,
      };
      return await addLead(input);
    } finally {
      setSaving(false);
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    const lead = await saveLead();
    if (lead) router.push('/leads');
  }

  async function handleSaveAndContact(e: FormEvent) {
    e.preventDefault();
    const lead = await saveLead();
    if (lead) {
      saveLeadAsContact(lead);
      router.push('/leads');
    }
  }

  const tagPills = form.tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  return (
    <div className="flex min-h-screen flex-col px-4 pt-6 pb-4">
      <h1 className="text-xl font-bold">
        {editId ? 'Edit Lead' : 'Review Lead'}
      </h1>
      <p className="mt-1 text-xs text-white/40">
        Source: {resolveSource().replace('_', ' ')}
      </p>

      <form className="mt-6 flex flex-col gap-4" onSubmit={handleSave}>
        <Field
          label="First Name"
          value={form.firstName}
          onChange={handleChange('firstName')}
        />
        <Field
          label="Last Name"
          value={form.lastName}
          onChange={handleChange('lastName')}
        />
        <Field
          label="Company"
          value={form.company}
          onChange={handleChange('company')}
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

        {/* Actions */}
        <div className="mt-2 flex flex-col gap-3">
          <button
            type="submit"
            disabled={saving}
            className="flex h-12 items-center justify-center rounded-xl bg-white text-base font-semibold text-black transition-opacity disabled:opacity-50 active:opacity-80"
          >
            {saving ? 'Saving…' : 'Save Lead'}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSaveAndContact}
            className="flex h-12 items-center justify-center rounded-xl border border-white/20 text-sm font-medium transition-opacity disabled:opacity-50 active:opacity-80"
          >
            Save &amp; Add to Contacts
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-white/60">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2.5 text-sm outline-none transition-colors focus:border-white/60"
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
