import '@testing-library/jest-dom/vitest';

// Node 25+ defines its own experimental `localStorage` global, which is undefined unless
// --localstorage-file is set and hides jsdom's. Provide an in-memory Storage for tests.
if (typeof window !== 'undefined' && !window.localStorage) {
  const store = new Map();
  const storage = {
    getItem: (k) => (store.has(String(k)) ? store.get(String(k)) : null),
    setItem: (k, v) => store.set(String(k), String(v)),
    removeItem: (k) => store.delete(String(k)),
    clear: () => store.clear(),
    key: (i) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
}
