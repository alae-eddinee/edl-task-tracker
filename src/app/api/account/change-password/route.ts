import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/server-admin';
import { rememberPassword } from '@/lib/password-vault';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// A signed-in user changes their own password after proving they know the current one
export async function POST(request: Request) {
  const supabase = createServiceClient();
  if (!supabase) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const { data: userData } = token ? await supabase.auth.getUser(token) : { data: { user: null } };
  const user = userData.user;
  if (!user?.email) return NextResponse.json({ error: 'Please sign in again' }, { status: 401 });

  const { currentPassword, newPassword } = await request.json().catch(() => ({}));
  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: 'Both passwords are required' }, { status: 400 });
  }
  if (newPassword.length < 6) {
    return NextResponse.json({ error: 'The new password must be at least 6 characters.' }, { status: 400 });
  }

  // Check the current password without touching the caller's session
  const verify = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: user.email, password: currentPassword }),
  });
  if (!verify.ok) {
    return NextResponse.json({ error: 'Your current password is incorrect.' }, { status: 400 });
  }
  // Update with the caller's own session: Supabase signs out every *other* session on a
  // password change, so this keeps the person signed in on the device they're using
  const update = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: 'PUT',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: newPassword }),
  });
  if (!update.ok) {
    const body = await update.json().catch(() => ({}));
    return NextResponse.json({ error: body.msg || body.message || 'Could not change your password.' }, { status: 400 });
  }

  await rememberPassword(supabase, user.id, newPassword);
  return NextResponse.json({ success: true });
}
