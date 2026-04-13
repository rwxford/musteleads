const SYNC_QUEUE_KEY = 'musteleads_sync_queue';

interface QueueItem {
  type: string;
  data: Record<string, unknown>;
  queuedAt: string;
}

/**
 * Sync a lead to the server. Non-blocking — failures are logged
 * but don't block the user. Offline leads sync when back online.
 */
export async function syncLeadToServer(lead: Record<string, unknown>): Promise<void> {
  try {
    const res = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lead),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch {
    queueForSync('leads', lead);
  }
}

/**
 * Sync a debug trace to the server. Strips large image data URLs
 * before sending.
 */
export async function syncTraceToServer(trace: Record<string, unknown>): Promise<void> {
  try {
    // Strip fields that are too large to POST.
    const payload = { ...trace };
    delete payload.rawImageDataUrl;
    delete payload.preprocessedImageDataUrl;

    const res = await fetch('/api/traces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch {
    // Strip image data before queueing too.
    const queued = { ...trace };
    delete queued.rawImageDataUrl;
    delete queued.preprocessedImageDataUrl;
    queueForSync('traces', queued);
  }
}

/**
 * Send a log entry to the server. Fire and forget.
 */
export async function serverLog(
  level: 'info' | 'warn' | 'error' | 'debug',
  message: string,
  data?: Record<string, unknown>,
  source?: string,
): Promise<void> {
  try {
    await fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level, message, data, source }),
    });
  } catch {
    // Fire and forget — don't queue logs.
  }
}

/**
 * Process the offline sync queue. Called when the app detects
 * connectivity has been restored.
 */
export async function processSyncQueue(): Promise<void> {
  if (typeof window === 'undefined') return;

  const raw = localStorage.getItem(SYNC_QUEUE_KEY);
  if (!raw) return;

  let queue: QueueItem[];
  try {
    queue = JSON.parse(raw);
  } catch {
    localStorage.removeItem(SYNC_QUEUE_KEY);
    return;
  }

  const remaining: QueueItem[] = [];

  for (const item of queue) {
    try {
      const endpoint = item.type === 'leads' ? '/api/leads' : '/api/traces';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.data),
      });
      if (!res.ok) {
        remaining.push(item);
      }
    } catch {
      remaining.push(item);
    }
  }

  if (remaining.length > 0) {
    localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(remaining));
  } else {
    localStorage.removeItem(SYNC_QUEUE_KEY);
  }
}

/**
 * Append a failed sync item to the localStorage queue.
 */
function queueForSync(type: string, data: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;

  try {
    const raw = localStorage.getItem(SYNC_QUEUE_KEY);
    const queue: QueueItem[] = raw ? JSON.parse(raw) : [];
    queue.push({ type, data, queuedAt: new Date().toISOString() });
    localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Storage full or unavailable — drop silently.
  }
}
