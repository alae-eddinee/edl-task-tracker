import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server-admin';

export async function POST(request: Request) {
  try {
    // Only a signed-in admin may generate a login link for someone else
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;
    const { supabase } = auth;

    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // Find user by email to verify they exist and check role
    const { data: userData, error: userError } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('email', email)
      .single();

    if (userError || !userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Build links on whichever address the admin is using (works for every domain the app is served on)
    const baseUrl = new URL(request.url).origin;

    // Use Supabase's built-in generateLink API to create a magic link
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: email,
      options: {
        redirectTo: `${baseUrl}/auth/confirm`,
      },
    });

    if (linkError || !linkData) {
      console.error('Failed to generate magic link:', linkError);
      return NextResponse.json(
        { error: linkError?.message || 'Failed to generate magic link' },
        { status: 500 }
      );
    }

    // The generated link contains a hash that Supabase will verify
    // We return the properties needed to construct the final URL
    const { hashed_token } = linkData.properties;
    
    // Get role for redirect path
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userData.id)
      .single();

    const role = profile?.role || 'employee';
    const redirectPath = role === 'admin' ? '/admin' : role === 'manager' ? '/manager' : '/employee';

    // Construct the magic link URL that goes to our API first
    const magicLink = `${baseUrl}/auth/confirm?token=${hashed_token}&type=magiclink&next=${redirectPath}`;

    return NextResponse.json({ magicLink });
  } catch (error: any) {
    console.error('Error generating magic link:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
