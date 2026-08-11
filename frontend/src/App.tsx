import { useState } from 'react';
import { Navbar } from './components/Navbar';
import { TodayPage } from './pages/TodayPage';
import { CampaignsPage } from './pages/CampaignsPage';
import { WorkforcePage } from './pages/WorkforcePage';
import { CalibrationPage } from './pages/CalibrationPage';
import { AllocationsPage } from './pages/AllocationsPage';
import { ExecutionPage } from './pages/ExecutionPage';
import { QAPage } from './pages/QAPage';
import { DeliveryPage } from './pages/DeliveryPage';

export function App() {
  const [activeTab, setActiveTab] = useState<string>('today');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased flex flex-col">
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'today' && <TodayPage onNavigate={setActiveTab} />}
        {activeTab === 'campaigns' && <CampaignsPage />}
        {activeTab === 'workforce' && <WorkforcePage />}
        {activeTab === 'calibration' && <CalibrationPage />}
        {activeTab === 'allocations' && <AllocationsPage />}
        {activeTab === 'execution' && <ExecutionPage />}
        {activeTab === 'qa' && <QAPage />}
        {activeTab === 'delivery' && <DeliveryPage />}
      </main>

      <footer className="bg-slate-900 border-t border-slate-800 py-4 text-center text-xs text-slate-400">
        OpsPilot v1.0.0-rc1 • Human Data Campaign Operations Control • Phase 3 Verification Complete
      </footer>
    </div>
  );
}

export default App;
