import { check } from '../utils/httpError.js';
import { listMeta, pageRange, sanitizeSearch } from '../utils/query.js';
import { mapAudit } from '../utils/mappers.js';

export async function list(db, q) {
  const { from, to } = pageRange(q);
  let query = db.from('audit_logs').select('*, actor:profiles(full_name)', { count: 'exact' });
  if (q.entityType) query = query.eq('entity_type', q.entityType);
  if (q.action) query = query.eq('action', q.action);
  if (q.from) query = query.gte('created_at', `${q.from}T00:00:00Z`);
  if (q.to) query = query.lte('created_at', `${q.to}T23:59:59.999Z`);
  const s = sanitizeSearch(q.search);
  if (s) query = query.ilike('entity_id', `${s}%`);
  const { data, count } = check(await query.order('created_at', { ascending: false }).range(from, to));
  return { data: data.map(mapAudit), meta: listMeta(q, count) };
}
