const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();

// Keep browser traffic same-origin. The Next.js route handler forwards these
// calls to API_INTERNAL_URL, which works from Docker and prevents a dashboard
// opened from another browser/device from accidentally calling its own
// localhost:3000 instead of the API.
export const apiUrl = (configuredApiUrl || '/api/proxy').replace(/\/+$/, '') || '/api/proxy';

export interface DashboardRequest { method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'; body?: unknown; }

export async function dashboardFetch<T>(path: string, token: string, request: DashboardRequest = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiUrl}${path}`, { method: request.method ?? 'GET', headers: { authorization: `Bearer ${token}`, ...(request.body ? { 'content-type': 'application/json' } : {}) }, ...(request.body ? { body: JSON.stringify(request.body) } : {}), cache: 'no-store' });
  } catch {
    throw new Error('Cannot reach NotifyKIT through the dashboard proxy. Check that the dashboard and API services are running.');
  }
  if (response.status === 401) {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('notification-dashboard-token');
      window.localStorage.removeItem('notification-dashboard-user');
      window.location.assign('/');
    }
    throw new Error('Your dashboard session has expired. Sign in again.');
  }
  if (response.status === 204) return undefined as T;
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error(response.ok ? 'The NotifyKIT API returned an invalid response.' : `The NotifyKIT API request failed (${response.status}).`);
  }
  const payload = await response.json() as { success: boolean; data?: T; error?: { message?: string; details?: { validation_errors?: string[] } } };
  const validationError = payload.error?.details?.validation_errors?.[0];
  if (!response.ok || !payload.success) throw new Error(validationError ?? payload.error?.message ?? 'Request failed');
  return payload.data as T;
}
