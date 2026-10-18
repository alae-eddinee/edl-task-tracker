'use client';

import { useTaskNotifications } from '@/hooks/useTaskNotifications';

interface BlueDotIndicatorProps {
  taskId: string;
  className?: string;
}

export function BlueDotIndicator({ taskId, className = '' }: BlueDotIndicatorProps) {
  const { unreadTaskIds, markTaskAsRead } = useTaskNotifications();
  const hasUnread = unreadTaskIds.has(taskId);

  if (!hasUnread) return null;

  return (
    <span
      className={`absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full border-2 border-white dark:border-gray-800 shadow-sm animate-pulse ${className}`}
      title="Task has updates"
    />
  );
}

export function BlueDotBadge({ taskId, onClick }: { taskId: string; onClick?: () => void }) {
  const { unreadTaskIds, markTaskAsRead, getNotificationForTask } = useTaskNotifications();
  const hasUnread = unreadTaskIds.has(taskId);
  const notification = getNotificationForTask(taskId);

  if (!hasUnread || !notification) return null;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    markTaskAsRead(taskId);
    onClick?.();
  };

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-medium hover:bg-blue-500/20 transition-colors group"
    >
      <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
      <span>New</span>
      <span className="hidden group-hover:inline">• Click to view</span>
    </button>
  );
}
