import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { StatusBadge } from '../components/StatusBadge';

export const DeliveryPage: React.FC = () => {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [readiness, setReadiness] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const campData = await api.getCampaigns();
      setCampaigns(campData);
      if (campData.length > 0 && !selectedCampaignId) {
        setSelectedCampaignId(campData[0].id);
      }

      if (selectedCampaignId) {
        const data = await api.getDeliveryReadiness(selectedCampaignId);
        setReadiness(data);
      }
    } catch (err) {
      console.error('Failed to load delivery readiness page data', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedCampaignId]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Campaign Delivery Readiness</h1>
          <p className="text-sm text-slate-400">
            Deterministic delivery gate validation: volume completeness, review sampling target, operational quality, escalations, and task blockers.
          </p>
        </div>
        <div className="w-full sm:w-64">
          <label htmlFor="campaign-select" className="sr-only">Select Campaign</label>
          <select
            id="campaign-select"
            value={selectedCampaignId}
            onChange={(e) => setSelectedCampaignId(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.task_type})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Delivery Readiness Banner */}
      {readiness && (
        <div className={`p-6 rounded-lg border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
          readiness.status === 'READY'
            ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
            : readiness.status === 'READY_WITH_WARNINGS'
            ? 'bg-amber-950/40 border-amber-800 text-amber-300'
            : 'bg-rose-950/40 border-rose-800 text-rose-300'
        }`}>
          <div>
            <div className="flex items-center space-x-3">
              <span className="text-xs uppercase tracking-wider font-bold">Overall Delivery Verdict:</span>
              <StatusBadge status={readiness.status} />
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Evaluated at: {new Date(readiness.evaluated_at).toLocaleString()}
            </p>
          </div>

          <button
            onClick={loadData}
            className="px-3 py-1.5 text-xs font-semibold rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
          >
            🔄 Re-Evaluate Gates
          </button>
        </div>
      )}

      {/* 5 Gate Checklist */}
      {isLoading ? (
        <div className="p-8 text-center text-slate-400 text-sm">Evaluating delivery gates...</div>
      ) : readiness && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-200">Mandatory Delivery Gate Checklist</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {readiness.gates.map((g: any) => (
              <div
                key={g.gate}
                className={`p-4 rounded-lg border ${
                  g.passed ? 'bg-slate-800/80 border-slate-700' : 'bg-rose-950/20 border-rose-900/60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-slate-200">{g.gate}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                    g.passed ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-rose-950 text-rose-300 border border-rose-800'
                  }`}>
                    {g.passed ? 'PASSED' : 'FAILED'}
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-2">{g.reason}</p>
                {g.evidence && (
                  <p className="text-xs text-slate-400 font-mono mt-1">Evidence: {g.evidence}</p>
                )}
              </div>
            ))}
          </div>

          {/* Blocking Reasons & Warnings */}
          {readiness.blocking_reasons.length > 0 && (
            <div className="bg-rose-950/30 border border-rose-900/80 rounded-lg p-4 space-y-2">
              <h3 className="text-xs font-bold text-rose-400 uppercase tracking-wider">Blocking Reasons preventing delivery:</h3>
              <ul className="list-disc list-inside text-xs text-rose-300 space-y-1">
                {readiness.blocking_reasons.map((r: string, idx: number) => (
                  <li key={idx}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          {readiness.warnings.length > 0 && (
            <div className="bg-amber-950/30 border border-amber-900/80 rounded-lg p-4 space-y-2">
              <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider">Delivery Warnings:</h3>
              <ul className="list-disc list-inside text-xs text-amber-300 space-y-1">
                {readiness.warnings.map((w: string, idx: number) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
