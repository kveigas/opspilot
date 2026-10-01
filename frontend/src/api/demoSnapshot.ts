import { useSyncExternalStore } from 'react';

// Instant demo. The hosted API sleeps when idle and can take up to a minute to wake. The demo's
// starting state is deterministic, so its read responses are captured at deploy time by the
// same code that serves the API (scripts/build_demo_snapshot.py). When the API does not answer
// at once, pages read the snapshot while it wakes; actions wait for the live API, and once it is
// ready every request goes live.

interface Manifest {
  snapshot_version: string;
  generated_at: string;
  entries: Record<string, string>;
  task_histories?: string;
}

export type DemoMode = 'live' | 'snapshot';

/** live: requests go to the API · preview: pages show the snapshot · starting: an action waits for the API. */
export type SnapshotStatus = 'live' | 'preview' | 'starting';

export interface LiveApi {
  /** Settles quickly: resolves when the live API is awake. The request also starts waking it. */
  probe: () => Promise<unknown>;
  /** Resolves once the live API is awake and holds the demo; true when it had to seed the demo. */
  wake: () => Promise<boolean>;
}

/** Dispatched on window when requests switch from the snapshot to the live API. */
export const LIVE_EVENT = 'opspilot:live-api';

export interface LiveSwitchDetail {
  /** The live demo was seeded just now, so it is identical to the snapshot already on screen. */
  seeded: boolean;
  /** An action is about to run; the page that started it refreshes when it finishes. */
  actionPending: boolean;
}

let enabled = import.meta.env.MODE !== 'test';
let baseUrl = `${import.meta.env.BASE_URL}demo-snapshot/`;
let manifestPromise: Promise<Manifest | null> | null = null;
let modePromise: Promise<DemoMode> | null = null;
let livePromise: Promise<void> | null = null;
let waitingActions = 0;
const fileCache = new Map<string, Promise<unknown>>();

let status: SnapshotStatus = 'live';
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
function setStatus(next: SnapshotStatus) {
  if (next === status) return;
  status = next;
  listeners.forEach(listener => listener());
}

export const useSnapshotStatus = () => useSyncExternalStore(subscribe, () => status);

/** Test hook: turn the snapshot on or off, point it at another location and start over. */
export function configureSnapshot(options: { enabled: boolean; baseUrl?: string }): void {
  enabled = options.enabled;
  if (options.baseUrl) baseUrl = options.baseUrl;
  manifestPromise = null;
  modePromise = null;
  livePromise = null;
  waitingActions = 0;
  fileCache.clear();
  setStatus('live');
}

/** Canonical request key, identical to request_key() in the build script. */
export function requestKey(method: string, endpoint: string): string {
  const url = new URL(endpoint, 'http://snapshot.local');
  const params = [...url.searchParams.entries()].sort(([ak, av], [bk, bv]) =>
    ak < bk ? -1 : ak > bk ? 1 : av < bv ? -1 : av > bv ? 1 : 0,
  );
  const query = new URLSearchParams(params).toString();
  return `${method.toUpperCase()} ${url.pathname}${query ? `?${query}` : ''}`;
}

function loadManifest(): Promise<Manifest | null> {
  if (!enabled) return Promise.resolve(null);
  manifestPromise ??= fetch(`${baseUrl}manifest.json`)
    .then(async (response) => {
      if (!response.ok) return null;
      const body = (await response.json()) as Partial<Manifest>;
      return body && body.entries ? (body as Manifest) : null;
    })
    .catch(() => null);
  return manifestPromise;
}

function loadFile(name: string): Promise<unknown> {
  let cached = fileCache.get(name);
  if (!cached) {
    cached = fetch(`${baseUrl}${name}`).then((response) => {
      if (!response.ok) throw new Error(`Snapshot file missing: ${name}`);
      return response.json() as Promise<unknown>;
    });
    cached.catch(() => fileCache.delete(name));
    fileCache.set(name, cached);
  }
  return cached;
}

/** Decided once per page load: live when the API answers the probe, otherwise the snapshot while it wakes. */
export function demoMode(live: LiveApi): Promise<DemoMode> {
  modePromise ??= (async (): Promise<DemoMode> => {
    if (!enabled) return 'live';
    const manifest = loadManifest();
    const awake = await live.probe().then(() => true, () => false);
    if (awake || !(await manifest)) return 'live';
    setStatus('preview');
    goLive(live).catch(() => undefined); // keep waking in the background; actions retry on failure
    return 'snapshot';
  })();
  return modePromise;
}

function goLive(live: LiveApi): Promise<void> {
  livePromise ??= live.wake().then(
    (seeded) => {
      modePromise = Promise.resolve('live');
      setStatus('live');
      window.dispatchEvent(new CustomEvent<LiveSwitchDetail>(LIVE_EVENT, {
        detail: { seeded, actionPending: waitingActions > 0 },
      }));
    },
    (error: unknown) => {
      livePromise = null;
      throw error;
    },
  );
  return livePromise;
}

/** Waits until requests can go to the live API; actions are shown as waiting meanwhile. */
export async function whenLive(live: LiveApi, action: boolean): Promise<void> {
  if (action) {
    waitingActions += 1;
    setStatus('starting');
  }
  try {
    await goLive(live);
  } finally {
    if (action) {
      waitingActions -= 1;
      if (waitingActions === 0 && status === 'starting') setStatus('preview');
    }
  }
}

/** The snapshot's response to a GET, or undefined when the snapshot cannot answer it. */
export async function snapshotFor(endpoint: string): Promise<unknown | undefined> {
  const manifest = await loadManifest();
  if (!manifest) return undefined;
  try {
    const history = /^\/tasks\/([^/?]+)\/history$/.exec(endpoint);
    if (history) {
      if (!manifest.task_histories) return undefined;
      const histories = (await loadFile(manifest.task_histories)) as Record<string, unknown>;
      return histories[decodeURIComponent(history[1])];
    }
    const file = manifest.entries[requestKey('GET', endpoint)];
    return file ? await loadFile(file) : undefined;
  } catch {
    return undefined; // a missing file is answered by the live API instead
  }
}
