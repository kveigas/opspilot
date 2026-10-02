import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';

const STORAGE_KEY = 'opspilot.selectedCampaign';

export interface CampaignState {
  campaigns: any[];
  selectedId: string;
  selected: any | null;
  select: (id: string) => void;
  refresh: () => Promise<void>;
  loading: boolean;
  error: string | null;
}

const CampaignContext = createContext<CampaignState | null>(null);

function readStored(): string {
  try { return window.localStorage.getItem(STORAGE_KEY) ?? ''; } catch { return ''; }
}

function useCampaignLoader(enabled: boolean, seedWhenEmpty = false): CampaignState {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string>(readStored);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      let data = (await api.getCampaigns()) ?? [];
      // A restarted free-tier server comes back empty. Seed the demo whichever page the visitor
      // opened first (not only Today), but only after a successful, genuinely empty response.
      if (seedWhenEmpty && data.length === 0) {
        await api.bootstrapDemo(false);
        data = (await api.getCampaigns()) ?? [];
      }
      setCampaigns(data);
      // Keep a valid saved choice; otherwise prefer the simulated demo campaign, then the newest.
      setSelectedId(current => (data.some((c: any) => c.id === current)
        ? current
        : (data.find((c: any) => c.simulated_clock) ?? data[0])?.id ?? ''));
    } catch {
      setError('Campaigns could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [enabled, seedWhenEmpty]);

  useEffect(() => { void refresh(); }, [refresh]);

  const select = useCallback((id: string) => {
    setSelectedId(id);
    try { window.localStorage.setItem(STORAGE_KEY, id); } catch { /* storage unavailable */ }
  }, []);

  const selected = useMemo(() => campaigns.find(c => c.id === selectedId) ?? null, [campaigns, selectedId]);
  // Pages load data per selected id; hand them one only once it exists, so a saved id is not
  // queried (and left failed) before a restarted server has re-seeded its demo.
  return { campaigns, selectedId: selected ? selectedId : '', selected, select, refresh, loading, error };
}

export const CampaignProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const state = useCampaignLoader(true, true);
  return <CampaignContext.Provider value={state}>{children}</CampaignContext.Provider>;
};

/** Shared campaign selection; pages rendered on their own (e.g. in tests) load their own list. */
export function useCampaigns(): CampaignState {
  const shared = useContext(CampaignContext);
  const local = useCampaignLoader(shared === null);
  return shared ?? local;
}
