import { History } from 'lucide-react';
import { EmptyState, ErrorState, Modal, Spinner, Badge } from './ui/index.js';
import { ChangeDiff } from '../pages/admin/AuditLogsPage.jsx';
import { resultsService } from '../services/index.js';
import { useApi } from '../hooks/useApi.js';
import { formatDateTime } from '../utils/format.js';

export function ResultHistoryModal({ result, studentName, onClose }) {
  const history = useApi(() => resultsService.history(result.id), [result?.id], { enabled: !!result });
  return (
    <Modal open={!!result} onClose={onClose} size="lg" title="Result history" description={studentName}>
      {history.loading ? (
        <Spinner />
      ) : history.error ? (
        <ErrorState message={history.error} onRetry={history.reload} />
      ) : !history.data?.length ? (
        <EmptyState icon={History} title="No changes recorded" />
      ) : (
        <ol className="space-y-4">
          {history.data.map((h) => (
            <li key={h.id} className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge tone={h.action === 'CORRECT' ? 'amber' : h.action === 'PUBLISH' ? 'violet' : 'blue'}>{h.action}</Badge>
                  <span className="text-sm font-medium text-slate-800">{h.actor?.fullName || 'System'}</span>
                </div>
                <time className="text-xs text-slate-500" dateTime={h.createdAt}>{formatDateTime(h.createdAt)}</time>
              </div>
              {h.newValues?.correction_reason && <p className="mb-2 text-sm text-amber-900">Reason: {h.newValues.correction_reason}</p>}
              <ChangeDiff previous={h.previousValues} next={h.newValues} />
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}
