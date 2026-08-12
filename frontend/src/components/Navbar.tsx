import React, { useState } from 'react';
import { api } from '../api/client';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onRefresh?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab, onRefresh }) => {
  const [isAdvancing, setIsAdvancing] = useState<boolean>(false);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);

  const handleAdvanceWorkday = async () => {
    setIsAdvancing(true);
    setFeedback(null);
    try {
      await api.advanceDemoWorkday();
      if (onRefresh) onRefresh();
      setFeedback({ kind: 'success', message: 'Workday advanced and the current view was refreshed.' });
    } catch (err: any) {
      console.error('Failed to advance demo workday:', err);
      setFeedback({ kind: 'error', message: 'Unable to advance the demo right now. Please retry.' });
    } finally {
      setIsAdvancing(false);
    }
  };

  const handleResetDemo = async () => {
    setIsResetting(true);
    setFeedback(null);
    try {
      await api.resetDemo();
      if (onRefresh) onRefresh();
      setFeedback({ kind: 'success', message: 'Demo reset to the deterministic baseline.' });
    } catch (err: any) {
      console.error('Failed to reset demo:', err);
      setFeedback({ kind: 'error', message: 'Unable to reset the demo right now. Please retry.' });
    } finally {
      setIsResetting(false);
    }
  };

  const tabs = [
    { id: 'today', label: 'Today', enabled: true },
    { id: 'campaigns', label: 'Campaigns', enabled: true },
    { id: 'workforce', label: 'Workforce', enabled: true },
    { id: 'calibration', label: 'Calibration', enabled: true },
    { id: 'allocations', label: 'Allocations', enabled: true },
    { id: 'execution', label: 'Execution', enabled: true },
    { id: 'qa', label: 'QA & Escalations', enabled: true },
    { id: 'delivery', label: 'Delivery', enabled: true },
  ];

  return (
    <>
    <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between py-2 md:h-16 gap-2">
          {/* Brand & Demo Provenance */}
          <div className="flex items-center space-x-3 w-full md:w-auto justify-between md:justify-start">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-700 flex items-center justify-center font-bold text-white shadow-lg shadow-emerald-950/60">
                OP
              </div>
              <div>
                <span className="font-bold text-lg text-slate-100 tracking-tight">OpsPilot</span>
                <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/80">
                  Phase 4 Public Demo
                </span>
              </div>
            </div>

            {/* Quick Demo Controls */}
            <div className="flex items-center space-x-2">
              <span className="hidden lg:inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-950/60 text-amber-300 border border-amber-800">
                SYNTHETIC DEMO DATA
              </span>
              <button
                onClick={handleAdvanceWorkday}
                disabled={isAdvancing}
                className="px-2.5 py-1 text-xs font-bold rounded bg-emerald-800 hover:bg-emerald-700 text-white transition border border-emerald-700"
              >
                {isAdvancing ? 'Advancing...' : '⚡ Advance Workday'}
              </button>
              <button
                onClick={handleResetDemo}
                disabled={isResetting}
                className="px-2 py-1 text-xs font-semibold rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition border border-slate-700"
              >
                {isResetting ? 'Resetting...' : '🔄 Reset'}
              </button>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex space-x-1 sm:space-x-2 overflow-x-auto py-1 w-full md:w-auto" aria-label="Main Navigation">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-2.5 sm:py-1.5 text-xs sm:text-sm font-semibold rounded-md transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-emerald-700 text-white shadow-sm'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
    {feedback && (
      <div
        role="status"
        aria-live="polite"
        className={`px-4 py-2 text-center text-xs border-b ${
          feedback.kind === 'success'
            ? 'bg-emerald-950/80 border-emerald-800 text-emerald-200'
            : 'bg-rose-950/80 border-rose-800 text-rose-200'
        }`}
      >
        {feedback.message}
      </div>
    )}
    </>
  );
};
