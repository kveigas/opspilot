import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { StatusBadge } from '../components/StatusBadge';

interface TodayPageProps {
  onNavigate?: (tab: string) => void;
}

export const TodayPage: React.FC<TodayPageProps> = ({ onNavigate }) => {
  const [cockpit, setCockpit] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isBootstrapping, setIsBootstrapping] = useState<boolean>(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const cockpitData = await api.getTodayCockpit();
      setCockpit(cockpitData);

      const logs = await api.getAuditLogs();
      setAuditLogs(logs.slice(0, 10));
    } catch (err) {
      console.error('Failed to load Today cockpit data', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBootstrapDemo = async () => {
    setIsBootstrapping(true);
    try {
      await api.bootstrapDemo(true);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to bootstrap demo campaign');
    } finally {
      setIsBootstrapping(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="space-y-6">
      {/* Demo Hero Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border border-slate-700 rounded-xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <span className="px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-amber-950/80 text-amber-300 border border-amber-800">
                SYNTHETIC DEMO DATA
              </span>
              <span className="text-xs text-slate-400 font-mono">Scenario: Multilingual AI Response Evaluation (v1.0.0)</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
              Manager Today Cockpit
            </h1>
            <p className="text-sm text-slate-300 max-w-3xl">
              Rules-based operational cockpit for AI data campaign managers. Monitor workforce capacity, enforce task state machines, isolate critical escalations, and validate deterministic delivery readiness.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
            <button
              onClick={handleBootstrapDemo}
              disabled={isBootstrapping}
              className="w-full sm:w-auto px-5 py-2.5 text-sm font-bold rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-950/60 transition border border-emerald-600"
            >
              {isBootstrapping ? 'Loading Scenario...' : '🚀 Load Public Demo Scenario'}
            </button>
          </div>
        </div>

        {/* Manager Guidance Checklist */}
        <div className="mt-6 pt-4 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-3 md:grid-cols-6 gap-2 text-center text-xs">
          <button onClick={() => onNavigate && onNavigate('qa')} className="p-2 rounded bg-slate-950/60 border border-slate-800 hover:border-slate-700 text-slate-300">
            <span className="block font-bold text-rose-400">1. Resolve Escalation</span>
            <span className="text-[10px] text-slate-400">Unblock Guideline Issue</span>
          </button>
          <button onClick={() => onNavigate && onNavigate('calibration')} className="p-2 rounded bg-slate-950/60 border border-slate-800 hover:border-slate-700 text-slate-300">
            <span className="block font-bold text-amber-400">2. Calibrate Worker</span>
            <span className="text-[10px] text-slate-400">Qualify Annotator 11</span>
          </button>
          <button onClick={() => onNavigate && onNavigate('workforce')} className="p-2 rounded bg-slate-950/60 border border-slate-800 hover:border-slate-700 text-slate-300">
            <span className="block font-bold text-blue-400">3. Unlock Capacity</span>
            <span className="text-[10px] text-slate-400">Expand Worker 12</span>
          </button>
          <button onClick={() => onNavigate && onNavigate('allocations')} className="p-2 rounded bg-slate-950/60 border border-slate-800 hover:border-slate-700 text-slate-300">
            <span className="block font-bold text-cyan-400">4. Run Allocation</span>
            <span className="text-[10px] text-slate-400">Distribute Backlog</span>
          </button>
          <button onClick={() => api.advanceDemoWorkday().then(loadData)} className="p-2 rounded bg-slate-950/60 border border-slate-800 hover:border-slate-700 text-slate-300">
            <span className="block font-bold text-emerald-400">5. Advance Workday</span>
            <span className="text-[10px] text-slate-400">Execute Workflow</span>
          </button>
          <button onClick={() => onNavigate && onNavigate('delivery')} className="p-2 rounded bg-slate-950/60 border border-slate-800 hover:border-slate-700 text-slate-300">
            <span className="block font-bold text-emerald-300">6. Delivery Gate</span>
            <span className="text-[10px] text-slate-400">Verify Readiness</span>
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-slate-400 text-sm animate-pulse">
          Starting OpsPilot demo environment... (initial cold start may take ~20 seconds)
        </div>
      ) : cockpit && (
        <div className="space-y-6">
          {/* Action Group 1: SLA Alerts (CRITICAL & AT_RISK Campaigns) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Critical Campaigns */}
            <div className="bg-rose-950/30 border border-rose-900/80 rounded-lg p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-rose-400 uppercase tracking-wider">CRITICAL Campaigns ({cockpit.critical_campaigns.length})</h2>
                {onNavigate && (
                  <button onClick={() => onNavigate('campaigns')} className="text-xs text-rose-300 underline font-semibold">
                    View Campaigns →
                  </button>
                )}
              </div>
              {cockpit.critical_campaigns.length === 0 ? (
                <p className="text-xs text-slate-400">No campaigns currently in CRITICAL SLA status.</p>
              ) : (
                <div className="space-y-2">
                  {cockpit.critical_campaigns.map((c: any) => (
                    <div key={c.campaign_id} className="bg-slate-900/80 p-3 rounded border border-rose-900/60 flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-sm text-slate-100">{c.campaign_name}</span>
                        <span className="block text-xs text-rose-300 font-mono mt-0.5">Capacity Ratio: {c.capacity_ratio}</span>
                      </div>
                      <div className="flex flex-wrap gap-1 justify-end">
                        {c.reason_codes.map((r: string) => (
                          <span key={r} className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-800">
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* At Risk Campaigns */}
            <div className="bg-amber-950/30 border border-amber-900/80 rounded-lg p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-amber-400 uppercase tracking-wider">AT_RISK Campaigns ({cockpit.at_risk_campaigns.length})</h2>
                {onNavigate && (
                  <button onClick={() => onNavigate('campaigns')} className="text-xs text-amber-300 underline font-semibold">
                    View Campaigns →
                  </button>
                )}
              </div>
              {cockpit.at_risk_campaigns.length === 0 ? (
                <p className="text-xs text-slate-400">No campaigns currently AT_RISK.</p>
              ) : (
                <div className="space-y-2">
                  {cockpit.at_risk_campaigns.map((c: any) => (
                    <div key={c.campaign_id} className="bg-slate-900/80 p-3 rounded border border-amber-900/60 flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-sm text-slate-100">{c.campaign_name}</span>
                        <span className="block text-xs text-amber-300 font-mono mt-0.5">Capacity Ratio: {c.capacity_ratio}</span>
                      </div>
                      <div className="flex flex-wrap gap-1 justify-end">
                        {c.reason_codes.map((r: string) => (
                          <span key={r} className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800">
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Action Group 2: Operational Action Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Critical Escalations */}
            <div className="bg-slate-800/80 border border-slate-700 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Critical Escalations ({cockpit.critical_escalations.length})</h2>
                {onNavigate && (
                  <button onClick={() => onNavigate('qa')} className="text-xs text-emerald-400 underline font-semibold">
                    Resolve →
                  </button>
                )}
              </div>
              {cockpit.critical_escalations.length === 0 ? (
                <p className="text-xs text-slate-400">Zero open critical escalations.</p>
              ) : (
                <div className="space-y-2">
                  {cockpit.critical_escalations.map((e: any) => (
                    <div key={e.id} className="bg-slate-900/90 p-2.5 rounded border border-slate-700">
                      <span className="font-semibold text-xs text-rose-300 block">{e.title}</span>
                      <span className="text-[11px] text-slate-400">{e.category} • {e.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Blocked Work */}
            <div className="bg-slate-800/80 border border-slate-700 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Blocked Work ({cockpit.blocked_work.length})</h2>
                {onNavigate && (
                  <button onClick={() => onNavigate('execution')} className="text-xs text-emerald-400 underline font-semibold">
                    Unblock →
                  </button>
                )}
              </div>
              {cockpit.blocked_work.length === 0 ? (
                <p className="text-xs text-slate-400">Zero blocked tasks.</p>
              ) : (
                <div className="space-y-2">
                  {cockpit.blocked_work.map((b: any) => (
                    <div key={b.task_id} className="bg-slate-900/90 p-2.5 rounded border border-slate-700 flex justify-between items-center">
                      <span className="font-mono text-xs text-rose-400">{b.task_id.substring(0, 8)}...</span>
                      <span className="text-[11px] text-slate-400">{new Date(b.updated_at).toLocaleTimeString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Rework Requiring Attention */}
            <div className="bg-slate-800/80 border border-slate-700 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Rework Items ({cockpit.rework_items.length})</h2>
                {onNavigate && (
                  <button onClick={() => onNavigate('qa')} className="text-xs text-emerald-400 underline font-semibold">
                    Review →
                  </button>
                )}
              </div>
              {cockpit.rework_items.length === 0 ? (
                <p className="text-xs text-slate-400">Zero active rework items.</p>
              ) : (
                <div className="space-y-2">
                  {cockpit.rework_items.map((r: any) => (
                    <div key={r.task_id} className="bg-slate-900/90 p-2.5 rounded border border-slate-700 flex justify-between items-center">
                      <span className="font-mono text-xs text-amber-300">{r.task_id.substring(0, 8)}...</span>
                      <span className="text-[11px] font-bold text-slate-300">Attempt {r.rework_count}/3</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Action Group 3: Delivery Candidates */}
          <div className="bg-emerald-950/20 border border-emerald-900/60 rounded-lg p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-emerald-400 uppercase tracking-wider">Delivery Candidates ({cockpit.delivery_candidates.length})</h2>
              {onNavigate && (
                <button onClick={() => onNavigate('delivery')} className="text-xs text-emerald-300 underline font-semibold">
                  Go to Delivery →
                </button>
              )}
            </div>
            {cockpit.delivery_candidates.length === 0 ? (
              <p className="text-xs text-slate-400">No campaigns ready for delivery evaluation yet.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {cockpit.delivery_candidates.map((d: any) => (
                  <div key={d.campaign_id} className="bg-slate-900/90 p-3 rounded border border-emerald-800 flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-sm text-slate-100">{d.campaign_name}</span>
                      <span className="block text-xs text-emerald-400 font-semibold">{d.status}</span>
                    </div>
                    <StatusBadge status={d.status} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Persistent Audit Trail */}
          <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4 space-y-3">
            <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Operational Audit Stream</h2>
            <div
              tabIndex={0}
              aria-label="Operational audit stream"
              className="space-y-2 max-h-48 overflow-y-auto pr-2 focus:outline-none focus:ring-1 focus:ring-emerald-500 rounded"
            >
              {auditLogs.map((log) => (
                <div key={log.id} className="text-xs bg-slate-900/70 p-2.5 rounded border border-slate-800 flex justify-between items-center">
                  <div>
                    <span className="font-mono text-emerald-400 font-semibold mr-2">[{log.action}]</span>
                    <span className="text-slate-300">{log.summary}</span>
                  </div>
                  <span className="text-slate-400 font-mono">{new Date(log.created_at).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
