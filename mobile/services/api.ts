const FALLBACK_API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? FALLBACK_API_BASE_URL;

export function buildApiUrl(path: string) {
  return `${API_BASE_URL}${path}`;
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
  const response = await fetch(buildApiUrl(path));

  if (!response.ok) {
    throw await createApiError(response);
  }

  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw await createApiError(response);
  }

  return response.json() as Promise<T>;
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
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
    headers: {
      "Content-Type": "application/json",
    },
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
  });

  if (!response.ok) {
    throw await createApiError(response);
  }

  return response.json() as Promise<T>;
}

export async function apiPostForm<T>(path: string, body: FormData): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    method: "POST",
    body,
  });

  if (!response.ok) {
    throw await createApiError(response);
  }

  return response.json() as Promise<T>;
}
