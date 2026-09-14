import { getAccessToken } from '@/services/authSession';

const FALLBACK_API_BASE_URL = 'http://127.0.0.1:8001/api/v1';

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? FALLBACK_API_BASE_URL;

export function buildApiUrl(path: string) {
  return `${API_BASE_URL}${path}`;
}

export async function buildAuthHeaders(extraHeaders: Record<string, string> = {}) {
  const accessToken = await getAccessToken();
  return {
    ...extraHeaders,
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

async function createApiError(response: Response) {
  const fallbackMessage = `Request failed with status ${response.status}`;

  try {
    const data = (await response.json()) as {
      detail?: string;
      message?: string;
      error?: string;
    };

    const message = data.detail || data.message || data.error || fallbackMessage;
    return new Error(message);
  } catch {
    return new Error(fallbackMessage);
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    headers: await buildAuthHeaders(),
  });

  if (!response.ok) {
    throw await createApiError(response);
  }

  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    method: "POST",
    headers: await buildAuthHeaders({
      "Content-Type": "application/json",
    }),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw await createApiError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    method: "PATCH",
    headers: await buildAuthHeaders({
      "Content-Type": "application/json",
    }),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw await createApiError(response);
  }

  return response.json() as Promise<T>;
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    method: "PUT",
    headers: await buildAuthHeaders({
      "Content-Type": "application/json",
    }),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw await createApiError(response);
  }

  return response.json() as Promise<T>;
}

export async function apiDelete<T>(path: string): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    method: "DELETE",
    headers: await buildAuthHeaders(),
  });

  if (!response.ok) {
    throw await createApiError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function apiPostForm<T>(path: string, body: FormData): Promise<T> {
  const accessToken = await getAccessToken();
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", buildApiUrl(path));
    if (accessToken) {
      xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as T);
        } catch {
          reject(new Error("Failed to parse response"));
        }
      } else {
        try {
          const data = JSON.parse(xhr.responseText) as {
            detail?: string;
            message?: string;
            error?: string;
          };
          const message =
            data.detail ||
            data.message ||
            data.error ||
            `Request failed with status ${xhr.status}`;
          reject(new Error(message));
        } catch {
          reject(new Error(`Request failed with status ${xhr.status}`));
        }
      }
    };
    xhr.onerror = () => reject(new Error("Network request failed"));
    xhr.send(body);
  });
}
