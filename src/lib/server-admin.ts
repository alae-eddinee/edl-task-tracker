// Server-only helpers for API routes that use the service role key.
import { NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export function createServiceClient(): SupabaseClient | null {
  if (!supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Verifies the request comes from a signed-in admin (Authorization: Bearer <access token>).
 * Returns the service client on success, or an error response to return as-is.
 */
export async function requireAdmin(
  request: Request
): Promise<{ supabase: SupabaseClient; error?: never } | { supabase?: never; error: NextResponse }> {
  const supabase = createServiceClient();
  if (!supabase) {
    return { error: NextResponse.json({ error: 'Server configuration error: Missing service role key' }, { status: 500 }) };
  }

  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) {
    return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) };
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    return { error: NextResponse.json({ error: 'Session expired, please sign in again' }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single();

  if (profile?.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Only admins can do this' }, { status: 403 }) };
  }

  return { supabase };
}
