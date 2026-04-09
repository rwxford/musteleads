'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useLeadStore } from '@/leads/LeadStore';

export default function HomePage() {
  const { leads, loading, loadLeads, getPendingCount } = useLeadStore();

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  const pendingCount = getPendingCount();
  const recentLeads = [...leads]
    .sort(
      (a, b) =>
        new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime(),
    )
    .slice(0, 5);

  return (
    <div className="flex min-h-screen flex-col px-4 pt-12">
      {/* Header */}
      <h1 className="text-center text-2xl font-bold tracking-tight">
        Musteleads
      </h1>
      <p className="mt-1 text-center text-sm text-white/50">
        Capture leads faster.
      </p>

      {/* Scan buttons */}
      <div className="mt-10 flex flex-col gap-3">
        <Link
          href="/scanner?mode=badge"
          className="flex h-14 items-center justify-center rounded-xl bg-white text-lg font-semibold text-black transition-opacity active:opacity-80"
        >
          Scan Badge
        </Link>
        <Link
          href="/scanner?mode=card"
          className="flex h-14 items-center justify-center rounded-xl border border-white/20 text-lg font-semibold transition-opacity active:opacity-80"
        >
          Scan Card
        </Link>
      </div>

      {/* Manual entry */}
      <Link
        href="/review?source=manual"
        className="mt-4 block text-center text-sm text-white/50 underline underline-offset-2"
      >
        or Enter Manually
      </Link>

      {/* Quick stats */}
      <div className="mt-10 flex gap-4">
        <div className="flex-1 rounded-xl border border-white/10 px-4 py-3">
          <p className="text-2xl font-bold">{leads.length}</p>
          <p className="text-xs text-white/50">Total Leads</p>
        </div>
        <div className="flex-1 rounded-xl border border-white/10 px-4 py-3">
          <p className="text-2xl font-bold">{pendingCount}</p>
          <p className="text-xs text-white/50">Pending Export</p>
        </div>
      </div>

      {/* Recent leads */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/40">
          Recent Leads
        </h2>
        {loading ? (
          <p className="text-sm text-white/30">Loading…</p>
        ) : recentLeads.length === 0 ? (
          <p className="text-sm text-white/30">
            No leads yet. Scan your first badge!
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {recentLeads.map((lead) => (
              <Link
                key={lead.id}
                href={`/leads/${lead.id}`}
                className="flex items-center justify-between rounded-lg border border-white/10 px-4 py-3 transition-colors active:bg-white/5"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {lead.firstName} {lead.lastName}
                  </p>
                  <p className="truncate text-xs text-white/50">
                    {lead.company || lead.email}
                  </p>
                </div>
                <span className="ml-2 shrink-0 text-xs text-white/30">
                  {new Date(lead.scannedAt).toLocaleDateString()}
                </span>
              </Link>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
