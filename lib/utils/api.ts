export async function apiFetch<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const { headers, ...requestOptions } = options ?? {};
  const res = await fetch(url, {
    ...requestOptions,
    headers: { "Content-Type": "application/json", ...headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export function apiPost<T>(url: string, body: unknown): Promise<T> {
  return apiFetch<T>(url, { method: "POST", body: JSON.stringify(body) });
}

export function apiPut<T>(url: string, body: unknown): Promise<T> {
  return apiFetch<T>(url, { method: "PUT", body: JSON.stringify(body) });
}

export function apiDelete<T>(url: string): Promise<T> {
  return apiFetch<T>(url, { method: "DELETE" });
}
