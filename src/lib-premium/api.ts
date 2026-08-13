// Unified API client for premium UI
const baseUrl = process.env.NEXT_PUBLIC_API_URL || '';

export const api = {
  get: (path: string) =>
    fetch(`${baseUrl}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    }),

  post: (path: string, data: unknown) =>
    fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      credentials: 'include',
    }),

  put: (path: string, data: unknown) =>
    fetch(`${baseUrl}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      credentials: 'include',
    }),

  delete: (path: string) =>
    fetch(`${baseUrl}${path}`, {
      method: 'DELETE',
      credentials: 'include',
    }),
};
