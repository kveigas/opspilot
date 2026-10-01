import { useSyncExternalStore } from 'react';

let pending: string | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

export const useDemoAction = () => useSyncExternalStore(subscribe, () => pending);

export async function runDemoAction<T>(name: string, action: () => Promise<T>): Promise<T> {
  if (pending) throw new Error(`${pending} is still running. Wait for it to finish before starting another demo action.`);
  pending = name;
  notify();
  try { return await action(); }
  finally { pending = null; notify(); }
}
