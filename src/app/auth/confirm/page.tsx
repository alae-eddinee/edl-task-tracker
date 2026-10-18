'use client';

import { Suspense } from 'react';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Card } from '@/components/ui';

function AuthConfirmContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState('');
  const [errorDetails, setErrorDetails] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = searchParams.get('token');
    const type = searchParams.get('type');
    const next = searchParams.get('next') || '/manager';

    // Log diagnostics
    console.log('[AuthConfirm] Params:', { token: token?.slice(0, 10) + '...', type, next });
    console.log('[AuthConfirm] UserAgent:', navigator.userAgent);
    console.log('[AuthConfirm] Cookies enabled:', navigator.cookieEnabled);

    if (!token || type !== 'magiclink') {
      setError('Invalid or missing confirmation token');
      setErrorDetails(`URL: ${window.location.href}\nToken: ${token ? 'present' : 'missing'}\nType: ${type || 'missing'}`);
      setLoading(false);
      return;
    }

    const verifyMagicLink = async () => {
      try {
        const { data, error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: token,
          type: 'magiclink',
        });

        if (verifyError) {
          console.error('Magic link verification failed:', verifyError);
          setError('This magic link has expired or is invalid. Please request a new one.');
          setErrorDetails(`Error: ${verifyError.message}\nCode: ${verifyError.code || 'N/A'}\n\nThis usually means:\n- Link expired (valid for 1 hour)\n- Link already used\n- Network/firewall blocking the request`);
          setLoading(false);
          return;
        }

        console.log('[AuthConfirm] Magic link verified, session:', data?.session?.user?.id);
        
        // Explicitly persist the session to prevent flickering/redirect issues
        if (data?.session) {
          console.log('[AuthConfirm] Persisting session...');
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          });
          
          if (sessionError) {
            console.error('[AuthConfirm] Session persistence failed:', sessionError);
          } else {
            console.log('[AuthConfirm] Session persisted successfully');
          }
        }
        
        // Small delay to ensure session is saved before redirect
        setTimeout(() => {
          console.log('[AuthConfirm] Redirecting to:', next);
          router.push(next);
        }, 100);
      } catch (err: any) {
        console.error('Error verifying magic link:', err);
        setError('An error occurred while logging in.');
        setErrorDetails(`Exception: ${err?.message || String(err)}\n\nThis indicates:\n- Network connectivity issue\n- Browser blocking the request\n- JavaScript error on this device\n\nTry: Different browser, disable extensions, or check internet connection.`);
        setLoading(false);
      }
    };

    verifyMagicLink();
  }, [searchParams, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center p-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--primary)] mx-auto mb-4" />
          <p className="text-[var(--foreground-secondary)]">Logging you in...</p>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center p-8">
          <p className="text-[var(--danger)] mb-4 font-medium">{error}</p>
          {errorDetails && (
            <details className="mb-4 text-left">
              <summary className="text-xs text-[var(--foreground-tertiary)] cursor-pointer hover:text-[var(--foreground-secondary)]">
                Show technical details
              </summary>
              <pre className="mt-2 text-[10px] text-[var(--foreground-tertiary)] bg-[var(--background-tertiary)] p-2 rounded whitespace-pre-wrap break-all">
                {errorDetails}
              </pre>
            </details>
          )}
          <div className="space-y-2">
            <button
              onClick={() => router.push('/login')}
              className="text-[var(--primary)] hover:underline block w-full"
            >
              Go to login page
            </button>
            <button
              onClick={() => {
                const help = `TROUBLESHOOTING MAGIC LINK ISSUES:

1. Check the link hasn't expired (valid for 1 hour)
2. Ensure you're not using a VPN or corporate firewall
3. Try opening the link in a different browser
4. Disable browser extensions temporarily
5. Check if cookies are enabled in Edge:
   - edge://settings/cookies
   - Ensure "Block third-party cookies" is OFF
6. Try mobile hotspot instead of current WiFi

If none work, the device likely has:
- Antivirus blocking the connection
- Corporate security software
- Network-level blocking of Supabase`;
                alert(help);
              }}
              className="text-xs text-[var(--foreground-tertiary)] hover:text-[var(--primary)] underline"
            >
              Troubleshooting tips
            </button>
          </div>
        </Card>
      </div>
    );
  }

  return null;
}

export default function AuthConfirmPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center p-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--primary)] mx-auto mb-4" />
          <p className="text-[var(--foreground-secondary)]">Loading...</p>
        </Card>
      </div>
    }>
      <AuthConfirmContent />
    </Suspense>
  );
}
