import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { DataTable } from './DataTable.jsx';
import { Pagination } from './Pagination.jsx';
import { Button, Card, ConfirmDialog, Input, Modal, PageHeader, SearchInput, Select } from './ui/index.js';
import { useApi } from '../hooks/useApi.js';
import { useListQuery } from '../hooks/useListQuery.js';
import { useToast } from '../contexts/ToastContext.jsx';

/** Maps API validation details ([{ path, message }]) to { field: message }. */
export function fieldErrorsFrom(err) {
  if (!Array.isArray(err?.details)) return {};
  return Object.fromEntries(err.details.filter((d) => d.path).map((d) => [d.path, d.message]));
}

export function FormFields({ fields, values, errors, onChange, mode }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields
        .filter((f) => !(f.createOnly && mode === 'edit') && !(f.editOnly && mode === 'create'))
        .map((f) => {
          const common = {
            key: f.name,
            label: f.label,
            name: f.name,
            required: f.required,
            hint: f.hint,
            error: errors[f.name],
            value: values[f.name] ?? '',
            onChange: (e) => onChange(f.name, e.target.value),
            className: f.full ? 'sm:col-span-2' : '',
            disabled: f.readOnlyOnEdit && mode === 'edit',
          };
          if (f.type === 'select') {
            return <Select {...common} options={f.options || []} placeholder={f.placeholder ?? 'Select…'} />;
          }
          return (
            <Input
              {...common}
              type={f.type || 'text'}
              min={f.min}
              max={f.max}
              step={f.step}
              placeholder={f.placeholder}
              autoComplete={f.autoComplete || 'off'}
            />
          );
        })}
    </div>
  );
}

function requiredErrors(fields, values, mode) {
  const errors = {};
  for (const f of fields) {
    if (f.createOnly && mode === 'edit') continue;
    if (f.editOnly && mode === 'create') continue;
    if (f.required && String(values[f.name] ?? '').trim() === '') errors[f.name] = `${f.label} is required`;
  }
  return errors;
}

export function CrudPage({
  title,
  description,
  entityName,
  service,
  columns,
  fields,
  initialValues,
  toForm = (row) => row,
  toPayload = (values) => values,
  validate,
  filters = [],
  searchPlaceholder,
  canDelete = false,
  rowActions,
  defaultSort,
  canEdit = true,
}) {
  const toast = useToast();
  const q = useListQuery({ sort: defaultSort });
  const list = useApi(() => service.list(q.params), [JSON.stringify(q.params)]);

  const [form, setForm] = useState(null); // { mode, id, values }
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const openCreate = () => {
    setErrors({});
    setForm({ mode: 'create', values: { ...initialValues } });
  };
  const openEdit = (row) => {
    setErrors({});
    setForm({ mode: 'edit', id: row.id, values: toForm(row) });
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const nextErrors = { ...requiredErrors(fields, form.values, form.mode), ...(validate?.(form.values, form.mode) || {}) };
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSaving(true);
    try {
      const body = toPayload(form.values, form.mode);
      if (form.mode === 'create') await service.create(body);
      else await service.update(form.id, body);
      toast.success(`${entityName[0].toUpperCase()}${entityName.slice(1)} ${form.mode === 'create' ? 'created' : 'updated'}.`);
      setForm(null);
      list.reload();
    } catch (err) {
      setErrors(fieldErrorsFrom(err));
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    setDeleting(true);
    try {
      await service.remove(toDelete.id);
      toast.success(`${entityName[0].toUpperCase()}${entityName.slice(1)} deleted.`);
      setToDelete(null);
      list.reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const allColumns = [
    ...columns,
    {
      key: '__actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-1">
          {rowActions?.(row, { reload: list.reload })}
          {canEdit && (
            <Button variant="ghost" size="icon" onClick={() => openEdit(row)} aria-label={`Edit ${entityName}`} title="Edit">
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          {canDelete && (
            <Button variant="ghost" size="icon" onClick={() => setToDelete(row)} aria-label={`Delete ${entityName}`} title="Delete">
              <Trash2 className="h-4 w-4 text-red-600" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={<Button icon={Plus} onClick={openCreate}>Add {entityName}</Button>}
      />
      <Card bodyClassName="">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center">
          <SearchInput
            value={q.search}
            onChange={q.setSearch}
            placeholder={searchPlaceholder || `Search ${title.toLowerCase()}…`}
            className="sm:max-w-xs sm:flex-1"
          />
          {filters.map((f) => (
            <Select
              key={f.name}
              aria-label={f.label}
              value={q.filters[f.name] ?? ''}
              onChange={(e) => q.setFilter(f.name, e.target.value)}
              options={f.options}
              placeholder={`All ${f.label.toLowerCase()}`}
              className="sm:w-56"
            />
          ))}
        </div>
        <DataTable
          caption={title}
          columns={allColumns}
          rows={list.data || []}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          sort={q.sort}
          onSort={q.setSort}
          emptyTitle={`No ${title.toLowerCase()} found`}
          emptyMessage={q.search ? 'Try a different search term.' : `Add the first ${entityName} to get started.`}
          footer={
            <Pagination page={q.page} pageSize={q.pageSize} total={list.meta?.total || 0} onPageChange={q.setPage} />
          }
        />
      </Card>

      <Modal
        open={!!form}
        onClose={() => !saving && setForm(null)}
        title={form?.mode === 'create' ? `Add ${entityName}` : `Edit ${entityName}`}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setForm(null)} disabled={saving}>Cancel</Button>
            <Button type="submit" form="crud-form" loading={saving}>
              {form?.mode === 'create' ? 'Create' : 'Save changes'}
            </Button>
          </>
        }
      >
        {form && (
          <form id="crud-form" onSubmit={onSubmit} noValidate>
            <FormFields
              fields={fields}
              values={form.values}
              errors={errors}
              mode={form.mode}
              onChange={(name, value) => setForm((f) => ({ ...f, values: { ...f.values, [name]: value } }))}
            />
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={onDelete}
        loading={deleting}
        title={`Delete ${entityName}?`}
        confirmLabel="Delete"
        message={`This permanently removes the ${entityName}. Records that depend on it will block deletion.`}
      />
    </>
  );
}
