'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { apiGetNotifications, apiSetNotificationsRead } from '@/lib/api-client';
import type { Notification, NotificationType } from '@/types';
import type { TaskNotification, TaskNotificationType } from './useTaskNotifications';

// Map stored notification types onto the toast styles
const toastType: Record<NotificationType, TaskNotificationType> = {
  task_assigned: 'task_created',
  task_added: 'task_created',
  task_updated: 'task_updated',
  task_deleted: 'task_updated',
  status_updated: 'status_changed',
  task_completed: 'status_changed',
  comment_added: 'comment_added',
  comment_deleted: 'comment_deleted',
};

export function notificationToToast(n: Notification): Omit<TaskNotification, 'id' | 'timestamp'> {
  return {
    taskId: n.task_id || n.id,
    taskTitle: n.title,
    type: toastType[n.type] ?? 'task_updated',
    message: n.message,
    read: false,
  };
}

// Notifications are written server-side by database triggers, so this hook only
// reads them: an initial fetch, realtime INSERTs, and a refetch when the tab regains focus.
export function useNotifications(
  userId: string | undefined,
  onNewNotification?: (notification: Notification) => void
) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const onNewRef = useRef(onNewNotification);
  const notificationsRef = useRef<Notification[]>([]);
  const knownIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    onNewRef.current = onNewNotification;
    notificationsRef.current = notifications;
  });

  const fetchNotifications = useCallback(async () => {
    if (!userId) return;
    try {
      const data = (await apiGetNotifications(userId)) as Notification[];
      data.forEach((n) => knownIdsRef.current.add(n.id));
      setNotifications(data);
    } catch (err) {
      console.error('[useNotifications] Fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Catch anything realtime missed (sleeping laptop, dropped socket, ...)
  useEffect(() => {
    const handleVisible = () => {
      if (document.visibilityState === 'visible') fetchNotifications();
    };
    document.addEventListener('visibilitychange', handleVisible);
    window.addEventListener('focus', handleVisible);
    return () => {
      document.removeEventListener('visibilitychange', handleVisible);
      window.removeEventListener('focus', handleVisible);
    };
  }, [fetchNotifications]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const newNotification = payload.new as Notification;
          if (knownIdsRef.current.has(newNotification.id)) return;
          knownIdsRef.current.add(newNotification.id);
          setNotifications((prev) => [newNotification, ...prev]);
          onNewRef.current?.(newNotification);
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [userId]);

  const setRead = useCallback(async (ids: string[] | undefined, read: boolean) => {
    if (!userId) return;
    const matches = (n: Notification) => (ids ? ids.includes(n.id) : !n.read);
    const previous = notificationsRef.current;
    setNotifications((prev) => prev.map((n) => (matches(n) ? { ...n, read } : n)));
    try {
      await apiSetNotificationsRead(userId, read, ids);
    } catch (err) {
      console.error('[useNotifications] Update failed:', err);
      setNotifications(previous);
    }
  }, [userId]);

  const markAsRead = useCallback((id: string) => setRead([id], true), [setRead]);
  const markAsUnread = useCallback((id: string) => setRead([id], false), [setRead]);
  const markAllAsRead = useCallback(() => setRead(undefined, true), [setRead]);

  const markTaskAsRead = useCallback((taskId: string) => {
    const ids = notificationsRef.current.filter((n) => n.task_id === taskId && !n.read).map((n) => n.id);
    if (ids.length > 0) setRead(ids, true);
  }, [setRead]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAsUnread,
    markAllAsRead,
    markTaskAsRead,
    refetch: fetchNotifications,
  };
}
