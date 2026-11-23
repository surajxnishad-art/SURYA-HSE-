export class ApiError extends Error {
  status: number;
  hindiMessage?: string;

  constructor(message: string, status = 500, hindiMessage?: string) {
    super(message);
    this.status = status;
    this.hindiMessage = hindiMessage;
  }
}

let inMemoryToken: string | null = null;
let onUnauthorizedCallback: (() => void) | null = null;

export function setAuthToken(token: string | null): void {
  inMemoryToken = token;
}

export function getAuthToken(): string | null {
  return inMemoryToken;
}

export function setOnUnauthorized(cb: () => void): void {
  onUnauthorizedCallback = cb;
}

export async function apiFetch<T = unknown>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (inMemoryToken) {
    headers.set('Authorization', `Bearer ${inMemoryToken}`);
  }
  if (
    options.body &&
    typeof options.body === 'string' &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401 && inMemoryToken && !url.includes('/auth/login')) {
    inMemoryToken = null;
    onUnauthorizedCallback?.();
  }

  const contentType = res.headers.get('content-type') || '';
  if (!res.ok) {
    if (contentType.includes('application/json')) {
      const errData = (await res.json()) as { error?: string; hindiError?: string };
      throw new ApiError(
        errData.error || `Request failed (${res.status})`,
        res.status,
        errData.hindiError
      );
    }
    throw new ApiError(`Request failed with status ${res.status}`, res.status);
  }

  if (contentType.includes('application/json')) {
    return (await res.json()) as T;
  }
  return (await res.text()) as unknown as T;
}

export async function downloadAuthorizedFile(
  url: string,
  fallbackFilename: string
): Promise<void> {
  const headers = new Headers();
  if (inMemoryToken) {
    headers.set('Authorization', `Bearer ${inMemoryToken}`);
  }

  const res = await fetch(url, { headers });
  if (res.status === 401) {
    inMemoryToken = null;
    onUnauthorizedCallback?.();
    throw new ApiError('Session expired. Please sign in again.', 401);
  }
  if (!res.ok) {
    let msg = `Download failed (${res.status})`;
    try {
      const json = (await res.json()) as { error?: string };
      if (json.error) msg = json.error;
    } catch {
      // ignore
    }
    throw new ApiError(msg, res.status);
  }

  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/i);
  const filename = match ? match[1] : fallbackFilename;

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
}
