import { check } from './httpError.js';

/** Range for PostgREST from validated page/pageSize. */
export function pageRange({ page = 1, pageSize = 20 }) {
  const from = (page - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}

export const listMeta = ({ page = 1, pageSize = 20 }, total) => ({ page, pageSize, total: total ?? 0 });

/**
 * Makes user search text safe to embed in a PostgREST `or=(...)` filter by
 * stripping characters that have syntactic meaning there.
 */
export function sanitizeSearch(text) {
  return String(text ?? '')
    .replace(/[,()*%\\"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

/** Builds an ilike OR filter over columns, or null when there's no usable search text. */
export function searchFilter(text, columns) {
  const s = sanitizeSearch(text);
  if (!s) return null;
  return columns.map((c) => `${c}.ilike.*${s}*`).join(',');
}

/** Applies whitelisted sorting: `sortMap` maps API keys to DB columns. */
export function applySort(query, { sort, order }, sortMap, fallback) {
  const column = (sort && sortMap[sort]) || fallback.column;
  const ascending = sort && sortMap[sort] ? order !== 'desc' : fallback.ascending ?? true;
  return query.order(column, { ascending });
}

/**
 * Reads every row of a query in pages, because PostgREST caps a single response
 * (1000 rows by default). `build()` must return a fresh query each call.
 */
export async function fetchAll(build, pageSize = 1000) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data } = check(await build().range(from, from + pageSize - 1));
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}
