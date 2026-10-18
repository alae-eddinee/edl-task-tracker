import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server-admin';
import { lookupPassword } from '@/lib/password-vault';

// Reveals one user's current password to an admin (only passwords set through the app are known)
export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const { userId } = await request.json().catch(() => ({}));
  if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });

  try {
    const password = await lookupPassword(auth.supabase, userId);
    return NextResponse.json({ password });
  } catch (err) {
    console.error('[user-password] lookup failed:', err);
    return NextResponse.json({ error: 'Could not read the password vault' }, { status: 500 });
  }
}
