import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import { api } from '../src/api/client';
import {
  LIVE_EVENT,
  configureSnapshot,
  demoMode,
  requestKey,
  snapshotFor,
  useSnapshotStatus,
  whenLive,
  type LiveApi,
  type LiveSwitchDetail,
} from '../src/api/demoSnapshot';

const manifest = {
  snapshot_version: 'demo-snapshot-1',
  generated_at: '2026-10-01T00:00:00Z',
  entries: {
    'GET /today': 'today.json',
    'GET /tasks?campaign_id=c1&limit=100&state=IN_REVIEW': 'review.json',
    'GET /campaigns': 'missing.json',
  },
  task_histories: 'histories.json',
};
const files: Record<string, unknown> = {
  'today.json': { campaign_count: 1, source: 'snapshot' },
  'review.json': [{ id: 't1' }],
  'histories.json': { t1: { task_id: 't1', events: [] } },
};

const json = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 404, statusText: '', json: async () => body });

function staticSite(url: string, deployed = true) {
  if (url === '/snap/manifest.json') return deployed ? json(manifest) : json({}, false);
  const name = url.replace('/snap/', '');
  return name in files ? json(files[name]) : json({ detail: 'Not found' }, false);
}

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function liveSwitches() {
  const events: LiveSwitchDetail[] = [];
  const listener = (event: Event) => events.push((event as CustomEvent<LiveSwitchDetail>).detail);
  window.addEventListener(LIVE_EVENT, listener);
  return { events, stop: () => window.removeEventListener(LIVE_EVENT, listener) };
}

beforeEach(() => configureSnapshot({ enabled: true, baseUrl: '/snap/' }));
afterEach(() => {
  vi.unstubAllGlobals();
  configureSnapshot({ enabled: false });
});

describe('instant-demo snapshot', () => {
  it('builds the same request key as the build script', () => {
    expect(requestKey('get', '/tasks?state=IN_REVIEW&limit=100&campaign_id=c1'))
      .toBe('GET /tasks?campaign_id=c1&limit=100&state=IN_REVIEW');
    expect(requestKey('GET', '/today')).toBe('GET /today');
  });

  it('uses the live API when it answers the first probe', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => staticSite(url)));
    const live: LiveApi = { probe: vi.fn().mockResolvedValue({}), wake: vi.fn() };
    await expect(demoMode(live)).resolves.toBe('live');
    expect(live.wake).not.toHaveBeenCalled();
  });

  it('uses the live API when no snapshot is deployed', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => staticSite(url, false)));
    const live: LiveApi = { probe: vi.fn().mockRejectedValue(new Error('asleep')), wake: vi.fn() };
    await expect(demoMode(live)).resolves.toBe('live');
    expect(live.wake).not.toHaveBeenCalled();
  });

  it('answers reads from the snapshot while the API wakes', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => staticSite(url)));
    const live: LiveApi = { probe: vi.fn().mockRejectedValue(new Error('asleep')), wake: () => new Promise(() => undefined) };
    await expect(demoMode(live)).resolves.toBe('snapshot');

    await expect(snapshotFor('/tasks?state=IN_REVIEW&limit=100&campaign_id=c1')).resolves.toEqual([{ id: 't1' }]);
    await expect(snapshotFor('/tasks/t1/history')).resolves.toEqual({ task_id: 't1', events: [] });
    await expect(snapshotFor('/tasks/unknown/history')).resolves.toBeUndefined();
    await expect(snapshotFor('/campaigns')).resolves.toBeUndefined(); // file missing: ask the live API
    await expect(snapshotFor('/workers')).resolves.toBeUndefined();
  });

  it('switches to live once the API is awake and reports whether the data can differ', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => staticSite(url)));
    const woken = deferred<boolean>();
    const live: LiveApi = { probe: vi.fn().mockRejectedValue(new Error('asleep')), wake: vi.fn(() => woken.promise) };
    const switches = liveSwitches();
    const status = renderHook(() => useSnapshotStatus());

    await demoMode(live);
    await waitFor(() => expect(status.result.current).toBe('preview'));
    const action = whenLive(live, true);
    await waitFor(() => expect(status.result.current).toBe('starting'));

    woken.resolve(true);
    await action;
    expect(switches.events).toEqual([{ seeded: true, actionPending: true }]);
    await expect(demoMode(live)).resolves.toBe('live');
    await waitFor(() => expect(status.result.current).toBe('live'));
    expect(live.wake).toHaveBeenCalledTimes(1);
    switches.stop();
  });

  it('wakes the API again after a failed attempt', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => staticSite(url)));
    const attempts = [deferred<boolean>(), deferred<boolean>()];
    const live: LiveApi = {
      probe: vi.fn().mockRejectedValue(new Error('asleep')),
      wake: vi.fn(() => attempts[vi.mocked(live.wake).mock.calls.length - 1].promise),
    };
    await demoMode(live);
    const action = whenLive(live, true); // joins the background attempt
    attempts[0].reject(new Error('still down'));
    await expect(action).rejects.toThrow('still down');

    const retry = whenLive(live, true);
    attempts[1].resolve(false);
    await expect(retry).resolves.toBeUndefined();
    expect(live.wake).toHaveBeenCalledTimes(2);
  });
});

describe('API client with the instant demo', () => {
  it('renders from the snapshot at once and runs actions after the live API is seeded', async () => {
    const server = deferred();
    let healthChecks = 0;
    const apiCalls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith('/snap/')) return staticSite(url);
      apiCalls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url === '/api/v1/health') {
        if (healthChecks++ === 0) throw new TypeError('Failed to fetch'); // asleep: the probe fails
        await server.promise;
        return json({ status: 'healthy' });
      }
      if (url === '/api/v1/campaigns') return json([]);
      if (url === '/api/v1/demo/bootstrap?reset=false') return json({ status: 'DEMO_INITIALIZED' });
      if (url === '/api/v1/demo/advance-workday') return json({ worked_date: '2026-08-11' });
      if (url === '/api/v1/today') return json({ campaign_count: 1, source: 'live' });
      return json({ detail: 'Not found' }, false);
    }));

    await expect(api.getTodayCockpit()).resolves.toEqual({ campaign_count: 1, source: 'snapshot' });
    const advancing = api.advanceDemoWorkday();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(apiCalls).not.toContain('POST /api/v1/demo/advance-workday');

    server.resolve();
    await expect(advancing).resolves.toEqual({ worked_date: '2026-08-11' });
    expect(apiCalls).toEqual([
      'GET /api/v1/health',
      'GET /api/v1/health',
      'GET /api/v1/campaigns',
      'POST /api/v1/demo/bootstrap?reset=false',
      'POST /api/v1/demo/advance-workday',
    ]);
    await expect(api.getTodayCockpit()).resolves.toEqual({ campaign_count: 1, source: 'live' });
  });
});
