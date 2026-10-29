import { useId } from 'react';
import { Search } from 'lucide-react';

const control =
  'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20 disabled:bg-slate-100 disabled:text-slate-500 aria-[invalid=true]:border-red-500';

/** Label + control + hint/error, wired up for screen readers. */
export function Field({ label, error, hint, required, children, className = '' }) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
          {label}
          {required && <span className="ml-0.5 text-red-600" aria-hidden="true">*</span>}
        </label>
      )}
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined, required })}
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-xs text-red-600">{error}</p>
      ) : (
        hint && <p id={`${id}-hint`} className="mt-1 text-xs text-slate-500">{hint}</p>
      )}
    </div>
  );
}

export function Input({ label, error, hint, className, ...props }) {
  return (
    <Field label={label} error={error} hint={hint} required={props.required} className={className}>
      {(a11y) => <input className={control} {...a11y} {...props} />}
    </Field>
  );
}

export function Select({ label, error, hint, className, options = [], placeholder, ...props }) {
  return (
    <Field label={label} error={error} hint={hint} required={props.required} className={className}>
      {(a11y) => (
        <select className={control} {...a11y} {...props}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function Textarea({ label, error, hint, className, ...props }) {
  return (
    <Field label={label} error={error} hint={hint} required={props.required} className={className}>
      {(a11y) => <textarea className={control} rows={3} {...a11y} {...props} />}
    </Field>
  );
}

export function Checkbox({ label, description, ...props }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-600"
        {...props}
      />
      <label htmlFor={id} className="text-sm">
        <span className="font-medium text-slate-800">{label}</span>
        {description && <span className="block text-slate-500">{description}</span>}
      </label>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…', label = 'Search', className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
      <input
        type="search"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${control} pl-9`}
      />
    </div>
  );
}
