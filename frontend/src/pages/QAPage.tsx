import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { StatusBadge } from '../components/StatusBadge';
import { Modal } from '../components/Modal';

export const QAPage: React.FC = () => {
  const [subTab, setSubTab] = useState<'review' | 'decisions' | 'rework' | 'escalations'>('review');
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [reviewers, setReviewers] = useState<any[]>([]);
  const [selectedReviewerId, setSelectedReviewerId] = useState<string>('');

  const [reviewTasks, setReviewTasks] = useState<any[]>([]);
  const [reviewsList, setReviewsList] = useState<any[]>([]);
  const [reworkTasks, setReworkTasks] = useState<any[]>([]);
  const [escalations, setEscalations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Review Verdict Modal State
  const [isVerdictModalOpen, setIsVerdictModalOpen] = useState<boolean>(false);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [verdictInput, setVerdictInput] = useState<string>('ACCEPT');
  const [reasonInput, setReasonInput] = useState<string>('LABEL_ERROR');
  const [commentInput, setCommentInput] = useState<string>('');

  // Escalation Creation Modal State
  const [isEscModalOpen, setIsEscModalOpen] = useState<boolean>(false);
  const [escTitle, setEscTitle] = useState<string>('');
  const [escDescription, setEscDescription] = useState<string>('');
  const [escSeverity, setEscSeverity] = useState<string>('MEDIUM');
  const [escCategory, setEscCategory] = useState<string>('QUALITY');
  const [escBlocker, setEscBlocker] = useState<boolean>(false);

  // Escalation Resolution Modal State
  const [isResolveModalOpen, setIsResolveModalOpen] = useState<boolean>(false);
  const [selectedEscalation, setSelectedEscalation] = useState<any>(null);
  const [targetStatus, setTargetStatus] = useState<string>('RESOLVED');
  const [resolutionInput, setResolutionInput] = useState<string>('');
  const [targetTaskState, setTargetTaskState] = useState<string>('IN_PROGRESS');

  const loadData = async () => {
    setIsLoading(true);
    try {
      const campData = await api.getCampaigns();
      setCampaigns(campData);
      if (campData.length > 0 && !selectedCampaignId) {
        setSelectedCampaignId(campData[0].id);
      }

      const workerData = await api.getWorkers();
      const revs = workerData.filter((w) => w.role === 'REVIEWER');
      setReviewers(revs);
      if (revs.length > 0 && !selectedReviewerId) {
        setSelectedReviewerId(revs[0].id);
      }

      if (selectedCampaignId) {
        const inReview = await api.getTasks(selectedCampaignId, 'IN_REVIEW', 100);
        setReviewTasks(inReview);

        const revHistory = await api.getReviews(selectedCampaignId);
        setReviewsList(revHistory);

        const [inProgressTasks, assignedTasks] = await Promise.all([
          api.getTasks(selectedCampaignId, 'IN_PROGRESS', 1000),
          api.getTasks(selectedCampaignId, 'ASSIGNED', 1000),
        ]);
        const reworks = [...inProgressTasks, ...assignedTasks].filter((t: any) => t.rework_count > 0);
        setReworkTasks(reworks);

        const escList = await api.getEscalations(selectedCampaignId);
        setEscalations(escList);
      }
    } catch (err) {
      console.error('Failed to load QA page data', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedCampaignId]);

  const handleSampleSubmitted = async () => {
    if (!selectedCampaignId) return;
    try {
      await api.sampleSubmittedTasks(selectedCampaignId);
      await loadData();
    } catch (err: any) {
      console.error('QA Sampling failed:', err);
    }
  };

  const openVerdictModal = (task: any, defaultVerdict: string = 'ACCEPT') => {
    setSelectedTask(task);
    setVerdictInput(defaultVerdict);
    setReasonInput('LABEL_ERROR');
    setCommentInput('');
    setIsVerdictModalOpen(true);
  };

  const handleVerdictSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask || !selectedReviewerId) {
      return;
    }

    try {
      await api.submitReview(selectedTask.id, {
        reviewer_id: selectedReviewerId,
        verdict: verdictInput,
        reason_code: verdictInput !== 'ACCEPT' ? reasonInput : undefined,
        comment: commentInput,
      });
      setIsVerdictModalOpen(false);
      loadData();
    } catch (err: any) {
      console.error('Failed to submit review:', err);
    }
  };

  const handleCreateEscalation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCampaignId) return;
    try {
      setIsEscModalOpen(false);
      setEscTitle('');
      setEscDescription('');
      loadData();
    } catch (err: any) {
      console.error('Failed to create escalation:', err);
    }
  };

  const handleResolveEscalation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEscalation) return;
    try {
      await api.updateEscalationStatus(selectedEscalation.id, {
        status: targetStatus,
        resolution_notes: resolutionInput,
      });
      setIsResolveModalOpen(false);
      loadData();
    } catch (err: any) {
      console.error('Failed to update escalation status:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">QA & Escalations Operations</h1>
          <p className="text-sm text-slate-400">
            Deterministic QA review sampling, immutable review decisions, rework attempt enforcement, and escalation lifecycle control.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleSampleSubmitted}
            disabled={!selectedCampaignId}
            className="px-3 py-2 text-xs font-semibold rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          >
            🎲 Sample Submitted Tasks
          </button>
          <button
            onClick={() => setIsEscModalOpen(true)}
            className="px-4 py-2 text-xs font-bold rounded-md bg-rose-700 hover:bg-rose-600 text-white shadow-sm transition"
          >
            + Create Escalation
          </button>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="bg-slate-800/80 border border-slate-700 rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="campaign-select" className="block text-xs font-medium text-slate-400 mb-1">Target Campaign</label>
          <select
            id="campaign-select"
            value={selectedCampaignId}
            onChange={(e) => setSelectedCampaignId(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} (Sampling: {c.review_sampling_pct}%)
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="reviewer-select" className="block text-xs font-medium text-slate-400 mb-1">Active Reviewer Persona</label>
          <select
            id="reviewer-select"
            value={selectedReviewerId}
            onChange={(e) => setSelectedReviewerId(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            {reviewers.length === 0 ? (
              <option value="">No Reviewers Registered</option>
            ) : (
              reviewers.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.email})
                </option>
              ))
            )}
          </select>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex border-b border-slate-800 space-x-4">
        <button
          onClick={() => setSubTab('review')}
          className={`pb-2 text-xs font-bold uppercase tracking-wider transition ${
            subTab === 'review' ? 'text-emerald-400 border-b-2 border-emerald-500' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Review Queue ({reviewTasks.length})
        </button>
        <button
          onClick={() => setSubTab('decisions')}
          className={`pb-2 text-xs font-bold uppercase tracking-wider transition ${
            subTab === 'decisions' ? 'text-emerald-400 border-b-2 border-emerald-500' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Recent QA Decisions ({reviewsList.length})
        </button>
        <button
          onClick={() => setSubTab('rework')}
          className={`pb-2 text-xs font-bold uppercase tracking-wider transition ${
            subTab === 'rework' ? 'text-emerald-400 border-b-2 border-emerald-500' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Rework Queue ({reworkTasks.length})
        </button>
        <button
          onClick={() => setSubTab('escalations')}
          className={`pb-2 text-xs font-bold uppercase tracking-wider transition ${
            subTab === 'escalations' ? 'text-emerald-400 border-b-2 border-emerald-500' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Escalations ({escalations.length})
        </button>
      </div>

      {/* View 1: Review Queue */}
      {subTab === 'review' && (
        <div className="bg-slate-800/60 border border-slate-700 rounded-lg overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-slate-400 text-sm">Loading review queue...</div>
          ) : reviewTasks.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">
              No tasks currently awaiting review. Click "Sample Submitted Tasks" to sample submitted work.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-900/80 text-xs text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Ref</th>
                    <th className="px-4 py-3 font-semibold">Type</th>
                    <th className="px-4 py-3 font-semibold">Annotator</th>
                    <th className="px-4 py-3 font-semibold">Submitted At</th>
                    <th className="px-4 py-3 font-semibold text-right">Review Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/60">
                  {reviewTasks.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-700/40">
                      <td className="px-4 py-3 font-mono text-xs text-slate-200">{t.external_reference || t.id.substring(0, 8)}</td>
                      <td className="px-4 py-3 text-xs">{t.task_type}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-400">{t.assigned_worker_id ? t.assigned_worker_id.substring(0, 8) + '...' : '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-400">{t.submitted_at ? new Date(t.submitted_at).toLocaleString() : '—'}</td>
                      <td className="px-4 py-3 text-right space-x-1.5">
                        <button
                          onClick={() => openVerdictModal(t, 'ACCEPT')}
                          className="px-2.5 py-1 text-xs rounded font-semibold bg-emerald-950 text-emerald-300 hover:bg-emerald-900 border border-emerald-800"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => openVerdictModal(t, 'REWORK')}
                          className="px-2.5 py-1 text-xs rounded font-semibold bg-amber-950 text-amber-300 hover:bg-amber-900 border border-amber-800"
                        >
                          Rework
                        </button>
                        <button
                          onClick={() => openVerdictModal(t, 'BLOCK')}
                          className="px-2.5 py-1 text-xs rounded font-semibold bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-700"
                        >
                          Block
                        </button>
                        <button
                          onClick={() => openVerdictModal(t, 'ESCALATE')}
                          className="px-2.5 py-1 text-xs rounded font-semibold bg-rose-950 text-rose-300 hover:bg-rose-900 border border-rose-800"
                        >
                          Escalate
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* View 2: Recent QA Decisions */}
      {subTab === 'decisions' && (
        <div className="bg-slate-800/60 border border-slate-700 rounded-lg overflow-hidden">
          <div className="p-4 border-b border-slate-700 font-semibold text-xs text-slate-300 uppercase tracking-wider">
            Immutable QA Decision History
          </div>
          {reviewsList.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">No review decisions recorded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-900/80 text-xs text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Review ID</th>
                    <th className="px-4 py-3 font-semibold">Task ID</th>
                    <th className="px-4 py-3 font-semibold">Verdict</th>
                    <th className="px-4 py-3 font-semibold">Reason Code</th>
                    <th className="px-4 py-3 font-semibold">Comment</th>
                    <th className="px-4 py-3 font-semibold">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/60">
                  {reviewsList.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-700/40">
                      <td className="px-4 py-3 font-mono text-xs text-slate-400">{r.id.substring(0, 8)}...</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-200">{r.task_id.substring(0, 8)}...</td>
                      <td className="px-4 py-3 font-bold text-xs">
                        <span className={`px-2 py-0.5 rounded border ${
                          r.verdict === 'ACCEPT' ? 'bg-emerald-950 text-emerald-300 border-emerald-800' :
                          r.verdict === 'REWORK' ? 'bg-amber-950 text-amber-300 border-amber-800' :
                          'bg-rose-950 text-rose-300 border-rose-800'
                        }`}>
                          {r.verdict}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-300 font-mono">{r.reason_code || '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-400">{r.comment || '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-400">{new Date(r.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* View 3: Rework Queue */}
      {subTab === 'rework' && (
        <div className="bg-slate-800/60 border border-slate-700 rounded-lg overflow-hidden">
          <div className="p-4 border-b border-slate-700 font-semibold text-xs text-slate-300 uppercase tracking-wider">
            Active Tasks Requiring Rework
          </div>
          {reworkTasks.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">No active tasks in rework state.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-900/80 text-xs text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Ref</th>
                    <th className="px-4 py-3 font-semibold">State</th>
                    <th className="px-4 py-3 font-semibold">Rework Attempts</th>
                    <th className="px-4 py-3 font-semibold">Assigned Worker</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/60">
                  {reworkTasks.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-700/40">
                      <td className="px-4 py-3 font-mono text-xs text-slate-200">{t.external_reference || t.id.substring(0, 8)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={t.state} />
                      </td>
                      <td className="px-4 py-3 font-bold text-amber-400 text-xs">
                        Attempt {t.rework_count} / 3
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-400">{t.assigned_worker_id ? t.assigned_worker_id.substring(0, 8) + '...' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* View 4: Escalations */}
      {subTab === 'escalations' && (
        <div className="bg-slate-800/60 border border-slate-700 rounded-lg overflow-hidden">
          <div className="p-4 border-b border-slate-700 flex items-center justify-between">
            <span className="font-semibold text-xs text-slate-300 uppercase tracking-wider">Operational Escalations</span>
            <span className="text-xs text-slate-400">{escalations.length} Escalation Records</span>
          </div>
          {escalations.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">No escalations reported for this campaign.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-900/80 text-xs text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Title</th>
                    <th className="px-4 py-3 font-semibold">Severity</th>
                    <th className="px-4 py-3 font-semibold">Category</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Blocker</th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/60">
                  {escalations.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-700/40">
                      <td className="px-4 py-3 font-semibold text-slate-100 text-xs">{e.title}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                          e.severity === 'CRITICAL' ? 'bg-rose-950 text-rose-300 border border-rose-800' :
                          e.severity === 'HIGH' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                          'bg-slate-800 text-slate-300'
                        }`}>
                          {e.severity}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-300 font-mono">{e.category}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={e.status} />
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-rose-400">{e.blocker ? 'YES' : 'NO'}</td>
                      <td className="px-4 py-3 text-right">
                        {e.status !== 'CLOSED' && (
                          <button
                            onClick={() => {
                              setSelectedEscalation(e);
                              setIsResolveModalOpen(true);
                            }}
                            className="px-2 py-1 text-xs font-semibold rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                          >
                            Update Status
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal: QA Verdict Submission */}
      <Modal
        isOpen={isVerdictModalOpen}
        onClose={() => setIsVerdictModalOpen(false)}
        title={`QA Review Verdict: ${selectedTask?.external_reference || selectedTask?.id}`}
      >
        <form onSubmit={handleVerdictSubmit} className="space-y-4">
          <div>
            <label htmlFor="verdict-select" className="block text-xs font-medium text-slate-400 mb-1">Verdict</label>
            <select
              id="verdict-select"
              value={verdictInput}
              onChange={(e) => setVerdictInput(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-slate-200 focus:outline-none"
            >
              <option value="ACCEPT">ACCEPT (Approve Task)</option>
              <option value="REWORK">REWORK (Request Rework)</option>
              <option value="BLOCK">BLOCK (Mark Blocked)</option>
              <option value="ESCALATE">ESCALATE (Escalate Task)</option>
            </select>
          </div>

          {verdictInput !== 'ACCEPT' && (
            <div>
              <label htmlFor="reason-code-select" className="block text-xs font-medium text-slate-400 mb-1">Reason Code (Required)</label>
              <select
                id="reason-code-select"
                value={reasonInput}
                onChange={(e) => setReasonInput(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-slate-200 focus:outline-none"
              >
                <option value="LABEL_ERROR">LABEL_ERROR</option>
                <option value="GUIDELINE_AMBIGUITY">GUIDELINE_AMBIGUITY</option>
                <option value="INCOMPLETE_WORK">INCOMPLETE_WORK</option>
                <option value="FORMAT_ERROR">FORMAT_ERROR</option>
                <option value="TOOLING_ISSUE">TOOLING_ISSUE</option>
                <option value="POLICY_QUESTION">POLICY_QUESTION</option>
                <option value="OTHER">OTHER</option>
              </select>
            </div>
          )}

          <div>
            <label htmlFor="comment-text" className="block text-xs font-medium text-slate-400 mb-1">Review Comment</label>
            <textarea
              id="comment-text"
              rows={3}
              value={commentInput}
              onChange={(e) => setCommentInput(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-slate-200 focus:outline-none"
              placeholder="Operational details for annotator or lead..."
            />
          </div>

          <div className="flex justify-end space-x-3 pt-2">
            <button
              type="button"
              onClick={() => setIsVerdictModalOpen(false)}
              className="px-3 py-1.5 text-xs rounded bg-slate-800 text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 text-xs font-semibold rounded bg-emerald-700 text-white hover:bg-emerald-600"
            >
              Submit Verdict
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Create Escalation */}
      <Modal
        isOpen={isEscModalOpen}
        onClose={() => setIsEscModalOpen(false)}
        title="Report Operational Escalation"
      >
        <form onSubmit={handleCreateEscalation} className="space-y-4">
          <div>
            <label htmlFor="esc-title" className="block text-xs font-medium text-slate-400 mb-1">Escalation Title</label>
            <input
              id="esc-title"
              type="text"
              value={escTitle}
              onChange={(e) => setEscTitle(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-slate-200 focus:outline-none"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="esc-severity" className="block text-xs font-medium text-slate-400 mb-1">Severity</label>
              <select
                id="esc-severity"
                value={escSeverity}
                onChange={(e) => setEscSeverity(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-slate-200 focus:outline-none"
              >
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
                <option value="CRITICAL">CRITICAL</option>
              </select>
            </div>

            <div>
              <label htmlFor="esc-category" className="block text-xs font-medium text-slate-400 mb-1">Category</label>
              <select
                id="esc-category"
                value={escCategory}
                onChange={(e) => setEscCategory(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-slate-200 focus:outline-none"
              >
                <option value="GUIDELINE">GUIDELINE</option>
                <option value="QUALITY">QUALITY</option>
                <option value="CAPACITY">CAPACITY</option>
                <option value="TOOLING">TOOLING</option>
                <option value="CLIENT_CLARIFICATION">CLIENT_CLARIFICATION</option>
                <option value="DATA_ISSUE">DATA_ISSUE</option>
                <option value="SLA">SLA</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="esc-desc" className="block text-xs font-medium text-slate-400 mb-1">Description</label>
            <textarea
              id="esc-desc"
              rows={3}
              value={escDescription}
              onChange={(e) => setEscDescription(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-slate-200 focus:outline-none"
              required
            />
          </div>

          <div className="flex items-center space-x-2">
            <input
              id="esc-blocker"
              type="checkbox"
              checked={escBlocker}
              onChange={(e) => setEscBlocker(e.target.checked)}
              className="rounded bg-slate-900 border-slate-700 text-emerald-600"
            />
            <label htmlFor="esc-blocker" className="text-xs text-slate-300 font-semibold">Mark as Operational Blocker</label>
          </div>

          <div className="flex justify-end space-x-3 pt-2">
            <button type="button" onClick={() => setIsEscModalOpen(false)} className="px-3 py-1.5 text-xs bg-slate-800 text-slate-300 rounded">
              Cancel
            </button>
            <button type="submit" className="px-4 py-1.5 text-xs font-bold bg-rose-700 hover:bg-rose-600 text-white rounded">
              Create Escalation
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Update Escalation Status */}
      <Modal
        isOpen={isResolveModalOpen}
        onClose={() => setIsResolveModalOpen(false)}
        title={`Update Escalation: ${selectedEscalation?.title}`}
      >
        <form onSubmit={handleResolveEscalation} className="space-y-4">
          <div>
            <label htmlFor="target-status" className="block text-xs font-medium text-slate-400 mb-1">Status Transition</label>
            <select
              id="target-status"
              value={targetStatus}
              onChange={(e) => setTargetStatus(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-slate-200 focus:outline-none"
            >
              <option value="INVESTIGATING">INVESTIGATING</option>
              <option value="WAITING">WAITING</option>
              <option value="RESOLVED">RESOLVED</option>
              <option value="CLOSED">CLOSED</option>
            </select>
          </div>

          <div>
            <label htmlFor="esc-resolution" className="block text-xs font-medium text-slate-400 mb-1">Resolution Details</label>
            <textarea
              id="esc-resolution"
              rows={3}
              value={resolutionInput}
              onChange={(e) => setResolutionInput(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-slate-200 focus:outline-none"
              placeholder="Explain how escalation was resolved..."
            />
          </div>

          {selectedEscalation?.task_id && (
            <div>
              <label htmlFor="target-task-state" className="block text-xs font-medium text-slate-400 mb-1">Post-Resolution Task State</label>
              <select
                id="target-task-state"
                value={targetTaskState}
                onChange={(e) => setTargetTaskState(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-1.5 text-sm text-slate-200 focus:outline-none"
              >
                <option value="IN_PROGRESS">IN_PROGRESS (Return to Annotator)</option>
                <option value="SUBMITTED">SUBMITTED (Return to QA Review)</option>
              </select>
            </div>
          )}

          <div className="flex justify-end space-x-3 pt-2">
            <button type="button" onClick={() => setIsResolveModalOpen(false)} className="px-3 py-1.5 text-xs bg-slate-800 text-slate-300 rounded">
              Cancel
            </button>
            <button type="submit" className="px-4 py-1.5 text-xs font-semibold bg-emerald-700 hover:bg-emerald-600 text-white rounded">
              Save Update
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
