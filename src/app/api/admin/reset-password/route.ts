import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server-admin';
import { rememberPassword } from '@/lib/password-vault';

export async function POST(request: Request) {
  try {
    // Only a signed-in admin may set someone else's password
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;
    const { supabase } = auth;

    const { userId, newPassword } = await request.json();

    if (!userId || !newPassword) {
      return NextResponse.json(
        { error: 'User ID and new password are required' },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    // Update user password using admin API
    const { data, error } = await supabase.auth.admin.updateUserById(
      userId,
      { password: newPassword }
    );

    if (error) {
      console.error('[API] Failed to reset password:', error.message);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    console.log('[API] Password reset successful for user:', userId);
    await rememberPassword(supabase, userId, newPassword);

    return NextResponse.json({
      success: true,
      message: 'Password reset successful. All sessions have been invalidated.',
      userId: data.user.id,
    });

  } catch (error: any) {
    console.error('[API] Unexpected error:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
