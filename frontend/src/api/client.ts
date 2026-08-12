/// <reference types="vite/client" />

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

export async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit & { timeoutMs?: number; retries?: number }
): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? (endpoint.includes('bootstrap') ? 45000 : 30000);
  const maxRetries = options?.retries ?? (options?.method && options.method !== 'GET' && !endpoint.includes('bootstrap') ? 0 : 3);

  let attempt = 0;

  while (attempt <= maxRetries) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${BASE_URL}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ detail: res.statusText }));
        const errType: ErrorType = res.status >= 500 ? 'API_ERROR' : 'API_ERROR';
        throw new ApiError(errorData.detail || `Request failed with status ${res.status}`, errType, res.status);
      }

      return await res.json();
    } catch (err: any) {
      clearTimeout(timeoutId);

      const isAbort = err.name === 'AbortError';
      const isTypeError = err instanceof TypeError || err.message?.includes('Failed to fetch');

      let classifiedType: ErrorType = 'API_ERROR';
      let message = err.message || 'An error occurred during request';

      if (isAbort) {
        classifiedType = 'API_TIMEOUT';
        message = `Request timed out after ${Math.round(timeoutMs / 1000)} seconds.`;
      } else if (isTypeError) {
        classifiedType = 'NETWORK_UNAVAILABLE';
        message = 'Unable to connect to the OpsPilot API backend.';
      } else if (err instanceof ApiError) {
        classifiedType = err.type;
      }

      const isRetryable = classifiedType === 'NETWORK_UNAVAILABLE' || classifiedType === 'API_TIMEOUT' || (err.status && err.status >= 500);

      if (attempt < maxRetries && isRetryable) {
        attempt++;
        const backoffMs = attempt * 2000;
        console.warn(`[OpsPilot API] Attempt ${attempt} failed (${message}). Retrying in ${backoffMs / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }

      throw new ApiError(message, classifiedType, err.status);
    }
  }

  throw new ApiError('Maximum retry attempts exceeded.', 'NETWORK_UNAVAILABLE');
}

export const api = {
  // Health
  getHealth: () => fetchApi<{ status: string; service: string; phase: string }>('/health'),

  // Campaigns
  getCampaigns: (status?: string) =>
    fetchApi<any[]>(`/campaigns${status ? `?status=${status}` : ''}`),
  getCampaign: (id: string) => fetchApi<any>(`/campaigns/${id}`),
  createCampaign: (data: any) =>
    fetchApi<any>('/campaigns', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateCampaign: (id: string, data: any) =>
    fetchApi<any>(`/campaigns/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Workers
  getWorkers: () => fetchApi<any[]>('/workers'),
  getWorker: (id: string) => fetchApi<any>(`/workers/${id}`),
  createWorker: (data: any) =>
    fetchApi<any>('/workers', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateWorker: (id: string, data: any) =>
    fetchApi<any>(`/workers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Capacity
  getWorkerCapacity: (workerId: string, date: string) =>
    fetchApi<any>(`/workers/${workerId}/capacity?date=${date}`),
  getCapacity: (workerId: string, date: string) =>
    fetchApi<any>(`/workers/${workerId}/capacity?date=${date}`),
  upsertWorkerCapacity: (data: any) =>
    fetchApi<any>('/workers/capacity', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  upsertCapacity: (data: any) =>
    fetchApi<any>('/workers/capacity', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Calibration
  getCalibrations: () => fetchApi<any[]>('/calibrations'),
  createCalibrationRound: (data: any) =>
    fetchApi<any>('/calibrations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  createCalibration: (data: any) =>
    fetchApi<any>('/calibrations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  recordCalibrationResult: (roundId: string, data: any) =>
    fetchApi<any>(`/calibrations/${roundId}/results`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Qualifications
  checkQualification: (workerId: string, campaignId: string) =>
    fetchApi<any>(`/qualifications/check?worker_id=${workerId}&campaign_id=${campaignId}`),

  // Audit Logs
  getAuditLogs: () => fetchApi<any[]>('/audit-logs'),

  // Tasks & Execution
  createTaskBatch: (campaignId: string, data: { count: number; required_skill_tags?: string[]; priority?: string }) =>
    fetchApi<any[]>(`/campaigns/${campaignId}/tasks`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getTasks: (campaignId: string, state?: string, limit?: number) => {
    const params = new URLSearchParams();
    params.append('campaign_id', campaignId);
    if (state) params.append('state', state);
    if (limit) params.append('limit', limit.toString());
    return fetchApi<any[]>(`/tasks?${params.toString()}`);
  },
  getTask: (taskId: string) => fetchApi<any>(`/tasks/${taskId}`),
  transitionTaskState: (taskId: string, targetState: string, reason?: string) =>
    fetchApi<any>(`/tasks/${taskId}/transition`, {
      method: 'POST',
      body: JSON.stringify({ target_state: targetState, reason }),
    }),

  // Allocations Engine
  getCampaignAllocations: (campaignId: string) =>
    fetchApi<any[]>(`/allocations?campaign_id=${campaignId}`),
  triggerAllocationRun: (data: { campaign_id: string; operational_date: string; max_tasks?: number }) =>
    fetchApi<any>('/allocations/trigger', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // QA & Reviews
  getReviews: (campaignId?: string, taskId?: string) => {
    const params = new URLSearchParams();
    if (campaignId) params.append('campaign_id', campaignId);
    if (taskId) params.append('task_id', taskId);
    return fetchApi<any[]>(`/reviews?${params.toString()}`);
  },
  sampleSubmittedTasks: (campaignId: string) =>
    fetchApi<any>(`/campaigns/${campaignId}/reviews/sample`, {
      method: 'POST',
    }),
  submitReview: (taskId: string, data: { reviewer_id: string; verdict: string; reason_code?: string; comment?: string }) =>
    fetchApi<any>('/reviews', {
      method: 'POST',
      body: JSON.stringify({ task_id: taskId, ...data }),
    }),

  // Escalations
  getEscalations: (campaignId?: string, status?: string) => {
    const params = new URLSearchParams();
    if (campaignId) params.append('campaign_id', campaignId);
    if (status) params.append('status', status);
    return fetchApi<any[]>(`/escalations?${params.toString()}`);
  },
  updateEscalationStatus: (escalationId: string, data: { status: string; resolution_notes?: string }) =>
    fetchApi<any>(`/escalations/${escalationId}/status`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // SLA Engine
  getCampaignSLA: (campaignId: string) => fetchApi<any>(`/campaigns/${campaignId}/sla`),
  getCampaignExecution: (campaignId: string) => fetchApi<any>(`/campaigns/${campaignId}/execution`),

  // Delivery Readiness
  getDeliveryReadiness: (campaignId: string) => fetchApi<any>(`/campaigns/${campaignId}/delivery-readiness`),

  // Today Cockpit
  getTodayCockpit: () => fetchApi<any>('/today'),

  // Flagship Recruiter Demo Bootstrap
  bootstrapDemo: (reset: boolean = true) =>
    fetchApi<any>(`/demo/bootstrap?reset=${reset}`, {
      method: 'POST',
    }),
  advanceDemoWorkday: (campaignId?: string) =>
    fetchApi<any>(`/demo/advance-workday${campaignId ? `?campaign_id=${campaignId}` : ''}`, {
      method: 'POST',
    }),
  resetDemo: () => fetchApi<any>('/demo/reset', { method: 'POST' }),
  getDemoProvenance: () => fetchApi<any>('/demo/provenance'),
};
