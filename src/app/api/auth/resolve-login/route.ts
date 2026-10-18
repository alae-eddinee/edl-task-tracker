import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/server-admin';

// Lowercase and strip accents so "eddine" matches "Eddine" and "hamza" matches "Hamzà"
const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/**
 * Lets people sign in with their first name (or full name) instead of their email.
 * Returns the matching account's email; the password is still checked by Supabase Auth.
 */
export async function POST(request: Request) {
  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const { identifier } = await request.json().catch(() => ({ identifier: '' }));
  const query = normalize(String(identifier || ''));
  if (!query) {
    return NextResponse.json({ error: 'Enter your email or first name' }, { status: 400 });
  }

  const { data: profiles, error } = await supabase.from('profiles').select('email, full_name');
  if (error) {
    return NextResponse.json({ error: 'Could not look up your account, please use your email' }, { status: 500 });
  }

  const people = (profiles ?? []).map((p) => {
    const name = normalize(p.full_name || '');
    const parts = name.split(/\s+/);
    return { email: p.email as string, name, first: parts[0], last: parts.length > 1 ? parts[parts.length - 1] : '' };
  });
  // Exact full-name match wins; otherwise accept a unique first OR last name
  let matches = people.filter((p) => p.name === query);
  if (matches.length === 0) matches = people.filter((p) => p.first === query || p.last === query);

  if (matches.length === 1) {
    return NextResponse.json({ email: matches[0].email });
  }
  if (matches.length > 1) {
    return NextResponse.json(
      { error: 'Several people share that name. Please sign in with your full name or work email.' },
      { status: 409 }
    );
  }
  return NextResponse.json({ error: 'No account found with that name. Try your work email.' }, { status: 404 });
}
