import { useEffect, useState } from 'react';
import {
  coursesService,
  departmentsService,
  lecturersService,
  periodsService,
  programmesService,
} from '../services/index.js';
import { periodLabel } from '../utils/format.js';

const loaders = {
  departments: () =>
    departmentsService.list({ pageSize: 100 }).then((r) => r.data.map((d) => ({ value: d.id, label: `${d.code} — ${d.name}` }))),
  programmes: () =>
    programmesService.list({ pageSize: 100 }).then((r) => r.data.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))),
  courses: () =>
    coursesService.list({ pageSize: 100 }).then((r) => r.data.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }))),
  lecturers: () =>
    lecturersService.list({ pageSize: 100 }).then((r) =>
      r.data.map((l) => ({ value: l.id, label: `${l.fullName} (${l.staffNumber})` })),
    ),
  periods: () =>
    periodsService.list({ pageSize: 100 }).then((r) => r.data.map((p) => ({ value: p.id, label: periodLabel(p), raw: p }))),
};

/** Loads <select> options for reference data. Returns { [name]: options[] }. */
export function useOptions(names) {
  const key = names.join(',');
  const [options, setOptions] = useState(() => Object.fromEntries(names.map((n) => [n, []])));

  useEffect(() => {
    let active = true;
    Promise.all(key.split(',').map((n) => loaders[n]().catch(() => []))).then((lists) => {
      if (active) setOptions(Object.fromEntries(key.split(',').map((n, i) => [n, lists[i]])));
    });
    return () => {
      active = false;
    };
  }, [key]);

  return options;
}
