import { useCallback, useEffect, useState } from 'react';
import { Navbar } from './components/Navbar';
import { HelpDialog } from './components/HelpDialog';
import { TodayPage } from './pages/TodayPage';
import { CampaignsPage } from './pages/CampaignsPage';
import { WorkforcePage } from './pages/WorkforcePage';
import { CalibrationPage } from './pages/CalibrationPage';
import { AllocationsPage } from './pages/AllocationsPage';
import { ExecutionPage } from './pages/ExecutionPage';
import { QAPage } from './pages/QAPage';
import { QualityPage } from './pages/QualityPage';
import { DeliveryPage } from './pages/DeliveryPage';
import { CampaignProvider, useCampaigns } from './state/CampaignContext';
import { LIVE_EVENT, type LiveSwitchDetail } from './api/demoSnapshot';
import { ROUTES, routeFromHash } from './routes';

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

function Shell() {
  const [activeTab, setActiveTabState] = useState<string>(() => routeFromHash(window.location.hash));
  const [refreshVersion, setRefreshVersion] = useState<number>(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const { refresh: refreshCampaigns } = useCampaigns();

  // Accepts "qa" or "qa?tab=escalations"; the query selects a sub-view inside the page.
  const setActiveTab = useCallback((target: string) => {
    const route = routeFromHash(`#/${target}`);
    setActiveTabState(route);
    if (window.location.hash !== `#/${target}`) window.location.hash = `/${target}`;
    document.getElementById('main-content')?.focus({ preventScroll: true });
    document.documentElement.scrollTop = 0;
  }, []);

  useEffect(() => {
    const onHash = () => setActiveTabState(routeFromHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (event.key === '?') { event.preventDefault(); setHelpOpen(true); return; }
      const route = ROUTES.find(r => r.shortcut === event.key);
      if (route) { event.preventDefault(); setActiveTab(route.id); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [setActiveTab]);

  const refreshCurrentPage = useCallback(() => {
    void refreshCampaigns();
    setRefreshVersion((version) => version + 1);
  }, [refreshCampaigns]);

  // The instant-demo snapshot hands over to the live API. A freshly seeded demo is identical to
  // what is on screen; otherwise reload from the live API, but leave a page whose action is about
  // to run alone (it refreshes itself when the action finishes).
  useEffect(() => {
    const onLive = (event: Event) => {
      const { seeded, actionPending } = (event as CustomEvent<LiveSwitchDetail>).detail;
      if (seeded) return;
      void refreshCampaigns();
      if (!actionPending) setRefreshVersion((version) => version + 1);
    };
    window.addEventListener(LIVE_EVENT, onLive);
    return () => window.removeEventListener(LIVE_EVENT, onLive);
  }, [refreshCampaigns]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased flex flex-col">
      <a className="skip-link" href="#main-content">Skip to workspace</a>
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} onRefresh={refreshCurrentPage} onHelp={() => setHelpOpen(true)} />

      <main id="main-content" tabIndex={-1} className="flex-1 min-w-0 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 outline-none">
        {activeTab === 'today' && <TodayPage key={refreshVersion} onNavigate={setActiveTab} />}
        {activeTab === 'campaigns' && <CampaignsPage key={refreshVersion} />}
        {activeTab === 'workforce' && <WorkforcePage key={refreshVersion} />}
        {activeTab === 'calibration' && <CalibrationPage key={refreshVersion} />}
        {activeTab === 'allocations' && <AllocationsPage key={refreshVersion} />}
        {activeTab === 'execution' && <ExecutionPage key={refreshVersion} />}
        {activeTab === 'qa' && <QAPage key={refreshVersion} />}
        {activeTab === 'quality' && <QualityPage key={refreshVersion} onNavigate={setActiveTab} />}
        {activeTab === 'delivery' && <DeliveryPage key={refreshVersion} onNavigate={setActiveTab} />}
      </main>

      <footer className="border-t border-slate-800 bg-slate-950 py-5 text-center text-xs text-slate-400">
        OpsPilot · human-data campaign operations · synthetic demonstration data · press <kbd className="font-mono">?</kbd> for shortcuts
      </footer>
      <HelpDialog isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

export function App() {
  return (
    <CampaignProvider>
      <Shell />
    </CampaignProvider>
  );
}

export default App;
