import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server-admin';
import { rememberPassword } from '@/lib/password-vault';

const ROLES = ['admin', 'manager', 'employee'];

// Created server-side so public sign-up can stay disabled in Supabase
export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  const { supabase } = auth;

  const { fullName, email, password, role } = await request.json().catch(() => ({}));
  if (!fullName?.trim() || !email?.trim() || !password) {
    return NextResponse.json({ error: 'Name, email and password are required' }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
  }
  if (!ROLES.includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: email.trim(),
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName.trim(), role },
  });
  if (error || !data.user) {
    return NextResponse.json({ error: error?.message || 'Could not create the user' }, { status: 400 });
  }

  // The profile row is created by the on_auth_user_created trigger; make sure name/role are exact
  await supabase.from('profiles').update({ full_name: fullName.trim(), role }).eq('id', data.user.id);
  await rememberPassword(supabase, data.user.id, password);

  return NextResponse.json({ success: true, userId: data.user.id });
}
