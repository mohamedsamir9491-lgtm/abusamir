export class ApiError extends Error { status: number; code: string; details?: unknown; constructor(status: number, code: string, message: string, details?: unknown) { super(message); this.status = status; this.code = code; this.details = details; } }

export async function api<T = unknown>(method: string, path: string, body?: unknown, opts: { form?: FormData; blob?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (!opts.form && body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`/api${path}`, { method, headers, credentials: 'include', body: opts.form ?? (body !== undefined ? JSON.stringify(body) : undefined) });
  if (opts.blob) { if (!res.ok) throw new ApiError(res.status, 'download_failed', 'تعذر تنزيل الملف'); return (await res.blob()) as unknown as T; }
  const ct = res.headers.get('content-type') ?? '';
  const data = ct.includes('json') ? await res.json() : await res.text();
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) { window.dispatchEvent(new CustomEvent('auth:expired')); }
    const d = data as { error?: string; message?: string; details?: unknown };
    const detail = Array.isArray(d.details) ? ' ' + (d.details as { path?: string; message?: string }[]).map((x) => (typeof x === 'string' ? x : `${x.path ?? ''}: ${x.message ?? ''}`)).join('؛ ') : '';
    throw new ApiError(res.status, d.error ?? 'error', (d.message ?? 'خطأ غير متوقع') + detail, d.details);
  }
  return data as T;
}
export const get = <T,>(p: string) => api<T>('GET', p);
export const post = <T,>(p: string, b?: unknown) => api<T>('POST', p, b);
export const put = <T,>(p: string, b?: unknown) => api<T>('PUT', p, b);
export const patch = <T,>(p: string, b?: unknown) => api<T>('PATCH', p, b);
export const del = <T,>(p: string) => api<T>('DELETE', p);
export const upload = <T,>(p: string, form: FormData) => api<T>('POST', p, undefined, { form });
export async function download(path: string, filename: string) {
  const blob = await api<Blob>('GET', path, undefined, { blob: true });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}
