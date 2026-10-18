'use client';

import Image from 'next/image';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Card } from '@/components/ui';
import { useAuth } from '@/hooks';
import { Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [errorDetails, setErrorDetails] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, profile, loading: authLoading, user } = useAuth();
  const router = useRouter();
  const loginAttempted = useRef(false);
  const profileCheckAttempts = useRef(0);
  // The 5s safety timer must see the *current* user, not the one captured when Login was clicked
  const userRef = useRef(user);
  const sessionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    userRef.current = user;
    if (user && sessionTimeoutRef.current) {
      clearTimeout(sessionTimeoutRef.current);
      sessionTimeoutRef.current = null;
    }
  }, [user]);

  useEffect(() => () => {
    if (sessionTimeoutRef.current) clearTimeout(sessionTimeoutRef.current);
  }, []);

  // Redirect when profile is loaded after login
  useEffect(() => {
    if (!authLoading) {
      if (profile) {
        // Profile loaded successfully - redirect
        profileCheckAttempts.current = 0;
        if (profile.role === 'admin') {
          router.push('/admin');
        } else if (profile.role === 'manager') {
          router.push('/manager');
        } else {
          router.push('/employee');
        }
      } else if (loginAttempted.current && user) {
        // User is logged in but profile is not loaded yet
        // Give it more time (retry up to 10 times over ~5 seconds)
        if (profileCheckAttempts.current < 10) {
          profileCheckAttempts.current++;
          const timer = setTimeout(() => {
            // Force re-check by toggling loading state
            setLoading(true);
            setTimeout(() => setLoading(false), 50);
          }, 500);
          return () => clearTimeout(timer);
        } else {
          // Profile fetch failed after multiple attempts
          setError('Profile not found. Please contact an administrator.');
          setLoading(false);
          loginAttempted.current = false;
          profileCheckAttempts.current = 0;
        }
      } else if (loginAttempted.current && !user) {
        // No user session - actual login failure
        setError('Login failed. Please check your credentials and try again.');
        setLoading(false);
        loginAttempted.current = false;
      }
    }
  }, [profile, authLoading, router, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setErrorDetails('');
    setLoading(true);
    loginAttempted.current = true;

    // Diagnostic info
    const diagnostics = {
      url: window.location.href,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      localStorage: typeof window !== 'undefined' ? Object.keys(localStorage) : [],
      cookies: document.cookie ? 'present' : 'none',
    };
    console.log('[Login] Diagnostics:', diagnostics);

    try {
      const { error } = await signIn(email, password, rememberMe);

      if (error) {
        console.error('[Login] SignIn returned error:', error.message);
        setError(error.message || 'Login failed. Please check your credentials.');
        setErrorDetails(`Error: ${error.message}\nTime: ${new Date().toLocaleString()}\nBrowser: ${navigator.userAgent.slice(0, 50)}...`);
        setLoading(false);
        return;
      }

      // Wait for profile to load - the useEffect will handle redirect
      console.log('[Login] SignIn successful, waiting for auth state...');
      
      // Add a safety timeout - if auth state doesn't update in 5 seconds, show error
      if (sessionTimeoutRef.current) clearTimeout(sessionTimeoutRef.current);
      sessionTimeoutRef.current = setTimeout(() => {
        sessionTimeoutRef.current = null;
        if (loginAttempted.current && !userRef.current) {
          console.error('[Login] Auth state timeout - no user after 5s');
          setError('Login timed out. Session not established.');
          setErrorDetails('The server accepted your credentials but could not establish a session.\n\nPossible causes:\n- Browser extensions blocking cookies\n- Corporate firewall blocking auth\n- Clock/time sync issues on device\n\nTry: Clear browser data or use a different browser.');
          setLoading(false);
          loginAttempted.current = false;
        }
      }, 5000);
      
    } catch (err) {
      console.error('[Login] Exception during signIn:', err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError('An unexpected error occurred. Please try again.');
      setErrorDetails(`Exception: ${errorMsg}\n\nThis may indicate:\n- Network connectivity issues\n- Browser blocking requests\n- JavaScript errors\n\nTry: Check internet connection, disable ad blockers, or use incognito mode.`);
      setLoading(false);
      loginAttempted.current = false;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Quiet ledger-paper grid */}
      <div
        className="absolute inset-0 opacity-[0.55]"
        style={{
          backgroundImage:
            'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
          maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
        }}
      />

      <Card className="w-full max-w-md relative z-10">
        <div className="text-center mb-6">
          <Image
            src="/brand/logo-mark.svg"
            alt=""
            width={56}
            height={56}
            priority
            className="mx-auto mb-5 w-14 h-14"
          />
          <h1 className="text-xl font-semibold text-[var(--foreground)]">
            EDL &amp; Task Tracker
          </h1>
          <p className="text-[var(--foreground-secondary)] mt-2">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Email or name"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="Work email or your name"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <div className="relative">
            <Input
              label="Password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-[34px] text-[var(--foreground-tertiary)] hover:text-[var(--foreground-secondary)] transition-colors"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-4 h-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]"
            />
            <span className="text-sm text-[var(--foreground-secondary)]">Remember me on this device</span>
          </label>

          {error && (
            <div className="space-y-2">
              <p className="text-sm text-[var(--danger)] text-center font-medium">{error}</p>
              {errorDetails && (
                <details className="text-xs text-[var(--foreground-tertiary)] bg-[var(--background-tertiary)] rounded p-2">
                  <summary className="cursor-pointer hover:text-[var(--foreground-secondary)]">
                    Show technical details
                  </summary>
                  <pre className="mt-2 whitespace-pre-wrap break-all text-[10px] font-mono">
                    {errorDetails}
                  </pre>
                </details>
              )}
              <div className="flex gap-2 justify-center">
                <button
                  type="button"
                  onClick={() => {
                    localStorage.clear();
                    sessionStorage.clear();
                    document.cookie.split(';').forEach(cookie => {
                      const [name] = cookie.split('=');
                      document.cookie = `${name.trim()}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
                    });
                    setError('Browser data cleared. Please try logging in again.');
                    setErrorDetails('');
                    window.location.reload();
                  }}
                  className="text-xs text-[var(--foreground-tertiary)] hover:text-[var(--danger)] underline"
                >
                  Clear browser data
                </button>
                <span className="text-[var(--foreground-tertiary)]">|</span>
                <button
                  type="button"
                  onClick={() => {
                    const helpText = `TROUBLESHOOTING STEPS:

1. Check CAPS LOCK - Password is case-sensitive
2. Try typing password in "Show password" field to verify
3. Use Incognito/Private mode (Ctrl+Shift+N)
4. Try different browser (Chrome, Firefox, Edge)
5. Disable browser extensions (ad blockers, privacy tools)
6. Check system clock is correct (right-click clock > Adjust date/time)
7. Try different network (mobile hotspot)

If none work, contact admin with:
- Screenshot of error
- Browser name and version
- Device type (Windows/Mac/Phone)`;
                    alert(helpText);
                  }}
                  className="text-xs text-[var(--foreground-tertiary)] hover:text-[var(--primary)] underline"
                >
                  Troubleshooting tips
                </button>
              </div>
            </div>
          )}

          <Button type="submit" className="w-full" loading={loading}>
            Login
          </Button>
        </form>
      </Card>
    </div>
  );
}
