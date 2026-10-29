import { useEffect, useMemo, useState } from 'react';

export function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/** Shared state for paginated, searchable, sortable, filterable server lists. */
export function useListQuery({ pageSize = 20, sort: initialSort = null, filters: initialFilters = {} } = {}) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState(initialSort);
  const [filters, setFilters] = useState(initialFilters);
  const debouncedSearch = useDebounce(search);

  // Any change to the query returns to the first page.
  useEffect(() => setPage(1), [debouncedSearch, sort, filters]);

  const params = useMemo(() => {
    const p = { page, pageSize };
    if (debouncedSearch) p.search = debouncedSearch;
    if (sort) Object.assign(p, { sort: sort.key, order: sort.order });
    for (const [k, v] of Object.entries(filters)) if (v !== '' && v != null) p[k] = v;
    return p;
  }, [page, pageSize, debouncedSearch, sort, filters]);

  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));

  return { page, setPage, pageSize, search, setSearch, sort, setSort, filters, setFilter, params };
}
