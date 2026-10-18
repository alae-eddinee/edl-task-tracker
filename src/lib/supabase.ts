import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Get remember me preference for session duration
const getSessionExpiry = () => {
  if (typeof window === 'undefined') return undefined;
  const rememberMe = localStorage.getItem('rememberMe');
  // If remember me is enabled (default), session never expires
  // If disabled, use 1 day
  if (rememberMe === 'false') {
    return 24 * 60 * 60; // 1 day
  }
  // Essentially never expire (10 years)
  return 10 * 365 * 24 * 60 * 60;
};

// Singleton instance for general use (backwards compat)
// Realtime disabled to prevent hanging with multiple tabs/accounts
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    timeout: 20000,
  },
  cookieOptions: {
    maxAge: getSessionExpiry(),
    sameSite: 'none',
    secure: true,
  },
});

// Factory to create fresh clients when the singleton gets stuck
// These also have realtime disabled to prevent update hangs
export function createFreshClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey, {
    realtime: {
      timeout: 20000,
    },
    cookieOptions: {
      maxAge: getSessionExpiry(),
      sameSite: 'none',
      secure: true,
    },
  });
}
