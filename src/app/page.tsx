'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks';

export default function Home() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!profile) {
        router.push('/login');
      } else if (profile.role === 'admin') {
        router.push('/admin');
      } else if (profile.role === 'manager') {
        router.push('/manager');
      } else {
        router.push('/employee');
      }
    }
  }, [profile, loading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background-secondary)]">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--primary)] mx-auto mb-4" />
        <p className="text-[var(--foreground-secondary)]">Loading...</p>
      </div>
    </div>
  );
}
