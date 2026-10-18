'use client';

// Transient toast queue. The persistent record lives in the `notifications` table (see useNotifications).
import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

export type TaskNotificationType = 'task_created' | 'task_updated' | 'comment_added' | 'comment_deleted' | 'status_changed';

export interface TaskNotification {
  id: string;
  taskId: string;
  taskTitle: string;
  type: TaskNotificationType;
  message: string;
  timestamp: number;
  read: boolean;
  triggeredBy?: string;
}

interface TaskNotificationContextType {
  notifications: TaskNotification[];
  unreadTaskIds: Set<string>;
  addNotification: (notification: Omit<TaskNotification, 'id' | 'timestamp'>) => void;
  markTaskAsRead: (taskId: string) => void;
  markAllAsRead: () => void;
  getNotificationForTask: (taskId: string) => TaskNotification | undefined;
  clearNotification: (notificationId: string) => void;
  notificationQueue: TaskNotification[];
}

const TaskNotificationContext = createContext<TaskNotificationContextType | undefined>(undefined);

export function TaskNotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<TaskNotification[]>([]);
  const [notificationQueue, setNotificationQueue] = useState<TaskNotification[]>([]);
  const [unreadTaskIds, setUnreadTaskIds] = useState<Set<string>>(new Set());
  const maxVisibleNotifications = 3;
  
  // Use a ref to track IDs being added to prevent duplicates during rapid calls
  const pendingIdsRef = useRef<Set<string>>(new Set());

  const clearNotification = useCallback((notificationId: string) => {
    setNotifications((prev) => {
      const notification = prev.find(n => n.id === notificationId);
      if (notification) {
        // Also remove from unread if this was the last notification for this task
        const remainingForTask = prev.filter(n => n.taskId === notification.taskId && n.id !== notificationId && !n.read);
        if (remainingForTask.length === 0) {
          setUnreadTaskIds((prevUnread) => {
            const next = new Set(prevUnread);
            next.delete(notification.taskId);
            return next;
          });
        }
      }
      const filtered = prev.filter((n) => n.id !== notificationId);
      
      // Check queue for next notification to show
      setNotificationQueue((queue) => {
        if (queue.length > 0 && filtered.length < maxVisibleNotifications) {
          const [nextNotification, ...restQueue] = queue;
          // Add the next notification from queue to visible notifications
          setTimeout(() => {
            setNotifications((current) => [...current, nextNotification]);
          }, 100);
          return restQueue;
        }
        return queue;
      });
      
      return filtered;
    });
  }, []);

  const addNotification = useCallback((notification: Omit<TaskNotification, 'id' | 'timestamp'>) => {
    // Generate a truly unique ID
    const id = typeof crypto !== 'undefined' && crypto.randomUUID 
      ? crypto.randomUUID() 
      : `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${Math.random().toString(36).substr(2, 9)}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Check if this ID is already pending (being added)
    if (pendingIdsRef.current.has(id)) {
      console.log('[Notification] Duplicate ID detected, skipping:', id);
      return;
    }
    
    // Mark this ID as pending
    pendingIdsRef.current.add(id);
    
    const newNotification: TaskNotification = {
      ...notification,
      id,
      timestamp: Date.now(),
    };

    setNotifications((prev) => {
      // Check if a notification with this ID already exists
      if (prev.some(n => n.id === newNotification.id)) {
        pendingIdsRef.current.delete(id);
        return prev;
      }
      // If we're at max capacity, add to queue instead
      if (prev.length >= maxVisibleNotifications) {
        setNotificationQueue((queue) => {
          if (queue.some(n => n.id === newNotification.id)) {
            pendingIdsRef.current.delete(id);
            return queue;
          }
          return [...queue, newNotification].slice(0, 20);
        });
        pendingIdsRef.current.delete(id);
        return prev;
      }
      // Otherwise add to visible notifications
      pendingIdsRef.current.delete(id);
      return [newNotification, ...prev].slice(0, maxVisibleNotifications);
    });

    setUnreadTaskIds((prev) => {
      const next = new Set(prev);
      next.add(notification.taskId);
      return next;
    });
  }, []);

  const markTaskAsRead = useCallback((taskId: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.taskId === taskId ? { ...n, read: true } : n))
    );
    setUnreadTaskIds((prev) => {
      const next = new Set(prev);
      next.delete(taskId);
      return next;
    });
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadTaskIds(new Set());
  }, []);

  const getNotificationForTask = useCallback(
    (taskId: string) => {
      return notifications.find((n) => n.taskId === taskId && !n.read);
    },
    [notifications]
  );

  return (
    <TaskNotificationContext.Provider
      value={{
        notifications,
        unreadTaskIds,
        addNotification,
        markTaskAsRead,
        markAllAsRead,
        getNotificationForTask,
        clearNotification,
        notificationQueue,
      }}
    >
      {children}
    </TaskNotificationContext.Provider>
  );
}

export function useTaskNotifications() {
  const context = useContext(TaskNotificationContext);
  if (context === undefined) {
    throw new Error('useTaskNotifications must be used within a TaskNotificationProvider');
  }
  return context;
}
