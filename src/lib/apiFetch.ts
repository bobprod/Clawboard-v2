/**
 * apiFetch — wrapper fetch qui injecte le token Bearer.
 *
 * Priorité :
 *   1. localStorage `clawboard-token`  (défini après login)
 *   2. Variable d'environnement VITE_AUTH_TOKEN (CI / déploiement)
 *   3. Aucun header Authorization (accès public)
 */
const ENV_TOKEN: string = import.meta.env.VITE_AUTH_TOKEN ?? '';

function getToken(): string {
  return localStorage.getItem('clawboard-token') ?? ENV_TOKEN;
}

/** Structured API error with status code, message, and optional validation details. */
export class ApiError extends Error {
  status: number;
  details?: string[];
  constructor(status: number, message: string, details?: string[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  if (!token) return fetch(url, init);
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401) {
    // Token invalide — on vide le localStorage et on redirige vers login
    localStorage.removeItem('clawboard-token');
    window.location.href = '/';
  }
  return res;
}

/**
 * apiFetchJson<T> — fetch + parse JSON with structured error handling.
 * Returns { data, error, status } instead of throwing.
 */
export async function apiFetchJson<T = unknown>(
  url: string,
  init: RequestInit = {},
): Promise<{ data: T | null; error: string | null; status: number; details?: string[] }> {
  try {
    const res = await apiFetch(url, init);
    const status = res.status;
    if (!res.ok) {
      try {
        const body = await res.json();
        return {
          data: null,
          error: body.error || body.message || `HTTP ${status}`,
          status,
          details: body.details,
        };
      } catch {
        return { data: null, error: `HTTP ${status}`, status };
      }
    }
    const data = (await res.json()) as T;
    return { data, error: null, status };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Network error',
      status: 0,
    };
  }
}
