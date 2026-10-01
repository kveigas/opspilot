import React, { useState } from 'react';
import { CalendarClock, FastForward, HelpCircle, Loader2, RotateCcw } from 'lucide-react';
import { api } from '../api/client';
import { useDemoAction } from '../api/demoActions';
import { useSnapshotStatus } from '../api/demoSnapshot';
import { Modal } from './Modal';
import { Button } from './ui';
import { ROUTES } from '../routes';
import { useCampaigns } from '../state/CampaignContext';
import { formatDate } from '../lib/format';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onRefresh?: () => void;
  onHelp?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab, onRefresh, onHelp }) => {
  const demoAction = useDemoAction();
  const snapshotStatus = useSnapshotStatus();
  const { campaigns, selectedId, selected, select } = useCampaigns();
  const [confirmReset, setConfirmReset] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState<boolean>(false);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);

  const handleAdvanceWorkday = async () => {
    setIsAdvancing(true);
    setFeedback(null);
    try {
      const result = await api.advanceDemoWorkday();
      onRefresh?.();
      const tiers = result?.qa_sampled_by_tier ?? {};
      const atRisk = tiers.AT_RISK ? ` (${tiers.AT_RISK} from at-risk annotators)` : '';
      setFeedback({
        kind: 'success',
        message: result?.worked_date
          ? `Workday ${formatDate(result.worked_date)} complete: ${result.advanced_to_submitted} tasks submitted, ${result.qa_sampled} sampled for QA${atRisk}, ${result.qa_rework} sent back for rework. Now ${formatDate(result.operational_date)}.`
          : 'Workday advanced and the current view was refreshed.',
      });
    } catch (err: any) {
      console.error('Failed to advance demo workday:', err);
      setFeedback({ kind: 'error', message: 'Unable to advance the demo right now. Please retry.' });
    } finally {
      setIsAdvancing(false);
    }
  };

  const handleResetDemo = async () => {
    setConfirmReset(false);
    setIsResetting(true);
    setFeedback(null);
    try {
      await api.resetDemo();
      onRefresh?.();
      setFeedback({ kind: 'success', message: 'Demo reset to the deterministic baseline.' });
    } catch (err: any) {
      console.error('Failed to reset demo:', err);
      setFeedback({ kind: 'error', message: 'Unable to reset the demo right now. Please retry.' });
    } finally {
      setIsResetting(false);
    }
  };

  const busy = isAdvancing || isResetting || Boolean(demoAction);
  const groups = Array.from(new Set(ROUTES.map(r => r.group)));

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/95 backdrop-blur supports-[backdrop-filter]:bg-slate-950/80">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-700 text-sm font-bold text-white" aria-hidden="true">
                OP
              </div>
              <div className="leading-tight">
                <span className="block text-base font-semibold text-slate-50">OpsPilot</span>
                <span className="block text-xs text-slate-400">Human-data campaign operations</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {campaigns.length > 0 && (
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="hidden md:inline">Campaign</span>
                  <select
                    aria-label="Active campaign"
                    value={selectedId}
                    onChange={(e) => select(e.target.value)}
                    className="max-w-[220px] rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100"
                  >
                    {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
              )}
              {selected?.simulated_clock && (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-800/70 bg-amber-950/40 px-2.5 py-1.5 text-xs text-amber-200" title="Synthetic demo campaign running on a simulation clock">
                  <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Simulated day · {formatDate(selected.operational_date)}</span>
                </span>
              )}
              {snapshotStatus !== 'live' && (
                <span
                  role="status"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-sky-800/70 bg-sky-950/40 px-2.5 py-1.5 text-xs text-sky-200"
                  title="The demo server sleeps when idle and can take up to a minute to start. Until then you see the demo's starting data; actions run as soon as the server is ready."
                >
                  <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" />
                  <span>{snapshotStatus === 'starting' ? 'Live server starting · your action runs when it is ready' : 'Live server starting · showing saved demo data'}</span>
                </span>
              )}
              <Button variant="primary" size="sm" onClick={handleAdvanceWorkday} disabled={busy}>
                <FastForward className="h-4 w-4" aria-hidden="true" />
                {isAdvancing ? 'Advancing…' : 'Advance workday'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmReset(true)} disabled={busy}>
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                {isResetting ? 'Resetting…' : 'Reset demo'}
              </Button>
              <Button variant="ghost" size="sm" onClick={onHelp} aria-label="Shortcuts and glossary">
                <HelpCircle className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>

          <nav className="-mx-1 flex gap-1 overflow-x-auto pb-2" aria-label="Main navigation">
            {groups.map((group, index) => (
              <div key={group} className="flex items-center gap-1">
                {index > 0 && <span className="mx-1 h-5 w-px bg-slate-800" aria-hidden="true" />}
                {ROUTES.filter(r => r.group === group).map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      title={`${group} · shortcut ${tab.shortcut}`}
                      className={`whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors ${
                        isActive ? 'bg-emerald-700 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>
      </header>
      <Modal isOpen={confirmReset} onClose={() => setConfirmReset(false)} title="Reset synthetic demo?">
        <p className="leading-relaxed text-slate-300">This replaces the demo campaign, tasks, workers, QA history and the simulation clock with the original baseline. Your progress in this shared demo will be lost.</p>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button onClick={() => setConfirmReset(false)}>Keep my progress</Button>
          <Button variant="danger" disabled={Boolean(demoAction)} onClick={handleResetDemo}>Confirm reset</Button>
        </div>
      </Modal>
      {feedback && (
        <div
          role="status"
          aria-live="polite"
          className={`border-b px-4 py-2 text-center text-sm ${
            feedback.kind === 'success'
              ? 'border-emerald-800 bg-emerald-950/80 text-emerald-100'
              : 'border-rose-800 bg-rose-950/80 text-rose-100'
          }`}
        >
          {feedback.message}
        </div>
      )}
    </>
  );
};
