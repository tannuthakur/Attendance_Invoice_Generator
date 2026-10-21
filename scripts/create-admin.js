/**
 * Bootstraps the first admin (every user-management route is admin-only).
 *   node scripts/create-admin.js admin@example.com 'StrongPassword!' "Ada Admin"
 * Promotes the user to admin if the email already exists.
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

async function main() {
  const [email, password, fullName] = process.argv.slice(2);
  if (!email || !password) {
    console.error('Usage: node scripts/create-admin.js <email> <password> [full name]');
    process.exit(1);
  }
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: ws },
  });

  let userId;
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) {
    if (!/already/i.test(error.message)) throw error;
    const { data: existing, error: lookupError } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single();
    if (lookupError) throw lookupError;
    userId = existing.id;
    console.log(`User ${email} already exists; promoting to admin.`);
  } else {
    userId = data.user.id;
  }

  const { error: upsertError } = await supabase
    .from('profiles')
    .upsert({ id: userId, email, full_name: fullName ?? null, role: 'admin' });
  if (upsertError) throw upsertError;
  console.log(`Admin ready: ${email} (${userId})`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
