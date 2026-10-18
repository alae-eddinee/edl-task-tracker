'use client';

import { getAuthToken } from '@/lib/api-client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Select } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks';
import type { Profile } from '@/types';
import { ArrowLeft, Link2 } from 'lucide-react';

export default function MagicLinkGenerator() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [magicLink, setMagicLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const router = useRouter();
  const { profile } = useAuth();

  useEffect(() => {
    if (!profile) return;
    
    const fetchUsers = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('full_name', { ascending: true });
      
      if (!error && data) {
        setUsers(data as Profile[]);
      }
      setFetchLoading(false);
    };
    
    fetchUsers();
  }, [profile]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) return;
    
    setLoading(true);
    setError('');
    setMagicLink('');
    setCopied(false);

    const selectedUser = users.find(u => u.id === selectedUserId);
    if (!selectedUser) {
      setError('User not found');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/admin/generate-magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAuthToken()}` },
        body: JSON.stringify({ email: selectedUser.email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate magic link');
      }

      setMagicLink(data.magicLink);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(magicLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const userOptions = users.map(user => ({
    value: user.id,
    label: `${user.full_name} (${user.email}) - ${user.role}`,
  }));

  if (fetchLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--primary)]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8 bg-[var(--background-secondary)]">
      <Card className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" onClick={() => router.push('/admin')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Magic Link Generator</h1>
            <p className="text-[var(--foreground-secondary)]">
              Generate direct login links for any user
            </p>
          </div>
        </div>

        <form onSubmit={handleGenerate} className="space-y-4">
          <Select
            label="Select User"
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            options={[
              { value: '', label: 'Choose a user...' },
              ...userOptions,
            ]}
            required
          />

          {error && (
            <p className="text-sm text-[var(--danger)]">{error}</p>
          )}

          <Button 
            type="submit" 
            className="w-full" 
            loading={loading}
            disabled={!selectedUserId}
          >
            <Link2 className="w-4 h-4 mr-2" />
            Generate Magic Link
          </Button>
        </form>

        {magicLink && (
          <div className="mt-6 p-4 bg-[var(--background-secondary)] rounded-lg">
            <p className="text-sm font-medium mb-2">Magic Link (valid for 7 days):</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={magicLink}
                readOnly
                className="flex-1 p-2 text-sm bg-white dark:bg-gray-800 border border-[var(--border)] rounded"
              />
              <Button onClick={copyToClipboard} variant="secondary">
                {copied ? 'Copied!' : 'Copy'}
              </Button>
            </div>
            <p className="text-xs text-[var(--foreground-tertiary)] mt-2">
              Share this link with the user. They can use it once to log in directly without a password.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
