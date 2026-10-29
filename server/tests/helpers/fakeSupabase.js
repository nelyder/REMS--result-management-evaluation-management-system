// Minimal stand-in for the Supabase query builder. Every call is recorded so
// tests can assert which filters the server applied; responses come from
// per-table handler functions.
const RECORDED = ['eq', 'neq', 'in', 'is', 'gte', 'lte', 'ilike', 'or', 'order', 'range', 'limit'];
const WRITES = ['insert', 'update', 'upsert', 'delete'];

export function createFakeDb(handlers = {}) {
  const calls = [];
  const rpcCalls = [];

  const from = (table) => {
    const ctx = { table, op: 'select', filters: [], payload: undefined, single: null, select: undefined };
    calls.push(ctx);
    const builder = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'then') {
            const handler = handlers[table];
            const result = handler ? handler(ctx) : { data: ctx.single ? null : [], error: null };
            return (resolve, reject) => Promise.resolve({ error: null, ...result }).then(resolve, reject);
          }
          return (...args) => {
            if (WRITES.includes(prop)) {
              ctx.op = prop;
              ctx.payload = args[0];
            } else if (prop === 'select') {
              ctx.select = args[0];
            } else if (prop === 'single' || prop === 'maybeSingle') {
              ctx.single = prop;
            } else if (RECORDED.includes(prop)) {
              ctx.filters.push([prop, ...args]);
            }
            return builder;
          };
        },
      },
    );
    return builder;
  };

  const rpc = async (name, args) => {
    rpcCalls.push({ name, args });
    const handler = handlers[`rpc:${name}`];
    return { error: null, data: null, ...(handler ? handler(args) : {}) };
  };

  /** Value of the first `.eq(column, value)` filter, if any. */
  const eqValue = (ctx, column) => ctx.filters.find(([op, col]) => op === 'eq' && col === column)?.[2];

  return { from, rpc, calls, rpcCalls, eqValue };
}
