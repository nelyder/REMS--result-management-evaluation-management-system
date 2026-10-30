export const formatMark = (value) =>
  value === null || value === undefined || value === '' ? '—' : Number(value).toFixed(Number(value) % 1 ? 2 : 0);

export const formatPercent = (value) =>
  value === null || value === undefined ? '—' : `${(Number(value) * 100).toFixed(1)}%`;

export const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

export const formatDateTime = (value) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

export const periodLabel = (p) => (p ? `${p.academicYear} · Semester ${p.semester}` : '—');

export const titleCase = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') : '');

/** 'overdue' | 'soon' (within 3 days) | 'upcoming' for an ISO due date. */
export function dueState(dueAt, now = Date.now()) {
  const ms = new Date(dueAt).getTime() - now;
  if (ms < 0) return 'overdue';
  return ms <= 3 * 24 * 60 * 60 * 1000 ? 'soon' : 'upcoming';
}

/** ISO timestamp -> value for <input type="datetime-local"> in the browser's time zone. */
export function toDateTimeLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
