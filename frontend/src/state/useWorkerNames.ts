import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { shortId } from '../lib/format';

let cache: Promise<Record<string, string>> | null = null;

function loadNames(): Promise<Record<string, string>> {
  if (!cache) {
    const request = typeof api.getWorkers === 'function' ? api.getWorkers() : Promise.resolve([]);
    cache = Promise.resolve(request)
      .then((workers: any[] = []) => Object.fromEntries(workers.map(w => [w.id, w.name])))
      .catch(() => {
        cache = null;
        return {};
      });
  }
  return cache;
}

export function invalidateWorkerNames(): void {
  cache = null;
}

/** Resolve worker IDs to human names; falls back to a short ID. */
export function useWorkerNames(): (id?: string | null) => string {
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    void loadNames().then(result => { if (alive) setNames(result); });
    return () => { alive = false; };
  }, []);
  return (id?: string | null) => (id ? names[id] ?? shortId(id) : '—');
}
