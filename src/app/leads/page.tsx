'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useLeadStore } from '@/leads/LeadStore';
import type { Lead } from '@/types/Lead';

type Filter = 'all' | 'pending' | 'exported';

export default function LeadsPage() {
  const { leads, loading, loadLeads, deleteLead } = useLeadStore();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  const filtered = useMemo(() => {
    let result = leads;

    // Filter by sync status.
    if (filter === 'pending') {
      result = result.filter((l) => l.syncStatus === 'pending');
    } else if (filter === 'exported') {
      result = result.filter(
        (l) =>
          l.syncStatus === 'exported' ||
          l.syncStatus === 'saved_to_contacts',
      );
    }

    // Search by name, company, email.
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (l) =>
          l.firstName.toLowerCase().includes(q) ||
          l.lastName.toLowerCase().includes(q) ||
          l.company.toLowerCase().includes(q) ||
          l.email.toLowerCase().includes(q),
      );
    }

    // Newest first.
    return [...result].sort(
      (a, b) =>
        new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime(),
    );
  }, [leads, search, filter]);

  function handleDelete(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    if (confirm('Delete this lead?')) {
      deleteLead(id);
    }
  }

  const filters: { label: string; value: Filter }[] = [
    { label: 'All', value: 'all' },
    { label: 'Pending', value: 'pending' },
    { label: 'Exported', value: 'exported' },
  ];

  return (
    <div className="flex min-h-screen flex-col px-4 pt-6">
      <h1 className="text-xl font-bold">Leads</h1>

      {/* Search */}
      <div className="mt-4">
        <input
          type="search"
          placeholder="Search by name, company, email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-white/30 focus:border-white/60"
        />
      </div>

      {/* Filter chips */}
      <div className="mt-3 flex gap-2">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === f.value
                ? 'bg-white text-black'
                : 'border border-white/20 text-white/60'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Leads list */}
      <div className="mt-4 flex flex-col gap-2">
        {loading ? (
          <p className="py-8 text-center text-sm text-white/30">
            Loading…
          </p>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-white/30">
            {search ? 'No matching leads.' : 'No leads yet.'}
          </p>
        ) : (
          filtered.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>
    </div>
  );
}

function LeadCard({
  lead,
  onDelete,
}: {
  lead: Lead;
  onDelete: (e: React.MouseEvent, id: string) => void;
}) {
  return (
    <Link
      href={`/leads/${lead.id}`}
      className="flex items-start justify-between rounded-lg border border-white/10 px-4 py-3 transition-colors active:bg-white/5"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {lead.firstName} {lead.lastName}
        </p>
        {lead.company && (
          <p className="truncate text-xs text-white/50">{lead.company}</p>
        )}
        <p className="truncate text-xs text-white/40">{lead.email}</p>
        <div className="mt-1.5 flex items-center gap-2">
          {lead.eventName && (
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/50">
              {lead.eventName}
            </span>
          )}
          <span className="text-[10px] text-white/30">
            {new Date(lead.scannedAt).toLocaleString()}
          </span>
        </div>
      </div>
      <button
        onClick={(e) => onDelete(e, lead.id)}
        className="ml-3 shrink-0 p-1 text-white/20 transition-colors active:text-red-400"
        aria-label="Delete lead"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
        </svg>
      </button>
    </Link>
  );
}
