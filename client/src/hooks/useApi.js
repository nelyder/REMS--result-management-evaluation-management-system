import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Runs `fetcher` on mount and whenever `deps` change. Ignores stale responses.
 * Returns { data, meta, loading, error, errorStatus, reload, setData }.
 */
export function useApi(fetcher, deps = [], { enabled = true } = {}) {
  const [state, setState] = useState({ data: null, meta: null, loading: enabled, error: null, errorStatus: null });
  const requestId = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setState((s) => ({ ...s, loading: true, error: null, errorStatus: null }));
    try {
      const res = await fetcherRef.current();
      if (id === requestId.current) {
        setState({ data: res?.data ?? null, meta: res?.meta ?? null, loading: false, error: null, errorStatus: null });
      }
    } catch (err) {
      if (id === requestId.current) setState((s) => ({ ...s, loading: false, error: err.message, errorStatus: err.status ?? null }));
    }
  }, []);

  useEffect(() => {
    if (enabled) load();
    else setState((s) => ({ ...s, loading: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, load, ...deps]);

  const setData = useCallback((updater) => {
    setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater }));
  }, []);

  return { ...state, reload: load, setData };
}
