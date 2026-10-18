'use client';

import { useState } from 'react';
import { formatDistance } from 'date-fns';
import { now } from '@/lib/time';
import {
  Bell,
  CheckCheck,
  CheckCircle2,
  MailOpen,
  Mail,
  MessageSquare,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { Card } from '@/components/ui';
import type { Notification, NotificationType } from '@/types';

const typeStyles: Record<NotificationType, { icon: typeof Bell; color: string; label: string }> = {
  task_assigned: { icon: Plus, color: 'bg-[var(--info)]', label: 'New task' },
  task_added: { icon: Plus, color: 'bg-[var(--primary)]', label: 'Self-added task' },
  task_updated: { icon: RefreshCw, color: 'bg-[var(--warning)]', label: 'Task updated' },
  status_updated: { icon: RefreshCw, color: 'bg-[var(--info)]', label: 'Status changed' },
  task_completed: { icon: CheckCircle2, color: 'bg-[var(--success)]', label: 'Completed' },
  task_deleted: { icon: Trash2, color: 'bg-[var(--danger)]', label: 'Task deleted' },
  comment_added: { icon: MessageSquare, color: 'bg-[var(--primary)]', label: 'New comment' },
  comment_deleted: { icon: MessageSquare, color: 'bg-[var(--foreground-muted)]', label: 'Comment deleted' },
};

// Clamp to "just now" so a device clock running behind never shows "in 1 hour"
function timeAgo(date: string) {
  const d = new Date(date);
  const current = now();
  return current.getTime() - d.getTime() < 60_000 ? 'just now' : formatDistance(d, current, { addSuffix: true });
}

interface NotificationInboxProps {
  notifications: Notification[];
  loading?: boolean;
  onOpen: (notification: Notification) => void;
  onMarkRead: (id: string) => void;
  onMarkUnread: (id: string) => void;
  onMarkAllRead: () => void;
}

export function NotificationInbox({
  notifications,
  loading,
  onOpen,
  onMarkRead,
  onMarkUnread,
  onMarkAllRead,
}: NotificationInboxProps) {
  const [tab, setTab] = useState<'unread' | 'read'>('unread');

  const unread = notifications.filter((n) => !n.read);
  const read = notifications.filter((n) => n.read);
  const visible = tab === 'unread' ? unread : read;

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-3 border-b border-[var(--border)] bg-[var(--background-tertiary)]">
        <div className="flex gap-1">
          {(['unread', 'read'] as const).map((t) => {
            const count = t === 'unread' ? unread.length : read.length;
            const active = tab === t;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  active
                    ? 'bg-white text-[var(--foreground)] shadow-sm'
                    : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
                }`}
              >
                {t === 'unread' ? 'Unread' : 'Read'}
                <span
                  className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${
                    t === 'unread' && count > 0
                      ? 'bg-[var(--danger)] text-white'
                      : 'bg-[var(--border)] text-[var(--foreground-secondary)]'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        {tab === 'unread' && unread.length > 0 && (
          <button
            onClick={onMarkAllRead}
            className="flex items-center gap-1 text-xs sm:text-sm font-medium text-[var(--primary)] hover:underline"
          >
            <CheckCheck className="w-4 h-4" />
            Mark all as read
          </button>
        )}
      </div>

      {loading && notifications.length === 0 ? (
        <div className="flex justify-center py-10">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--primary)]" />
        </div>
      ) : visible.length === 0 ? (
        <div className="px-4 py-12 text-center">
          <Bell className="w-8 h-8 mx-auto mb-2 text-[var(--foreground-muted)]" />
          <p className="text-sm text-[var(--foreground-tertiary)]">
            {tab === 'unread' ? "You're all caught up." : 'No read notifications yet.'}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border)] max-h-[560px] overflow-y-auto">
          {visible.map((n) => {
            const style = typeStyles[n.type] ?? typeStyles.task_updated;
            const Icon = style.icon;
            return (
              <li
                key={n.id}
                onClick={() => onOpen(n)}
                className={`group flex items-start gap-3 px-3 sm:px-4 py-3 cursor-pointer transition-colors hover:bg-[var(--background-secondary)] ${
                  n.read ? '' : 'bg-[var(--background-accent)]'
                }`}
              >
                <div className={`shrink-0 w-9 h-9 rounded-lg ${style.color} flex items-center justify-center`}>
                  <Icon className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {!n.read && <span className="w-2 h-2 rounded-full bg-[var(--primary)] shrink-0" />}
                    <p className={`text-sm truncate ${n.read ? 'text-[var(--foreground-secondary)]' : 'font-semibold text-[var(--foreground)]'}`}>
                      {n.title}
                    </p>
                  </div>
                  <p className="text-sm text-[var(--foreground-secondary)] break-words">{n.message}</p>
                  <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
                    {style.label} · {timeAgo(n.created_at)}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (n.read) onMarkUnread(n.id);
                    else onMarkRead(n.id);
                  }}
                  title={n.read ? 'Mark as unread' : 'Mark as read'}
                  className="shrink-0 p-1.5 rounded-md text-[var(--foreground-tertiary)] hover:bg-[var(--background-tertiary)] hover:text-[var(--foreground)] sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                >
                  {n.read ? <Mail className="w-4 h-4" /> : <MailOpen className="w-4 h-4" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
