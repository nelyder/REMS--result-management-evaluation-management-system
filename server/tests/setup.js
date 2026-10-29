// Placeholder configuration so modules load; no real Supabase project is contacted.
process.env.NODE_ENV = 'test';
process.env.PORT = '4001';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_ANON_KEY = 'test-anon-key-000000000000';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key-000000000000';
