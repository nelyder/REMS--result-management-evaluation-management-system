import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_URL: z
    .string()
    .min(1)
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean))
    .pipe(z.array(z.string().url()).min(1)),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
});

/** Validates configuration. Error messages name variables but never echo values. */
export function loadEnv(source = process.env) {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const vars = [...new Set(parsed.error.issues.map((i) => i.path[0]))].join(', ');
    throw new Error(`Invalid or missing environment variables: ${vars}. See server/.env.example.`);
  }
  return parsed.data;
}

export const env = loadEnv();
