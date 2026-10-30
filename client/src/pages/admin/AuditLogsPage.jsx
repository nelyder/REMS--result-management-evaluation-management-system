import { useState } from 'react';
import { Eye } from 'lucide-react';
import { DataTable } from '../../components/DataTable.jsx';
import { Pagination } from '../../components/Pagination.jsx';
import { Badge, Button, Card, Input, Modal, PageHeader, SearchInput, Select } from '../../components/ui/index.js';
import { auditService } from '../../services/index.js';
import { useApi } from '../../hooks/useApi.js';
import { useListQuery } from '../../hooks/useListQuery.js';
import { formatDateTime, titleCase } from '../../utils/format.js';

const ENTITY_TYPES = ['results', 'profiles', 'students', 'lecturers', 'courses', 'enrollments', 'course_assignments', 'grading_scales', 'evaluation_settings', 'academic_periods'].map((v) => ({
  value: v,
  label: titleCase(v),
}));
const ACTIONS = ['INSERT', 'UPDATE', 'DELETE', 'PUBLISH', 'CORRECT', 'SUBMIT', 'RETURN', 'CREATE_USER', 'STATUS_CHANGE'].map((v) => ({
  value: v,
  label: titleCase(v.toLowerCase()),
}));
const actionTone = { INSERT: 'green', CREATE_USER: 'green', UPDATE: 'blue', DELETE: 'red', PUBLISH: 'violet', CORRECT: 'amber', STATUS_CHANGE: 'amber' };

export function ChangeDiff({ previous, next }) {
  const keys = [...new Set([...Object.keys(previous || {}), ...Object.keys(next || {})])].filter(
    (k) => !['updated_at', 'created_at'].includes(k),
  );
  const changed = keys.filter((k) => JSON.stringify(previous?.[k]) !== JSON.stringify(next?.[k]));
  const show = previous && next ? changed : keys;
  if (!show.length) return <p className="text-sm text-slate-500">No field changes recorded.</p>;
  const fmt = (v) => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));
  return (
    <table className="min-w-full text-sm">
      <caption className="sr-only">Changed fields</caption>
      <thead>
        <tr className="text-left text-xs uppercase text-slate-500">
          <th scope="col" className="pb-2 pr-4">Field</th>
          <th scope="col" className="pb-2 pr-4">Before</th>
          <th scope="col" className="pb-2">After</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {show.map((k) => (
          <tr key={k}>
            <td className="py-1.5 pr-4 font-mono text-xs text-slate-600">{k}</td>
            <td className="break-all py-1.5 pr-4 text-red-700">{fmt(previous?.[k])}</td>
            <td className="break-all py-1.5 text-emerald-700">{fmt(next?.[k])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function AuditLogsPage() {
  const q = useListQuery({ pageSize: 25 });
  const list = useApi(() => auditService.list(q.params), [JSON.stringify(q.params)]);
  const [selected, setSelected] = useState(null);

  return (
    <>
      <PageHeader title="Audit logs" description="Tamper-protected record of important changes. Entries are written by the database and cannot be edited." />
      <Card bodyClassName="">
        <div className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <SearchInput value={q.search} onChange={q.setSearch} placeholder="Search by record id…" className="lg:col-span-1" />
          <Select aria-label="Entity type" value={q.filters.entityType ?? ''} onChange={(e) => q.setFilter('entityType', e.target.value)} options={ENTITY_TYPES} placeholder="All entities" />
          <Select aria-label="Action" value={q.filters.action ?? ''} onChange={(e) => q.setFilter('action', e.target.value)} options={ACTIONS} placeholder="All actions" />
          <Input aria-label="From date" type="date" value={q.filters.from ?? ''} onChange={(e) => q.setFilter('from', e.target.value)} />
          <Input aria-label="To date" type="date" value={q.filters.to ?? ''} onChange={(e) => q.setFilter('to', e.target.value)} />
        </div>
        <DataTable
          caption="Audit log entries"
          columns={[
            { key: 'createdAt', header: 'When', render: (r) => <span className="whitespace-nowrap">{formatDateTime(r.createdAt)}</span> },
            { key: 'actor', header: 'Actor', render: (r) => r.actor?.fullName || <span className="text-slate-400">System</span> },
            { key: 'action', header: 'Action', render: (r) => <Badge tone={actionTone[r.action] || 'gray'}>{r.action}</Badge> },
            { key: 'entityType', header: 'Entity', render: (r) => titleCase(r.entityType) },
            { key: 'entityId', header: 'Record', className: 'font-mono text-xs', render: (r) => r.entityId?.slice(0, 8) || '—' },
            {
              key: 'view',
              header: <span className="sr-only">Details</span>,
              align: 'right',
              render: (r) => (
                <Button variant="ghost" size="icon" onClick={() => setSelected(r)} aria-label="View change details">
                  <Eye className="h-4 w-4" />
                </Button>
              ),
            },
          ]}
          rows={list.data || []}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          emptyTitle="No audit entries match"
          footer={<Pagination page={q.page} pageSize={q.pageSize} total={list.meta?.total || 0} onPageChange={q.setPage} />}
        />
      </Card>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        size="lg"
        title={selected ? `${selected.action} · ${titleCase(selected.entityType)}` : ''}
        description={selected ? `${formatDateTime(selected.createdAt)} by ${selected.actor?.fullName || 'System'}` : ''}
      >
        {selected && (
          <>
            {selected.newValues?.correction_reason && (
              <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                <span className="font-medium">Reason:</span> {selected.newValues.correction_reason}
              </p>
            )}
            <ChangeDiff previous={selected.previousValues} next={selected.newValues} />
          </>
        )}
      </Modal>
    </>
  );
}
