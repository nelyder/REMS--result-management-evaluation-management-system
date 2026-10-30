import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { UserCheck, Users, X } from 'lucide-react';
import { Button, Checkbox, ErrorState, SearchInput, Spinner } from './ui/index.js';

const matches = (s, term) => `${s.student.fullName} ${s.student.registrationNumber}`.toLowerCase().includes(term);

/**
 * Checkbox list of candidate students with search, select-all and a "selected" panel.
 * candidates: [{ studentId, student: { fullName, registrationNumber, programmeCode, yearOfStudy } }]
 * selected: Set of student ids (controlled). Nothing is saved here; the parent saves.
 */
export function StudentPicker({ candidates = [], selected, onChange, loading, error, onRetry, emptyMessage, disabled }) {
  const [search, setSearch] = useState('');
  const selectAllRef = useRef(null);
  const selectAllId = useId();
  const term = search.trim().toLowerCase();

  const visible = useMemo(() => (term ? candidates.filter((s) => matches(s, term)) : candidates), [candidates, term]);
  const visibleSelected = visible.filter((s) => selected.has(s.studentId)).length;
  const allVisibleSelected = visible.length > 0 && visibleSelected === visible.length;
  const chosen = candidates.filter((s) => selected.has(s.studentId));

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = visibleSelected > 0 && !allVisibleSelected;
  }, [visibleSelected, allVisibleSelected]);

  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };
  const toggleAll = () => {
    const next = new Set(selected);
    for (const s of visible) {
      if (allVisibleSelected) next.delete(s.studentId);
      else next.add(s.studentId);
    }
    onChange(next);
  };

  if (loading) return <Spinner label="Loading students" className="py-6" />;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (!candidates.length) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">
        <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
        {emptyMessage || 'No enrolled students are available.'}
      </p>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_15rem]">
      <section aria-label="Available students" className="min-w-0">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by name or registration number…" label="Search students" />
        <div className="mt-2 flex items-center justify-between gap-2 rounded-t-lg border border-b-0 border-slate-200 bg-slate-50 px-3 py-2">
          <div className="flex items-center gap-2">
            <input
              ref={selectAllRef}
              id={selectAllId}
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 accent-brand-700"
              checked={allVisibleSelected}
              onChange={toggleAll}
              disabled={disabled || !visible.length}
            />
            <label htmlFor={selectAllId} className="text-sm font-medium text-slate-700">
              Select all {term ? `${visible.length} matching` : `${visible.length} students`}
            </label>
          </div>
          <span className="text-xs font-medium text-slate-600" aria-live="polite">
            {selected.size} selected
          </span>
        </div>
        <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-b-lg border border-slate-200">
          {visible.map((s) => (
            <li key={s.studentId} className="px-3 py-2">
              <Checkbox
                checked={selected.has(s.studentId)}
                onChange={() => toggle(s.studentId)}
                disabled={disabled}
                label={s.student.fullName}
                description={[s.student.registrationNumber, s.student.programmeCode, s.student.yearOfStudy && `Year ${s.student.yearOfStudy}`]
                  .filter(Boolean)
                  .join(' · ')}
              />
            </li>
          ))}
          {!visible.length && <li className="px-3 py-6 text-center text-sm text-slate-500">No students match “{search}”.</li>}
        </ul>
      </section>

      <section aria-labelledby={`${selectAllId}-chosen`} className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="mb-2 flex items-center justify-between">
          <h4 id={`${selectAllId}-chosen`} className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <UserCheck className="h-4 w-4 text-brand-700" aria-hidden="true" /> Selected ({chosen.length})
          </h4>
          {chosen.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => onChange(new Set())} disabled={disabled}>
              Clear
            </Button>
          )}
        </div>
        {chosen.length ? (
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {chosen.map((s) => (
              <li key={s.studentId} className="flex items-center justify-between gap-2 rounded-md bg-surface px-2 py-1.5 text-sm shadow-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-800">{s.student.fullName}</span>
                  <span className="block truncate font-mono text-xs text-slate-500">{s.student.registrationNumber}</span>
                </span>
                <button
                  type="button"
                  onClick={() => toggle(s.studentId)}
                  disabled={disabled}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-700"
                  aria-label={`Remove ${s.student.fullName} from selection`}
                  title="Remove from selection"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-500">Tick students on the left to add them.</p>
        )}
      </section>
    </div>
  );
}
