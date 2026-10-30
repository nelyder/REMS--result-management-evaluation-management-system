import axios from 'axios';
import { supabase } from './supabase.js';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 20000,
});

api.interceptors.request.use(async (config) => {
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export class ApiError extends Error {
  constructor(message, { status, code, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function readBlobError(data) {
  // Error bodies for blob downloads arrive as Blob; decode them so messages still surface.
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    try {
      return JSON.parse(await data.text())?.error;
    } catch {
      return undefined;
    }
  }
  return data?.error;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status;
    const body = await readBlobError(error.response?.data);
    let message = body?.message;
    if (!message) {
      if (!error.response) message = 'Cannot reach the server. Check your connection and try again.';
      else if (status === 401) message = 'Your session has expired. Please sign in again.';
      else if (status === 403) message = 'You do not have permission to perform this action.';
      else message = 'Something went wrong. Please try again.';
    }
    if (status === 401) window.dispatchEvent(new CustomEvent('rems:unauthorized'));
    return Promise.reject(new ApiError(message, { status, code: body?.code, details: body?.details }));
  },
);

/**
 * Loads every page of a paginated list endpoint (the API caps pageSize at 100).
 * `fetchPage(params)` must resolve to `{ data, meta: { total } }`; returns `{ data, meta }`
 * with the first page's meta and all rows.
 */
export async function fetchAllPages(fetchPage, params = {}, { maxPages = 100 } = {}) {
  const pageSize = 100;
  const first = await fetchPage({ ...params, page: 1, pageSize });
  const rows = [...first.data];
  const total = first.meta?.total ?? rows.length;
  for (let page = 2; rows.length < total && page <= maxPages; page++) {
    const next = await fetchPage({ ...params, page, pageSize });
    if (!next.data.length) break;
    rows.push(...next.data);
  }
  return { data: rows, meta: first.meta };
}

/** Returns the `{ data, meta }` response body. */
const unwrap = (res) => res.data;

export const http = {
  get: (url, params) => api.get(url, { params }).then(unwrap),
  post: (url, body) => api.post(url, body).then(unwrap),
  patch: (url, body) => api.patch(url, body).then(unwrap),
  put: (url, body) => api.put(url, body).then(unwrap),
  del: (url) => api.delete(url).then(unwrap),
  download: async (url, params, filename) => {
    const res = await api.get(url, { params, responseType: 'blob' });
    const href = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  },
};
