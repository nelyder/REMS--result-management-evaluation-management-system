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
