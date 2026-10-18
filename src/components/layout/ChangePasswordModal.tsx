'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button, Input, Modal } from '@/components/ui';
import { getAuthToken } from '@/lib/api-client';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  email: string;
}

export function ChangePasswordModal({ isOpen, onClose, email }: ChangePasswordModalProps) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const close = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
    setError('');
    setDone(false);
    setShow(false);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (next.length < 6) return setError('The new password must be at least 6 characters.');
    if (next !== confirm) return setError('The new passwords don’t match.');
    if (next === current) return setError('The new password must be different from the current one.');

    setLoading(true);
    try {
      // The server checks the current password, sets the new one and keeps the admin's record in sync
      const res = await fetch('/api/account/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAuthToken()}` },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || 'Could not change your password. Please try again.');
        return;
      }
      setDone(true);
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const toggle = (
    <button
      type="button"
      onClick={() => setShow((s) => !s)}
      className="flex items-center gap-1 text-xs text-[var(--foreground-tertiary)] hover:text-[var(--foreground)]"
    >
      {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
      {show ? 'Hide passwords' : 'Show passwords'}
    </button>
  );

  return (
    <Modal isOpen={isOpen} onClose={close} title="Change password" size="sm">
      {done ? (
        <div className="space-y-4">
          <p className="text-sm text-[var(--foreground-secondary)]">
            Your password has been changed. Use the new one next time you sign in.
          </p>
          <div className="flex justify-end">
            <Button onClick={close}>Done</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-xs text-[var(--foreground-tertiary)]">Signed in as {email}</p>
          <Input
            label="Current password"
            type={show ? 'text' : 'password'}
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
            autoFocus
          />
          <Input
            label="New password"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
          />
          <Input
            label="Confirm new password"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
          {toggle}
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" loading={loading}>
              Change password
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
