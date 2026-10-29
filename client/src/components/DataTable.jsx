import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { EmptyState, ErrorState, Skeleton } from './ui/index.js';

/**
 * columns: [{ key, header, render?(row), sortable?, align?, className? }]
 * sort: { key, order: 'asc' | 'desc' } — controlled by the parent (server-side sorting).
 */
export function DataTable({
  columns,
  rows = [],
  loading,
  error,
  onRetry,
  caption,
  rowKey = 'id',
  sort,
  onSort,
  emptyTitle = 'No records found',
  emptyMessage,
  emptyAction,
  footer,
  skeletonRows = 5,
}) {
  const alignClass = (a) => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left');

  const header = (col) => {
    if (!col.sortable || !onSort) return col.header;
    const active = sort?.key === col.key;
    const Icon = !active ? ArrowUpDown : sort.order === 'asc' ? ArrowUp : ArrowDown;
    return (
      <button
        type="button"
        onClick={() => onSort({ key: col.key, order: active && sort.order === 'asc' ? 'desc' : 'asc' })}
        className="inline-flex items-center gap-1 rounded hover:text-slate-900"
      >
        {col.header}
        <Icon className={`h-3.5 w-3.5 ${active ? 'text-brand-700' : 'text-slate-400'}`} aria-hidden="true" />
      </button>
    );
  };

  const ariaSort = (col) => {
    if (!col.sortable || sort?.key !== col.key) return undefined;
    return sort.order === 'asc' ? 'ascending' : 'descending';
  };

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead className="bg-slate-50">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={ariaSort(col)}
                  className={`whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 ${alignClass(col.align)}`}
                >
                  {header(col)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {loading &&
              Array.from({ length: skeletonRows }).map((_, i) => (
                <tr key={`sk-${i}`}>
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3">
                      <Skeleton className="h-4 w-full max-w-[10rem]" />
                    </td>
                  ))}
                </tr>
              ))}
            {!loading &&
              !error &&
              rows.map((row, idx) => (
                <tr key={typeof rowKey === 'function' ? rowKey(row) : row[rowKey] ?? idx} className="hover:bg-slate-50/70">
                  {columns.map((col) => (
                    <td key={col.key} className={`px-4 py-3 align-middle text-slate-700 ${alignClass(col.align)} ${col.className || ''}`}>
                      {col.render ? col.render(row) : row[col.key] ?? '—'}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {!loading && error && <ErrorState message={error} onRetry={onRetry} />}
      {!loading && !error && rows.length === 0 && (
        <EmptyState title={emptyTitle} message={emptyMessage} action={emptyAction} />
      )}
      {footer}
    </div>
  );
}
