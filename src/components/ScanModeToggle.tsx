'use client';

interface ScanModeToggleProps {
  mode: 'badge' | 'card';
  onModeChange: (mode: 'badge' | 'card') => void;
}

export default function ScanModeToggle({ mode, onModeChange }: ScanModeToggleProps) {
  return (
    <div className="inline-flex rounded-full bg-zinc-900 p-1">
      <button
        onClick={() => onModeChange('badge')}
        className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
          mode === 'badge' ? 'bg-black text-white' : 'text-white/40'
        }`}
      >
        {/* QR code icon. */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="2" width="8" height="8" rx="1" />
          <rect x="14" y="2" width="8" height="8" rx="1" />
          <rect x="2" y="14" width="8" height="8" rx="1" />
          <rect x="14" y="14" width="4" height="4" rx="0.5" />
          <line x1="22" y1="14" x2="22" y2="22" />
          <line x1="14" y1="22" x2="22" y2="22" />
        </svg>
        Badge
      </button>
      <button
        onClick={() => onModeChange('card')}
        className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
          mode === 'card' ? 'bg-black text-white' : 'text-white/40'
        }`}
      >
        {/* Card / rectangle icon. */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
          <line x1="1" y1="10" x2="23" y2="10" />
        </svg>
        Card
      </button>
    </div>
  );
}
