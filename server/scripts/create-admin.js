// Creates the FIRST administrator (bootstrap). Run once from a trusted machine:
//   npm run create-admin -w server -- --email registrar@your-uni.edu --name "Ada Registrar"
// The password is read from the ADMIN_PASSWORD environment variable or prompted for.
// Further admins/lecturers/students are created from the app by an admin.
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { adminClient } from '../src/config/supabase.js';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = (arg('email') || '').trim().toLowerCase();
  const fullName = (arg('name') || '').trim();
  if (!/^\S+@\S+\.\S+$/.test(email) || fullName.length < 2) {
    console.error('Usage: npm run create-admin -w server -- --email <email> --name "<full name>"');
    process.exit(1);
  }

  let password = process.env.ADMIN_PASSWORD;
  if (!password) {
    const rl = createInterface({ input: stdin, output: stdout });
    password = await rl.question('Password for the new administrator (min 12 chars): ');
    rl.close();
  }
  if (!password || password.length < 12) {
    console.error('Password must be at least 12 characters.');
    process.exit(1);
  }

  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: 'admin' },
  });
  if (error) {
    console.error(`Could not create auth user: ${error.message}`);
    process.exit(1);
  }

  const { error: profileError } = await adminClient
    .from('profiles')
    .insert({ id: data.user.id, full_name: fullName, email, role: 'admin' });
  if (profileError) {
    await adminClient.auth.admin.deleteUser(data.user.id);
    console.error(`Could not create profile: ${profileError.message}`);
    process.exit(1);
  }

  await adminClient.from('audit_logs').insert({
    actor_id: null,
    action: 'CREATE_USER',
    entity_type: 'auth',
    entity_id: data.user.id,
    new_values: { email, role: 'admin', via: 'create-admin script' },
  });

  console.log(`Administrator created: ${email}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
