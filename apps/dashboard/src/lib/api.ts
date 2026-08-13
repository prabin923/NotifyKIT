export const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export interface DashboardRequest { method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'; body?: unknown; }

export async function dashboardFetch<T>(path: string, token: string, request: DashboardRequest = {}): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, { method: request.method ?? 'GET', headers: { authorization: `Bearer ${token}`, ...(request.body ? { 'content-type': 'application/json' } : {}) }, ...(request.body ? { body: JSON.stringify(request.body) } : {}), cache: 'no-store' });
  if (response.status === 204) return undefined as T;
  const payload = await response.json() as { success: boolean; data?: T; error?: { message?: string; details?: { validation_errors?: string[] } } };
  const validationError = payload.error?.details?.validation_errors?.[0];
  if (!response.ok || !payload.success) throw new Error(validationError ?? payload.error?.message ?? 'Request failed');
  return payload.data as T;
}
