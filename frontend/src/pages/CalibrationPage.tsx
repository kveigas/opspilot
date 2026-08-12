import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { CalibrationRound, Campaign, Worker } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { Modal } from '../components/Modal';
import { Plus, Award, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

export const CalibrationPage: React.FC = () => {
  const [rounds, setRounds] = useState<CalibrationRound[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRoundModalOpen, setIsRoundModalOpen] = useState(false);
  const [isResultModalOpen, setIsResultModalOpen] = useState(false);
  const [selectedRound, setSelectedRound] = useState<CalibrationRound | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);

  const [roundForm, setRoundForm] = useState({
    campaign_id: '',
    domain_tag: 'de',
    total_test_tasks: 10,
    pass_threshold_pct: 90.0,
    max_allowed_attempts: 2,
  });

  const [resultForm, setResultForm] = useState({
    worker_id: '',
    score_pct: 92.0,
  });

  const loadAll = async () => {
    try {
      setLoading(true);
      const [r, c, w] = await Promise.all([
        api.getCalibrations(),
        api.getCampaigns(),
        api.getWorkers(),
      ]);
      setRounds(r);
      setCampaigns(c);
      setWorkers(w);
      if (c.length > 0 && !roundForm.campaign_id) {
        setRoundForm((prev) => ({ ...prev, campaign_id: c[0].id }));
      }
      if (w.length > 0 && !resultForm.worker_id) {
        setResultForm((prev) => ({ ...prev, worker_id: w[0].id }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleCreateRound = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    try {
      await api.createCalibration({
        ...roundForm,
        total_test_tasks: Number(roundForm.total_test_tasks),
        pass_threshold_pct: Number(roundForm.pass_threshold_pct),
        max_allowed_attempts: Number(roundForm.max_allowed_attempts),
      });
      setIsRoundModalOpen(false);
      await loadAll();
      setFeedback({ kind: 'success', message: 'Calibration round created and refreshed.' });
    } catch (err: any) {
      console.error('Failed to create calibration round:', err);
      setError('Unable to create the calibration round right now. Please retry.');
      setFeedback({ kind: 'error', message: 'Unable to create the calibration round right now. Please retry.' });
    }
  };

  const openRecordResultModal = (r: CalibrationRound) => {
    setSelectedRound(r);
    setError(null);
    setIsResultModalOpen(true);
  };

  const handleRecordResult = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRound) return;
    setError(null);
    setFeedback(null);

    try {
      await api.recordCalibrationResult(selectedRound.id, {
        worker_id: resultForm.worker_id,
        score_pct: Number(resultForm.score_pct),
      });

      setIsResultModalOpen(false);
      await loadAll();
      setFeedback({ kind: 'success', message: 'Calibration result recorded and qualification state refreshed.' });
    } catch (err: any) {
      console.error('Failed to record calibration result:', err);
      setError('Unable to record the calibration result right now. Please retry.');
      setFeedback({ kind: 'error', message: 'Unable to record the calibration result right now. Please retry.' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-ops-text">Calibration & Qualification Engine</h1>
          <p className="text-sm text-ops-muted mt-1">Domain qualification rounds, attempt tracking, and deterministic pass gates</p>
        </div>
        <button
          onClick={() => {
            setError(null);
            setIsRoundModalOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-ops-primary hover:bg-ops-primary-hover text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" /> Create Calibration Round
        </button>
      </div>

      {feedback && (
        <div
          role="status"
          aria-live="polite"
          className={`rounded-lg border px-4 py-3 text-sm ${
            feedback.kind === 'success'
              ? 'bg-emerald-950/40 border-emerald-800 text-emerald-200'
              : 'bg-rose-950/40 border-rose-800 text-rose-200'
          }`}
        >
          {feedback.message}
        </div>
      )}

      {loading ? (
        <div className="p-8 text-ops-muted">Loading calibration rounds...</div>
      ) : rounds.length === 0 ? (
        <div className="bg-ops-card border border-ops-border rounded-xl p-12 text-center">
          <Award className="w-12 h-12 text-ops-muted mx-auto mb-3" />
          <h3 className="text-lg font-bold text-ops-text">No Calibration Rounds</h3>
          <p className="text-sm text-ops-muted mt-1 max-w-md mx-auto">
            Create a calibration round for a domain to evaluate annotator precision before campaign assignment.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {rounds.map((r) => {
            const campaign = campaigns.find((c) => c.id === r.campaign_id);
            return (
              <div key={r.id} className="bg-ops-card border border-ops-border rounded-xl p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-ops-border pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-ops-text text-base">Domain: {r.domain_tag}</span>
                      <span className="px-2 py-0.5 rounded text-xs bg-slate-900 border border-slate-800 text-slate-300 font-mono">
                        {campaign?.name || r.campaign_id}
                      </span>
                    </div>
                    <div className="text-xs text-ops-muted mt-1">
                      Threshold: <strong className="text-ops-text">{r.pass_threshold_pct}%</strong> • Max Attempts:{' '}
                      <strong className="text-ops-text">{r.max_allowed_attempts}</strong> • Tasks:{' '}
                      <strong className="text-ops-text">{r.total_test_tasks}</strong>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={r.status} />
                    <button
                      onClick={() => openRecordResultModal(r)}
                      className="px-3 py-1.5 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-800/60 text-emerald-400 text-xs rounded font-semibold transition-colors flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Record Result
                    </button>
                  </div>
                </div>

                {/* Results Table */}
                <div>
                  <h4 className="text-xs font-semibold text-ops-muted uppercase tracking-wider mb-2">Recorded Attempts</h4>
                  {r.results.length === 0 ? (
                    <div className="text-xs text-ops-muted py-3 px-4 bg-ops-bg/40 border border-ops-border/60 rounded-lg">
                      No worker attempts recorded for this round yet.
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-ops-border/60 rounded-lg">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-ops-bg/80 text-ops-muted uppercase border-b border-ops-border/60">
                          <tr>
                            <th className="px-4 py-2 font-semibold">Worker</th>
                            <th className="px-4 py-2 font-semibold">Attempt #</th>
                            <th className="px-4 py-2 font-semibold">Score %</th>
                            <th className="px-4 py-2 font-semibold">Verdict</th>
                            <th className="px-4 py-2 font-semibold">Evaluated At</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-ops-border/40">
                          {r.results.map((res) => {
                            const w = workers.find((wk) => wk.id === res.worker_id);
                            return (
                              <tr key={res.id} className="hover:bg-ops-hover/40">
                                <td className="px-4 py-2.5 font-medium text-ops-text">{w?.name || res.worker_id}</td>
                                <td className="px-4 py-2.5 text-ops-muted">#{res.attempt_number} of {r.max_allowed_attempts}</td>
                                <td className="px-4 py-2.5 font-bold text-ops-text">{res.score_pct}%</td>
                                <td className="px-4 py-2.5">
                                  {res.passed ? (
                                    <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                                      <CheckCircle className="w-3.5 h-3.5" /> PASSED
                                    </span>
                                  ) : res.attempt_number < r.max_allowed_attempts ? (
                                    <span className="inline-flex items-center gap-1 text-amber-400 font-semibold">
                                      <AlertTriangle className="w-3.5 h-3.5" /> RETRY REQUIRED
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-red-400 font-semibold">
                                      <XCircle className="w-3.5 h-3.5" /> FAILED
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 text-ops-muted">
                                  {new Date(res.evaluated_at).toLocaleString()}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Round Modal */}
      <Modal isOpen={isRoundModalOpen} onClose={() => setIsRoundModalOpen(false)} title="Create Calibration Round">
        <form onSubmit={handleCreateRound} className="space-y-4">
          {error && <div className="p-3 bg-red-950/80 border border-red-800 text-red-300 rounded-lg text-sm">{error}</div>}

          <div>
            <label className="block text-xs font-semibold text-ops-muted mb-1">Target Campaign</label>
            <select
              required
              value={roundForm.campaign_id}
              onChange={(e) => setRoundForm({ ...roundForm, campaign_id: e.target.value })}
              className="w-full px-3 py-2 bg-ops-bg border border-ops-border rounded-lg text-sm text-ops-text focus:outline-none focus:border-ops-primary"
            >
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.client_name})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-ops-muted mb-1">Domain Tag</label>
              <input
                type="text"
                required
                value={roundForm.domain_tag}
                onChange={(e) => setRoundForm({ ...roundForm, domain_tag: e.target.value })}
                className="w-full px-3 py-2 bg-ops-bg border border-ops-border rounded-lg text-sm text-ops-text focus:outline-none focus:border-ops-primary"
                placeholder="de"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ops-muted mb-1">Total Test Tasks</label>
              <input
                type="number"
                min="1"
                required
                value={roundForm.total_test_tasks}
                onChange={(e) => setRoundForm({ ...roundForm, total_test_tasks: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-ops-bg border border-ops-border rounded-lg text-sm text-ops-text focus:outline-none focus:border-ops-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-ops-muted mb-1">Pass Threshold %</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                required
                value={roundForm.pass_threshold_pct}
                onChange={(e) => setRoundForm({ ...roundForm, pass_threshold_pct: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-ops-bg border border-ops-border rounded-lg text-sm text-ops-text focus:outline-none focus:border-ops-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ops-muted mb-1">Max Allowed Attempts</label>
              <input
                type="number"
                min="1"
                required
                value={roundForm.max_allowed_attempts}
                onChange={(e) => setRoundForm({ ...roundForm, max_allowed_attempts: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-ops-bg border border-ops-border rounded-lg text-sm text-ops-text focus:outline-none focus:border-ops-primary"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-ops-border">
            <button
              type="button"
              onClick={() => setIsRoundModalOpen(false)}
              className="px-4 py-2 border border-ops-border hover:bg-ops-hover text-ops-muted rounded-lg text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-ops-primary hover:bg-ops-primary-hover text-white rounded-lg text-sm font-semibold transition-colors"
            >
              Create Round
            </button>
          </div>
        </form>
      </Modal>

      {/* Record Result Modal */}
      <Modal isOpen={isResultModalOpen} onClose={() => setIsResultModalOpen(false)} title={`Record Calibration Result — Domain: ${selectedRound?.domain_tag}`}>
        <form onSubmit={handleRecordResult} className="space-y-4">
          {error && <div className="p-3 bg-red-950/80 border border-red-800 text-red-300 rounded-lg text-sm">{error}</div>}

          <div>
            <label className="block text-xs font-semibold text-ops-muted mb-1">Select Worker</label>
            <select
              required
              value={resultForm.worker_id}
              onChange={(e) => setResultForm({ ...resultForm, worker_id: e.target.value })}
              className="w-full px-3 py-2 bg-ops-bg border border-ops-border rounded-lg text-sm text-ops-text focus:outline-none focus:border-ops-primary"
            >
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.email})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ops-muted mb-1">Achieved Score %</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              required
              value={resultForm.score_pct}
              onChange={(e) => setResultForm({ ...resultForm, score_pct: Number(e.target.value) })}
              className="w-full px-3 py-2 bg-ops-bg border border-ops-border rounded-lg text-sm text-ops-text focus:outline-none focus:border-ops-primary"
            />
          </div>

          <div className="p-3 bg-ops-bg/60 border border-ops-border rounded-lg text-xs text-ops-muted space-y-1">
            <div>
              Round Threshold: <strong className="text-ops-text">{selectedRound?.pass_threshold_pct}%</strong>
            </div>
            <div>
              Deterministic Status if Submitted:{' '}
              <strong className={resultForm.score_pct >= (selectedRound?.pass_threshold_pct || 90) ? 'text-emerald-400' : 'text-amber-400'}>
                {resultForm.score_pct >= (selectedRound?.pass_threshold_pct || 90) ? 'PASSED' : 'RETRY OR FAIL'}
              </strong>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-ops-border">
            <button
              type="button"
              onClick={() => setIsResultModalOpen(false)}
              className="px-4 py-2 border border-ops-border hover:bg-ops-hover text-ops-muted rounded-lg text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-ops-primary hover:bg-ops-primary-hover text-white rounded-lg text-sm font-semibold transition-colors"
            >
              Submit Result
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
