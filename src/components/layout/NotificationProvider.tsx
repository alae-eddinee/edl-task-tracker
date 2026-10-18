'use client';

import { TaskNotificationProvider, useTaskNotifications } from '@/hooks/useTaskNotifications';
import { TaskToastNotifications } from '@/components/ui/TaskToastNotifications';
import { useCallback } from 'react';

interface NotificationWrapperProps {
  children: React.ReactNode;
  onTaskClick?: (taskId: string) => void;
}

function NotificationInner({ children, onTaskClick }: NotificationWrapperProps) {
  const handleNotificationClick = useCallback((taskId: string) => {
    onTaskClick?.(taskId);
  }, [onTaskClick]);

  return (
    <>
      <TaskToastNotifications onNotificationClick={handleNotificationClick} />
      {children}
    </>
  );
}

export function NotificationProvider({ children, onTaskClick }: NotificationWrapperProps) {
  return (
    <TaskNotificationProvider>
      <NotificationInner onTaskClick={onTaskClick}>
        {children}
      </NotificationInner>
    </TaskNotificationProvider>
  );
}
