export interface FieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly fields: FieldError[] = [],
  ) {
    super(message);
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
  headers?: Record<string, string>;
}

export async function api<T>(path: string, { method = 'GET', body, headers }: RequestOptions = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      // X-App-Request is the server's CSRF check: cross-site pages cannot set custom headers.
      headers: { 'Content-Type': 'application/json', 'X-App-Request': '1', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'You appear to be offline. Check your connection and try again.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, data.error ?? 'Something went wrong. Please try again.', data.fields);
  return data as T;
}
