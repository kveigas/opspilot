/// <reference types="vite/client" />
import { runDemoAction } from './demoActions';

const BASE_URL = import.meta.env.VITE_API_BASE_URL
  ? `${import.meta.env.VITE_API_BASE_URL.replace(/\/+$/, '')}/api/v1`
  : '/api/v1';

export type ErrorType = 'NETWORK_UNAVAILABLE' | 'API_TIMEOUT' | 'API_ERROR' | 'CORS_OR_CONFIGURATION';

export class ApiError extends Error {
  type: ErrorType;
  status?: number;

  constructor(message: string, type: ErrorType, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.type = type;
    this.status = status;
  }
}

type RequestOptions = RequestInit & { timeoutMs?: number; retries?: number; idempotencyKey?: string };

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function describeError(detail: unknown, status: number): string {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    // FastAPI validation errors: [{loc, msg}, ...]
    return detail.map((d: any) => `${(d.loc ?? []).slice(1).join('.') || 'request'}: ${d.msg}`).join('; ');
  }
  return `Request failed with status ${status}`;
}

/**
 * Mutating requests carry an Idempotency-Key. Because the server replays the stored result
 * for a repeated key, a mutation whose outcome is unknown (timeout, dropped connection,
 * 5xx, or "still processing") can be retried safely with the same key.
 */
export async function fetchApi<T>(endpoint: string, options?: RequestOptions): Promise<T> {
  const method = (options?.method ?? 'GET').toUpperCase();
  const mutating = method !== 'GET' && method !== 'HEAD';
  const timeoutMs = options?.timeoutMs ?? (endpoint.includes('bootstrap') ? 45000 : 30000);
  const maxRetries = options?.retries ?? (mutating ? 2 : 3);
  const idempotencyKey = mutating ? options?.idempotencyKey ?? newIdempotencyKey() : undefined;
  const init: RequestInit = { ...(options ?? {}) };
  for (const key of ['timeoutMs', 'retries', 'idempotencyKey']) delete (init as Record<string, unknown>)[key];

  let attempt = 0;
  while (attempt <= maxRetries) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${BASE_URL}${endpoint}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
          ...init.headers,
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ detail: res.statusText }));
        throw new ApiError(describeError(errorData.detail, res.status), 'API_ERROR', res.status);
      }
      return await res.json();
    } catch (err: any) {
      clearTimeout(timeoutId);
      const isAbort = err?.name === 'AbortError';
      const isTypeError = err instanceof TypeError || err?.message?.includes('Failed to fetch');

      let classifiedType: ErrorType = 'API_ERROR';
      let message = err?.message || 'An error occurred during request';
      if (isAbort) {
        classifiedType = 'API_TIMEOUT';
        message = `Request timed out after ${Math.round(timeoutMs / 1000)} seconds.`;
      } else if (isTypeError) {
        classifiedType = 'NETWORK_UNAVAILABLE';
        message = 'Unable to connect to the OpsPilot API backend.';
      } else if (err instanceof ApiError) {
        classifiedType = err.type;
      }

      const status: number | undefined = err?.status;
      const stillProcessing = mutating && status === 409 && /still being processed/i.test(message);
      const isRetryable =
        classifiedType === 'NETWORK_UNAVAILABLE' ||
        classifiedType === 'API_TIMEOUT' ||
        (status !== undefined && status >= 500) ||
        stillProcessing;

      if (attempt < maxRetries && isRetryable) {
        attempt++;
        const backoffMs = attempt * 1500;
        console.warn(`[OpsPilot API] Attempt ${attempt} failed (${message}). Retrying in ${backoffMs / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }
      throw new ApiError(message, classifiedType, status);
    }
  }
  throw new ApiError('Maximum retry attempts exceeded.', 'NETWORK_UNAVAILABLE');
}

const post = <T>(endpoint: string, body?: unknown, extra?: RequestOptions) =>
  fetchApi<T>(endpoint, { method: 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }), ...extra });
const patch = <T>(endpoint: string, body: unknown) => fetchApi<T>(endpoint, { method: 'PATCH', body: JSON.stringify(body) });

// StrictMode and several components can request the non-destructive bootstrap at once;
// share one in-flight request instead of racing (the second used to surface a false error).
let bootstrapInFlight: Promise<any> | null = null;

export const api = {
  // Health
  getHealth: () => fetchApi<{ status: string; service: string; version?: string; phase?: string }>('/health'),

  // Campaigns
  getCampaigns: (status?: string) => fetchApi<any[]>(`/campaigns${status ? `?status=${status}` : ''}`),
  getCampaign: (id: string) => fetchApi<any>(`/campaigns/${id}`),
  createCampaign: (data: any) => post<any>('/campaigns', data),
  updateCampaign: (id: string, data: any) => patch<any>(`/campaigns/${id}`, data),
  getCampaignQuality: (id: string) => fetchApi<any>(`/campaigns/${id}/quality`),
  getCampaignForecast: (id: string) => fetchApi<any>(`/campaigns/${id}/forecast`),

  // Workers
  getWorkers: () => fetchApi<any[]>('/workers'),
  getWorker: (id: string) => fetchApi<any>(`/workers/${id}`),
  createWorker: (data: any) => post<any>('/workers', data),
  updateWorker: (id: string, data: any) => patch<any>(`/workers/${id}`, data),

  // Capacity
  getCapacity: (workerId: string, date: string) => fetchApi<any>(`/workers/${workerId}/capacity?date=${date}`),
  getWorkerCapacity: (workerId: string, date: string) => fetchApi<any>(`/workers/${workerId}/capacity?date=${date}`),
  upsertCapacity: (data: any) => post<any>('/workers/capacity', data),
  upsertWorkerCapacity: (data: any) => post<any>('/workers/capacity', data),

  // Calibration
  getCalibrations: () => fetchApi<any[]>('/calibrations'),
  createCalibration: (data: any) => post<any>('/calibrations', data),
  createCalibrationRound: (data: any) => post<any>('/calibrations', data),
  recordCalibrationResult: (roundId: string, data: any) => post<any>(`/calibrations/${roundId}/results`, data),

  // Qualifications
  checkQualification: (workerId: string, campaignId: string) =>
    fetchApi<any>(`/qualifications/check?worker_id=${workerId}&campaign_id=${campaignId}`),

  // Audit Logs
  getAuditLogs: () => fetchApi<any[]>('/audit-logs'),

  // Tasks & Execution
  createTaskBatch: (campaignId: string, data: { count: number; required_skill_tags?: string[]; priority?: string }) =>
    post<any[]>(`/campaigns/${campaignId}/tasks`, data),
  getTasks: (campaignId: string, state?: string, limit?: number) => {
    const params = new URLSearchParams();
    params.append('campaign_id', campaignId);
    if (state) params.append('state', state);
    if (limit) params.append('limit', limit.toString());
    return fetchApi<any[]>(`/tasks?${params.toString()}`);
  },
  getTask: (taskId: string) => fetchApi<any>(`/tasks/${taskId}`),
  getTaskHistory: (taskId: string) => fetchApi<any>(`/tasks/${taskId}/history`),
  /** Backend contract: PATCH /tasks/{id}/state with {state, reason}. */
  transitionTaskState: (taskId: string, targetState: string, reason?: string) =>
    patch<any>(`/tasks/${taskId}/state`, { state: targetState, reason }),

  // Allocations Engine
  getCampaignAllocations: (campaignId: string) => fetchApi<any[]>(`/allocations?campaign_id=${campaignId}`),
  triggerAllocationRun: (data: {
    campaign_id: string;
    operational_date?: string;
    max_tasks_to_allocate?: number;
    strategy?: 'BALANCED' | 'QUALITY_AWARE';
  }) => post<any>('/allocations/trigger', data),
  releaseAllocation: (allocationId: string, reason = 'MANUAL_RELEASE') =>
    post<any>(`/allocations/${allocationId}/release?reason=${encodeURIComponent(reason)}`),

  // QA & Reviews
  getReviews: (campaignId?: string, taskId?: string) => {
    const params = new URLSearchParams();
    if (campaignId) params.append('campaign_id', campaignId);
    if (taskId) params.append('task_id', taskId);
    return fetchApi<any[]>(`/reviews?${params.toString()}`);
  },
  sampleSubmittedTasks: (campaignId: string) => post<any>(`/campaigns/${campaignId}/reviews/sample`),
  submitReview: (taskId: string, data: { reviewer_id: string; verdict: string; reason_code?: string; comment?: string }) =>
    post<any>('/reviews', { task_id: taskId, ...data }),

  // Escalations
  getEscalations: (campaignId?: string, status?: string) => {
    const params = new URLSearchParams();
    if (campaignId) params.append('campaign_id', campaignId);
    if (status) params.append('status', status);
    return fetchApi<any[]>(`/escalations?${params.toString()}`);
  },
  createEscalation: (data: {
    campaign_id: string;
    title: string;
    description: string;
    severity: string;
    category: string;
    blocker: boolean;
  }) => post<any>('/escalations', data),
  updateEscalationStatus: (escalationId: string, data: { status: string; resolution?: string; target_task_state?: string }) =>
    patch<any>(`/escalations/${escalationId}/status`, data),

  // SLA Engine
  getCampaignSLA: (campaignId: string) => fetchApi<any>(`/campaigns/${campaignId}/sla`),
  getCampaignExecution: (campaignId: string) => fetchApi<any>(`/campaigns/${campaignId}/execution`),

  // Delivery Readiness
  getDeliveryReadiness: (campaignId: string) => fetchApi<any>(`/campaigns/${campaignId}/delivery-readiness`),

  // Today Cockpit
  getTodayCockpit: () => fetchApi<any>('/today'),

  // Demo controls
  bootstrapDemo: (reset: boolean = false) => {
    if (!reset && bootstrapInFlight) return bootstrapInFlight;
    const request = runDemoAction('Loading demo', () => post<any>(`/demo/bootstrap?reset=${reset}`));
    if (reset) return request;
    bootstrapInFlight = request.finally(() => { bootstrapInFlight = null; });
    return bootstrapInFlight;
  },
  advanceDemoWorkday: (campaignId?: string) =>
    runDemoAction('Advancing workday', () => post<any>(
      `/demo/advance-workday${campaignId ? `?campaign_id=${campaignId}` : ''}`, undefined, { timeoutMs: 120000 })),
  resetDemo: () => runDemoAction('Resetting demo', () => post<any>('/demo/reset')),
  getDemoProvenance: () => fetchApi<any>('/demo/provenance'),
};
