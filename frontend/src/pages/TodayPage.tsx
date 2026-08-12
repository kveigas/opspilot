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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      let cockpitData = await api.getTodayCockpit();
      if (cockpitData.campaign_count === 0) {
        console.log('[OpsPilot] Empty demo database detected. Auto-bootstrapping scenario...');
        setIsBootstrapping(true);
        await api.bootstrapDemo(true);
        cockpitData = await api.getTodayCockpit();
        setIsBootstrapping(false);
      }
      setCockpit(cockpitData);

      const logs = await api.getAuditLogs();
      setAuditLogs(logs.slice(0, 10));
    } catch (err: any) {
      if (err.status === 404 || err.message?.includes('Not Found') || err.type === 'NETWORK_UNAVAILABLE') {
        console.log('[OpsPilot] Demo database uninitialized or offline. Auto-bootstrapping scenario...');
        setIsBootstrapping(true);
        try {
          await api.bootstrapDemo(true);
          const cockpitData = await api.getTodayCockpit();
          setCockpit(cockpitData);
          const logs = await api.getAuditLogs();
          setAuditLogs(logs.slice(0, 10));
          return;
        } catch (bootstrapErr: any) {
          console.error('Failed to auto-bootstrap demo:', bootstrapErr);
          setErrorMsg('Unable to connect to the OpsPilot demo right now. Please retry.');
        } finally {
          setIsBootstrapping(false);
        }
      } else {
        console.error('Failed to load Today cockpit data', err);
        setErrorMsg('Unable to load the manager cockpit right now. Please retry.');
      }
    } finally {
      setIsBootstrapping(false);
      setIsLoading(false);
    }
  };

  const handleBootstrapDemo = async () => {
    setIsBootstrapping(true);
    setErrorMsg(null);
    try {
      await api.bootstrapDemo(true);
      await loadData();
      setActionFeedback({ kind: 'success', message: 'Public demo scenario loaded.' });
    } catch (err: any) {
      console.error('Failed to bootstrap demo scenario', err);
      setErrorMsg('Unable to connect to the OpsPilot demo right now. Please retry.');
    } finally {
      setIsBootstrapping(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAdvanceWorkday = async () => {
    setActionFeedback(null);
    try {
      await api.advanceDemoWorkday();
      await loadData();
      setActionFeedback({ kind: 'success', message: 'Workday advanced and cockpit signals refreshed.' });
    } catch (err: any) {
      console.error('Failed to advance demo workday from Today:', err);
      setActionFeedback({ kind: 'error', message: 'Unable to advance the demo right now. Please retry.' });
    }
  };

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
              className="w-full sm:w-auto px-5 py-2.5 text-sm font-bold rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-950/60 transition border border-emerald-600 disabled:opacity-50"
            >
              {isBootstrapping ? 'Starting OpsPilot Demo...' : '🚀 Load Public Demo Scenario'}
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
          <button onClick={handleAdvanceWorkday} className="p-2 rounded bg-slate-950/60 border border-slate-800 hover:border-slate-700 text-slate-300">
            <span className="block font-bold text-emerald-400">5. Advance Workday</span>
            <span className="text-[10px] text-slate-400">Execute Workflow</span>
          </button>
          <button onClick={() => onNavigate && onNavigate('delivery')} className="p-2 rounded bg-slate-950/60 border border-slate-800 hover:border-slate-700 text-slate-300">
            <span className="block font-bold text-emerald-300">6. Delivery Gate</span>
            <span className="text-[10px] text-slate-400">Verify Readiness</span>
          </button>
        </div>
      </div>

      {/* Recruiter-Safe Inline Error Experience */}
      {errorMsg && (
        <div className="bg-rose-950/40 border border-rose-800 rounded-xl p-5 text-rose-200 space-y-3 shadow-lg">
          <div className="flex items-center space-x-2">
            <span className="text-lg">⚠️</span>
            <h3 className="font-bold text-rose-300 text-sm">Unable to start the OpsPilot demo</h3>
          </div>
          <p className="text-xs text-rose-300/90 leading-relaxed">
            The demo API backend may still be waking up. Render free-tier services can take several seconds to restart after being idle.
          </p>
          <div className="pt-1">
            <button
              onClick={handleBootstrapDemo}
              disabled={isBootstrapping}
              className="px-4 py-2 text-xs font-bold rounded-lg bg-rose-800 hover:bg-rose-700 text-white transition shadow border border-rose-700 disabled:opacity-50"
            >
              {isBootstrapping ? 'Retrying Demo Connection...' : '🔄 Retry Demo Connection'}
            </button>
          </div>
        </div>
      )}

      {actionFeedback && (
        <div
          role="status"
          aria-live="polite"
          className={`rounded-lg border px-4 py-3 text-sm ${
            actionFeedback.kind === 'success'
              ? 'bg-emerald-950/40 border-emerald-800 text-emerald-200'
              : 'bg-rose-950/40 border-rose-800 text-rose-200'
          }`}
        >
          {actionFeedback.message}
        </div>
      )}

      {isLoading ? (
        <div className="p-8 text-center text-slate-300 text-sm animate-pulse bg-slate-900/60 border border-slate-800 rounded-xl">
          Starting OpsPilot demo environment... (initial cold start may take ~20 seconds)
        </div>
      ) : cockpit && (
        <div className="space-y-6">
          {/* Action Group 1: SLA Alerts (CRITICAL & AT_RISK Campaigns) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Critical Campaigns */}
            <div className="bg-rose-950/30 border border-rose-900/80 rounded-lg p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-rose-400 uppercase tracking-wider">
                  CRITICAL Campaigns ({(cockpit.critical_campaigns || []).length})
                </h2>
                {onNavigate && (
                  <button onClick={() => onNavigate('campaigns')} className="text-xs text-rose-300 underline font-semibold">
                    View Campaigns →
                  </button>
                )}
              </div>
              {(cockpit.critical_campaigns || []).length === 0 ? (
                <p className="text-xs text-slate-400">Zero campaigns currently in CRITICAL SLA status.</p>
              ) : (
                <div className="space-y-2">
                  {(cockpit.critical_campaigns || []).map((c: any) => (
                    <div key={c.campaign_id} className="bg-slate-900/80 border border-rose-900/50 rounded p-3 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-200">{c.name}</span>
                        <StatusBadge status={c.sla_status} type="sla" />
                      </div>
                      <p className="text-slate-400 text-[11px] font-mono">ID: {c.campaign_id}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-300">
                        <span>Delivery: <strong>{c.delivery_status}</strong></span>
                        <span>Capacity: <strong>{c.available_capacity}</strong> ({c.capacity_ratio}×)</span>
                        <span>Blocked: <strong>{c.blocked_count}</strong></span>
                        <span>Unallocated: <strong>{c.unallocated_count}</strong></span>
                        <span>Review backlog: <strong>{c.review_backlog_count}</strong></span>
                        <span>Rework: <strong>{c.rework_count}</strong></span>
                      </div>
                      {(c.reason_codes || []).length > 0 && (
                        <p className="text-rose-300 font-semibold break-words">Reasons: {c.reason_codes.join(', ')}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* At Risk Campaigns */}
            <div className="bg-amber-950/30 border border-amber-900/80 rounded-lg p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-amber-400 uppercase tracking-wider">
                  AT_RISK Campaigns ({(cockpit.at_risk_campaigns || []).length})
                </h2>
                {onNavigate && (
                  <button onClick={() => onNavigate('campaigns')} className="text-xs text-amber-300 underline font-semibold">
                    View Campaigns →
                  </button>
                )}
              </div>
              {(cockpit.at_risk_campaigns || []).length === 0 ? (
                <p className="text-xs text-slate-400">Zero campaigns currently in AT_RISK SLA status.</p>
              ) : (
                <div className="space-y-2">
                  {(cockpit.at_risk_campaigns || []).map((c: any) => (
                    <div key={c.campaign_id} className="bg-slate-900/80 border border-amber-900/50 rounded p-3 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-200">{c.name}</span>
                        <StatusBadge status={c.sla_status} type="sla" />
                      </div>
                      <p className="text-slate-400 text-[11px] font-mono">ID: {c.campaign_id}</p>
                      <p className="text-slate-300 text-[11px]">
                        Delivery: <strong>{c.delivery_status}</strong> · Capacity: <strong>{c.available_capacity}</strong> ({c.capacity_ratio}×)
                      </p>
                      {(c.reason_codes || []).length > 0 && (
                        <p className="text-amber-300 font-semibold break-words">Reasons: {c.reason_codes.join(', ')}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Action Group 2: Operational Queues */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Open Escalations */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Open Escalations</h3>
                <span className="px-2 py-0.5 text-xs font-bold rounded bg-rose-950 text-rose-300 border border-rose-900">
                  {(cockpit.open_escalations || []).length}
                </span>
              </div>
              {(cockpit.open_escalations || []).length === 0 ? (
                <p className="text-xs text-slate-400">Zero open escalations requiring intervention.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {(cockpit.open_escalations || []).map((e: any) => (
                    <div key={e.id} className="bg-slate-950 border border-slate-800 rounded p-2 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-rose-300">{e.severity}</span>
                        <StatusBadge status={e.status} type="sla" />
                      </div>
                      <p className="text-slate-300 truncate">{e.trigger_reason}</p>
                      {onNavigate && (
                        <button onClick={() => onNavigate('qa')} className="text-[11px] text-emerald-400 hover:underline block pt-1">
                          Resolve Escalation →
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Unallocated Backlog */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Unallocated Backlog</h3>
                <span className="px-2 py-0.5 text-xs font-bold rounded bg-amber-950 text-amber-300 border border-amber-900">
                  {(cockpit.unallocated_backlog_summary || []).length} Campaigns
                </span>
              </div>
              {(cockpit.unallocated_backlog_summary || []).length === 0 ? (
                <p className="text-xs text-slate-400">Zero unallocated task backlogs.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {(cockpit.unallocated_backlog_summary || []).map((b: any) => (
                    <div key={b.campaign_id} className="bg-slate-950 border border-slate-800 rounded p-2 text-xs flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-slate-200 block truncate">{b.campaign_name}</span>
                        <span className="text-[11px] text-amber-400">{b.unallocated_count} Unallocated Tasks</span>
                      </div>
                      {onNavigate && (
                        <button onClick={() => onNavigate('allocations')} className="text-[11px] text-cyan-400 hover:underline">
                          Allocate →
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* QA Backlog */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">QA Review Backlog</h3>
                <span className="px-2 py-0.5 text-xs font-bold rounded bg-blue-950 text-blue-300 border border-blue-900">
                  {(cockpit.qa_review_backlog_summary || []).length} Campaigns
                </span>
              </div>
              {(cockpit.qa_review_backlog_summary || []).length === 0 ? (
                <p className="text-xs text-slate-400">Zero QA review backlogs.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {(cockpit.qa_review_backlog_summary || []).map((q: any) => (
                    <div key={q.campaign_id} className="bg-slate-950 border border-slate-800 rounded p-2 text-xs flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-slate-200 block truncate">{q.campaign_name}</span>
                        <span className="text-[11px] text-blue-400">{q.review_backlog_count} Awaiting QA</span>
                      </div>
                      {onNavigate && (
                        <button onClick={() => onNavigate('qa')} className="text-[11px] text-emerald-400 hover:underline">
                          Review →
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recent Operational Audit Activity */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-5 space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Recent Operational Audit Events</h3>
            {auditLogs.length === 0 ? (
              <p className="text-xs text-slate-400">Zero recent audit events.</p>
            ) : (
              <div className="space-y-2">
                {auditLogs.map((log) => (
                  <div key={log.id} className="bg-slate-950 border border-slate-800/80 rounded p-2.5 text-xs flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4 min-w-0">
                    <div className="space-y-0.5">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-bold text-emerald-400 text-[11px]">{log.action}</span>
                        <span className="text-slate-500">|</span>
                        <span className="text-slate-300 font-mono text-[11px]">{log.entity_type} ({log.entity_id})</span>
                      </div>
                      <p className="text-slate-400 text-[11px]">{log.summary}</p>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono sm:shrink-0 self-end sm:self-auto">
                      {new Date(log.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
