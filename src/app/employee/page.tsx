'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth, useTaskNotifications, useNotifications, notificationToToast } from '@/hooks';
import { Header, StatsCard, NotificationInbox, RecurringTasks } from '@/components/layout';
import { Button, Card, Modal, Textarea, Input, DatePicker, StatusSelect } from '@/components/ui';
import { TaskNotificationProvider } from '@/hooks/useTaskNotifications';
import { TaskToastNotifications } from '@/components/ui/TaskToastNotifications';
import type { Task, TaskStatus, TaskPriority, Comment, Notification, RecurrencePattern } from '@/types';
import { RecurringTaskSelector } from '@/components/ui/RecurringTaskSelector';
import { apiGetTasks, apiUpdateTask, apiGetComments, apiCreateComment, apiDeleteComment, apiCreateTask, apiDeleteTask } from '@/lib/api-client';
import {
  ClipboardList,
  Clock,
  CheckCircle,
  AlertTriangle,
  Play,
  Trash2,
  Repeat,
  Plus,
  Bell,
} from 'lucide-react';
import { format, isSameDay, startOfDay, differenceInDays } from 'date-fns';
import { gmt, now } from '@/lib/time';
import { calculateNextOccurrence } from '@/lib/recurring-tasks';

const statusOptions: { value: TaskStatus; label: string; icon: React.ReactNode }[] = [
  { value: 'todo', label: 'To Do', icon: <Clock className="w-4 h-4" /> },
  { value: 'in_progress', label: 'In Progress', icon: <Play className="w-4 h-4" /> },
  { value: 'done', label: 'Done', icon: <CheckCircle className="w-4 h-4" /> },
];

const emptyNewTask = {
  title: '',
  description: '',
  due_date: '',
  priority: 'normal' as TaskPriority,
  isRecurring: false,
  recurrencePattern: 'daily' as RecurrencePattern,
  recurrenceStartDate: '',
  recurrenceEndDate: undefined as string | undefined,
  recurrenceDayOfWeek: undefined as number | undefined,
};

export default function EmployeeDashboard() {
  return (
    <TaskNotificationProvider>
      <EmployeeDashboardInner />
    </TaskNotificationProvider>
  );
}

function EmployeeDashboardInner() {
  const { profile, loading: authLoading } = useAuth();
  const { addNotification, markTaskAsRead } = useTaskNotifications();
  const inbox = useNotifications(profile?.id, (n) => {
    addNotification(notificationToToast(n));
    // A notification means the task changed. Refetch here too: the tasks channel can miss
    // events while it resubscribes (e.g. right after the profile reloads).
    fetchTasks(true);
    if (n.task_id && n.task_id === selectedTask?.id) fetchComments(n.task_id);
  });
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'tasks' | 'recurring' | 'inbox'>('tasks');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTask, setNewTask] = useState(emptyNewTask);
  const [createLoading, setCreateLoading] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [mutatingTaskIds, setMutatingTaskIds] = useState<Set<string>>(new Set());
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const debounce = useCallback((fn: () => void, delayMs: number) => {
    let timeoutId: number | undefined;
    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(fn, delayMs);
    };
  }, []);

  const setTaskMutating = useCallback((taskId: string, isMutating: boolean) => {
    setMutatingTaskIds((prev) => {
      const next = new Set(prev);
      if (isMutating) next.add(taskId);
      else next.delete(taskId);
      return next;
    });
  }, []);

  const fetchTasks = useCallback(async (isBackgroundRefresh = false) => {
    if (!profile) return;

    if (!isBackgroundRefresh) {
      setLoading(true);
    }

    // Timeout failsafe - ensure loading always completes
    const timeoutId = setTimeout(() => {
      console.warn('[fetchTasks] Timeout reached, forcing loading to false');
      setLoading(false);
    }, 15000);

    try {
      const data = await apiGetTasks();
      // Filter tasks assigned to current employee
      const myTasks = data.filter((t) => t.assigned_to === profile.id);
      const nextTasks = myTasks.map((t) => ({
        ...t,
        assigned_to_name: t.assigned_to_name?.full_name,
        created_by_name: t.created_by_name?.full_name,
      })) as Task[];

      setTasks(nextTasks);

      // Update selectedTask if it exists in the new tasks list
      setSelectedTask((prevSelected) => {
        if (!prevSelected) return null;
        const nextSelected = nextTasks.find((t) => t.id === prevSelected.id);
        // Only update if task still exists - don't clear if modal is open
        return nextSelected || prevSelected;
      });

      // Roll over recurring tasks that have passed their due date
      await rolloverRecurringTasks(nextTasks);
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
    } finally {
      clearTimeout(timeoutId);
      if (!isBackgroundRefresh) {
        setLoading(false);
      }
    }
  }, [profile]);

  // Roll over recurring tasks - when due date passes, move to next occurrence
  const rolloverRecurringTasks = useCallback(async (currentTasks: Task[]) => {
    try {
      const today = startOfDay(new Date());
      console.log(`[rolloverRecurringTasks] Today: ${today.toISOString()}, Checking ${currentTasks.length} tasks`);

      // Log all recurring tasks for debugging
      const recurringTasks = currentTasks.filter(t => t.is_recurring);
      console.log(`[rolloverRecurringTasks] Found ${recurringTasks.length} recurring tasks total:`);
      recurringTasks.forEach(t => {
        console.log(`  - ${t.title}: due=${t.due_date}, status=${t.status}, is_recurring=${t.is_recurring}, pattern=${t.recurrence_pattern}`);
      });

      // Find recurring parent tasks that are past their due date or have no due date but are done
      const recurringTasksToRollover = currentTasks.filter(
        (t) => t.is_recurring && 
             !t.parent_task_id && 
             t.status === 'done' &&
             // Either has a due date in the past, OR has no due date at all (use start date as base)
             (!t.due_date || startOfDay(new Date(t.due_date)) < today)
      );

      console.log(`[rolloverRecurringTasks] Filtered to ${recurringTasksToRollover.length} tasks to rollover:`);
      recurringTasksToRollover.forEach(t => {
        const dueDate = t.due_date ? startOfDay(new Date(t.due_date)) : null;
        console.log(`  - ${t.title}: due=${t.due_date} (startOfDay: ${dueDate?.toISOString()}), today=${today.toISOString()}, hasDueDate=${!!t.due_date}`);
      });

      if (recurringTasksToRollover.length === 0) {
        console.log('[rolloverRecurringTasks] No tasks to rollover');
        return;
      }

      console.log(`[rolloverRecurringTasks] Found ${recurringTasksToRollover.length} recurring tasks to rollover`);

      for (const task of recurringTasksToRollover) {
        // For tasks with no due_date, use recurrence_start_date or created_at as base
        const baseDate = task.due_date || task.recurrence_start_date || task.created_at;
        
        // Calculate next occurrence from the base date
        const nextDate = calculateNextOccurrence(
          baseDate,
          task.recurrence_pattern || 'daily',
          task.recurrence_day_of_week
        );

        // Check if we've passed the recurrence end date
        if (task.recurrence_end_date && nextDate > new Date(task.recurrence_end_date)) {
          console.log(`[rolloverRecurringTasks] Task ${task.title} has reached its end date, not rolling over`);
          continue;
        }

        console.log(`[rolloverRecurringTasks] Rolling over task: ${task.title} to ${nextDate.toISOString().split('T')[0]} (baseDate was: ${baseDate})`);

        // Update task with new due date, reset status to todo, and update created_at to push to top
        await apiUpdateTask(task.id, {
          due_date: nextDate.toISOString().split('T')[0],
          status: 'todo',
          created_at: new Date().toISOString(),
        });
      }
      
      // Refresh tasks after rollover
      await fetchTasks(true);
    } catch (err) {
      console.error('[rolloverRecurringTasks] Error:', err);
    }
  }, [fetchTasks]);

  useEffect(() => {
    if (!selectedTask) return;
    const nextSelected = tasks.find(t => t.id === selectedTask.id);
    if (nextSelected) setSelectedTask(nextSelected);
  }, [tasks]);

  useEffect(() => {
    if (!authLoading && !profile) {
      router.push('/login');
    } else if (profile && profile.role !== 'employee') {
      const redirectPath = profile.role === 'admin' ? '/admin' : '/manager';
      router.push(redirectPath);
    } else if (profile) {
      fetchTasks();
    }
  }, [profile, authLoading, router, fetchTasks]);

  // Real-time subscription for tasks (notifications themselves are created by DB triggers)
  useEffect(() => {
    if (!profile) return;

    const refresh = debounce(() => fetchTasks(true), 300);

    const channel = supabase
      .channel(`employee-tasks:${profile.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        (payload) => {
          // DELETE payloads may only carry the id, so always refresh on delete
          if (payload.eventType === 'DELETE' || payload.new?.assigned_to === profile.id || (payload.old as Partial<Task>)?.assigned_to === profile.id) {
            refresh();
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [profile, fetchTasks, debounce]);

  // Periodic rollover check - run every minute to catch tasks that need rollover without page refresh
  useEffect(() => {
    if (!profile) return;
    
    const intervalId = setInterval(() => {
      console.log('[Periodic Rollover] Checking for recurring tasks to rollover...');
      rolloverRecurringTasks(tasks);
    }, 60000); // Check every minute
    
    return () => clearInterval(intervalId);
  }, [profile, tasks, rolloverRecurringTasks]);

  const handleStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    const prevTask = tasks.find(t => t.id === taskId);
    if (!prevTask) return;

    setTaskMutating(taskId, true);

    // Optimistic update
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));
    if (selectedTask?.id === taskId) {
      setSelectedTask((prev) => (prev ? { ...prev, status: newStatus } : prev));
    }

    try {
      await apiUpdateTask(taskId, { status: newStatus });

      // Notify manager (best-effort) - DISABLED due to notification timeout issues
      // if (newStatus === 'done') {
      //   supabase.from('notifications').insert({
      //     user_id: prevTask.created_by,
      //     title: 'Task Completed',
      //     message: `Task "${prevTask.title}" has been marked as complete`,
      //     type: 'task_completed',
      //   }).then(({ error: notifError }) => {
      //     if (notifError) console.error('Notification error:', notifError);
      //   });
      // } else {
      //   supabase.from('notifications').insert({
      //     user_id: prevTask.created_by,
      //     title: 'Task Status Updated',
      //     message: `Task "${prevTask.title}" status changed to ${newStatus.replace('_', ' ')}`,
      //     type: 'status_updated',
      //   }).then(({ error: notifError }) => {
      //     if (notifError) console.error('Notification error:', notifError);
      //   });
      // }
    } catch (err) {
      // Rollback
      setTasks((prev) => prev.map((t) => (t.id === taskId ? prevTask : t)));
      if (selectedTask?.id === taskId) setSelectedTask(prevTask);
      alert('Failed to update status: ' + (err as Error).message);
    } finally {
      setTaskMutating(taskId, false);
      fetchTasks(true);
    }
  };

  const handleBombeToggle = async (taskId: string, isBombe: boolean) => {
    const newPriority = isBombe ? 'bombe' : 'normal';
    const prevTask = tasks.find(t => t.id === taskId);
    if (!prevTask) return;

    setTaskMutating(taskId, true);

    // Optimistic update
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, priority: newPriority } : t)));
    if (selectedTask?.id === taskId) {
      setSelectedTask((prev) => (prev ? { ...prev, priority: newPriority } : prev));
    }

    try {
      await apiUpdateTask(taskId, { priority: newPriority });
    } catch (err) {
      // Rollback
      setTasks((prev) => prev.map((t) => (t.id === taskId ? prevTask : t)));
      if (selectedTask?.id === taskId) setSelectedTask(prevTask);
      alert('Failed to update priority: ' + (err as Error).message);
    } finally {
      setTaskMutating(taskId, false);
      fetchTasks(true);
    }
  };

  const fetchComments = useCallback(async (taskId: string) => {
    if (!taskId) return;
    // Check if task still exists in our list
    const taskExists = tasks.some(t => t.id === taskId);
    if (!taskExists) {
      console.log('[fetchComments] Task no longer exists, skipping fetch');
      return;
    }
    try {
      const data = await apiGetComments(taskId);
      setComments(
        data.map((c) => ({
          ...c,
          user_name: c.user_name?.full_name || 'Unknown',
        })) as Comment[]
      );
    } catch (err) {
      console.error('[fetchComments] Failed:', err);
      // Don't throw - just log the error
    }
  }, [tasks]);

  // Real-time subscription for comments on the open task
  const selectedTaskId = selectedTask?.id;
  useEffect(() => {
    if (!profile || !selectedTaskId) return;

    const channel = supabase
      .channel(`employee-comments:${profile.id}:${selectedTaskId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'comments' },
        (payload) => {
          const comment = (payload.eventType === 'DELETE' ? payload.old : payload.new) as Comment;
          // DELETE payloads may lack task_id; refetching is cheap
          if (!comment?.task_id || comment.task_id === selectedTaskId) {
            fetchComments(selectedTaskId);
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [profile, selectedTaskId, fetchComments]);

  const openDetailModal = (task: Task) => {
    inbox.markTaskAsRead(task.id);
    setSelectedTask(task);
    setComments([]);
    setShowDetailModal(true);
    fetchComments(task.id).catch((err) => {
      console.error('Failed to fetch comments:', err);
    });
  };

  const handleNotificationClick = (taskId: string) => {
    markTaskAsRead(taskId);
    inbox.markTaskAsRead(taskId);
    const task = tasks.find(t => t.id === taskId);
    if (task) {
      openDetailModal(task);
    } else {
      // Task is gone (e.g. deleted) - show the inbox instead
      setActiveTab('inbox');
    }
  };

  const handleInboxOpen = (n: Notification) => {
    if (!n.read) inbox.markAsRead(n.id);
    const task = n.task_id ? tasks.find(t => t.id === n.task_id) : undefined;
    if (task) openDetailModal(task);
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setNewTask(emptyNewTask);
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !newTask.title.trim()) return;

    setCreateLoading(true);
    try {
      await apiCreateTask({
        title: newTask.title.trim(),
        description: newTask.description.trim() || null,
        priority: newTask.priority,
        status: 'todo',
        due_date: newTask.due_date || null,
        assigned_to: profile.id,
        created_by: profile.id,
        ...(newTask.isRecurring && {
          is_recurring: true,
          recurrence_pattern: newTask.recurrencePattern,
          recurrence_start_date: newTask.recurrenceStartDate || new Date().toISOString().split('T')[0],
          recurrence_end_date: newTask.recurrenceEndDate || null,
          recurrence_day_of_week: newTask.recurrencePattern === 'weekly' ? newTask.recurrenceDayOfWeek ?? null : null,
        }),
      });
      closeCreateModal();
      await fetchTasks(true);
    } catch (err) {
      alert('Failed to add task: ' + (err as Error).message);
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDeleteOwnTask = async (task: Task) => {
    // Employees may only delete tasks they created (also enforced by RLS)
    if (task.created_by !== profile?.id) return;
    if (!confirm(`Delete "${task.title}"?`)) return;
    try {
      await apiDeleteTask(task.id);
      setShowDetailModal(false);
      setSelectedTask(null);
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
    } catch (err) {
      alert('Failed to delete task: ' + (err as Error).message);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask || !newComment.trim() || !profile) return;

    setCommentLoading(true);

    try {
      await apiCreateComment({
        task_id: selectedTask.id,
        user_id: profile.id,
        content: newComment.trim(),
      });

      // Notify manager - DISABLED due to notification timeout issues
      // await supabase.from('notifications').insert({
      //   user_id: selectedTask.created_by,
      //   title: 'New Comment',
      //   message: `New comment on task "${selectedTask.title}"`,
      //   type: 'comment_added',
      // });

      setNewComment('');
      await fetchComments(selectedTask.id);
    } catch (err) {
      alert('Failed to add comment: ' + (err as Error).message);
    }

    setCommentLoading(false);
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!confirm('Are you sure you want to delete this comment?')) return;
    if (!selectedTask) return;

    try {
      await apiDeleteComment(commentId);
      await fetchComments(selectedTask.id);
    } catch (err) {
      console.error('Error deleting comment:', err);
      alert('Failed to delete comment: ' + (err as Error).message);
    }
  };

  const getStats = () => {
    const total = tasks.length;
    const todo = tasks.filter(t => t.status === 'todo').length;
    const inProgress = tasks.filter(t => t.status === 'in_progress').length;
    const done = tasks.filter(t => t.status === 'done').length;
    const overdue = tasks.filter(t => {
      if (!t.due_date || t.status === 'done') return false;
      return new Date(t.due_date) < now();
    }).length;
    return { total, todo, inProgress, done, overdue };
  };

  const filteredTasks = filterStatus === 'all' 
    ? tasks 
    : tasks.filter(t => t.status === filterStatus);

  // Sort tasks: Done tasks at bottom, then BOMBE first, then by date
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    // Done tasks go to the bottom
    if (a.status === 'done' && b.status !== 'done') return 1;
    if (b.status === 'done' && a.status !== 'done') return -1;
    
    // Among non-done tasks: BOMBE tasks come first
    const aIsBombe = a.priority === 'bombe';
    const bIsBombe = b.priority === 'bombe';
    
    if (aIsBombe && !bIsBombe) return -1;
    if (bIsBombe && !aIsBombe) return 1;
    
    // Then sort by created_at (newest first)
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const stats = getStats();
  const recurringCount = tasks.filter(t => t.is_recurring).length;

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--primary)]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background-secondary)]">
      <TaskToastNotifications onNotificationClick={handleNotificationClick} />
      <Header user={profile} unreadCount={inbox.unreadCount} onNotificationsClick={() => setActiveTab('inbox')} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[var(--foreground)]">My Tasks</h1>
            <p className="text-[var(--foreground-secondary)]">View and manage your assigned tasks</p>
          </div>
          <Button onClick={() => setShowCreateModal(true)} className="shrink-0">
            <Plus className="w-4 h-4" />
            Add Task
          </Button>
        </div>

        {/* Main tabs */}
        <div className="mb-6 flex gap-1 border-b border-[var(--border)]">
          {([
            { key: 'tasks', label: 'Tasks', icon: <ClipboardList className="w-4 h-4" /> },
            { key: 'recurring', label: 'Recurring', icon: <Repeat className="w-4 h-4" /> },
            { key: 'inbox', label: 'Inbox', icon: <Bell className="w-4 h-4" /> },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 -mb-px border-b-2 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'border-[var(--primary)] text-[var(--primary)]'
                  : 'border-transparent text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.key === 'recurring' && recurringCount > 0 && (
                <span className="min-w-[20px] px-1.5 py-0.5 rounded-full bg-[var(--border)] text-[var(--foreground-secondary)] text-xs font-bold">
                  {recurringCount}
                </span>
              )}
              {tab.key === 'inbox' && inbox.unreadCount > 0 && (
                <span className="min-w-[20px] px-1.5 py-0.5 rounded-full bg-[var(--danger)] text-white text-xs font-bold">
                  {inbox.unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {activeTab === 'inbox' ? (
          <NotificationInbox
            notifications={inbox.notifications}
            loading={inbox.loading}
            onOpen={handleInboxOpen}
            onMarkRead={inbox.markAsRead}
            onMarkUnread={inbox.markAsUnread}
            onMarkAllRead={inbox.markAllAsRead}
          />
        ) : activeTab === 'recurring' ? (
          <RecurringTasks
            tasks={tasks}
            onOpen={openDetailModal}
            onStatusChange={handleStatusChange}
            mutatingIds={mutatingTaskIds}
          />
        ) : (
        <>

        {/* Stats - 2x2 Grid on mobile */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mb-8">
          <StatsCard title="Total" value={stats.total} icon={<ClipboardList className="w-5 h-5" />} color="blue" />
          <StatsCard title="To Do" value={stats.todo} icon={<Clock className="w-5 h-5" />} color="orange" />
          <StatsCard title="Active" value={stats.inProgress} icon={<Play className="w-5 h-5" />} color="blue" />
          <StatsCard title="Done" value={stats.done} icon={<CheckCircle className="w-5 h-5" />} color="green" />
          <StatsCard title="Overdue" value={stats.overdue} icon={<AlertTriangle className="w-5 h-5" />} color="red" />
        </div>

        {/* Filter */}
        <div className="mb-6 flex gap-1.5 sm:gap-2 flex-wrap">
          {['all', 'todo', 'in_progress', 'done'].map((status) => (
            <Button
              key={status}
              variant={filterStatus === status ? 'primary' : 'ghost'}
              size="sm"
              className="text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-1.5"
              onClick={() => setFilterStatus(status)}
            >
              {status === 'all' ? 'All' : status === 'in_progress' ? 'Active' : status === 'todo' ? 'To Do' : 'Done'}
            </Button>
          ))}
        </div>

        {/* Tasks - Mobile: Card Layout, Desktop: Table */}
        <Card padding="none" className="overflow-hidden">
          {/* Desktop Table View */}
          <div className="hidden sm:block">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[var(--background-tertiary)] border-b border-[var(--border)] sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--foreground-secondary)] uppercase w-[35%]">Task</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--foreground-secondary)] uppercase w-[15%]">Status</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--foreground-secondary)] uppercase w-[12%]">Due</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--foreground-secondary)] uppercase w-[12%]">Days Ago</th>
                    <th className="px-4 py-3 w-[16%]"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
              </table>
              <div className="max-h-[480px] overflow-y-auto">
                <table className="w-full">
                  <tbody className="divide-y divide-[var(--border)]">
                    {sortedTasks.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-[var(--foreground-tertiary)]">
                          No tasks assigned to you yet.
                        </td>
                      </tr>
                    ) : (
                      sortedTasks.map((task) => (
                        <tr key={task.id} onClick={() => openDetailModal(task)} className={`transition-colors cursor-pointer relative ${
                          task.status === 'done'
                            ? 'opacity-50 bg-gray-50 dark:bg-gray-800/30 hover:bg-gray-100 dark:hover:bg-gray-800/50'
                            : task.priority === 'bombe'
                              ? 'bg-red-600 dark:bg-red-700 hover:bg-red-700 dark:hover:bg-red-800'
                              : 'hover:bg-[var(--background-secondary)]'
                        }`}>
                          <td className="px-4 py-3 relative w-[35%]">
                            <p className={`font-medium text-base ${task.priority === 'bombe' && task.status !== 'done' ? 'text-white font-bold' : 'text-[var(--foreground)]'} ${task.status === 'done' ? 'line-through text-gray-400 dark:text-gray-500' : ''}`}>
                              {task.title}
                              {task.is_recurring && (
                                <span className="inline-flex items-center ml-2 px-1.5 py-0.5 rounded text-xs font-medium bg-[var(--primary)]/10 text-[var(--primary)]">
                                  <Repeat className="w-3 h-3 mr-0.5" />
                                  {task.recurrence_pattern || 'daily'}
                                </span>
                              )}
                            </p>
                            <p className={`text-xs ${task.priority === 'bombe' && task.status !== 'done' ? 'text-white font-bold' : 'text-[var(--foreground-tertiary)]'}`}>
                              Created: {format(gmt(task.created_at), 'MMM d, yyyy')}
                            </p>
                          </td>
                          <td className="px-4 py-3 w-[15%]">
                            <div className="flex items-center justify-center">
                              <StatusSelect
                                value={task.status}
                                onChange={(status) => handleStatusChange(task.id, status)}
                                disabled={mutatingTaskIds.has(task.id)}
                                inverse={task.priority === 'bombe' && task.status !== 'done'}
                              />
                              {mutatingTaskIds.has(task.id) && (
                                <span className="inline-block align-middle ml-2">
                                  <span className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
                                </span>
                              )}
                            </div>
                          </td>
                          <td className={`px-4 py-3 text-sm text-center w-[12%] ${task.status === 'done' ? 'text-gray-400 line-through' : ''}`}>
                            {task.due_date ? (
                              <span className={task.priority === 'bombe' && task.status !== 'done' ? 'text-white font-bold' : new Date(task.due_date) < now() && task.status !== 'done' ? 'text-[var(--danger)] font-bold' : 'text-[var(--foreground-secondary)]'}>
                                {format(gmt(task.due_date), 'MMM d')}
                              </span>
                            ) : (
                              <span className={task.priority === 'bombe' && task.status !== 'done' ? 'text-red-100' : 'text-[var(--foreground-tertiary)]'}>-</span>
                            )}
                          </td>
                          <td className={`px-4 py-3 text-sm text-center w-[12%] ${task.status === 'done' ? 'text-gray-400 line-through' : ''}`}>
                            <span className={`font-bold ${task.priority === 'bombe' && task.status !== 'done' ? 'text-gray-900' : 'text-[var(--foreground-secondary)]'}`}>
                              {differenceInDays(now(), new Date(task.created_at))} days
                            </span>
                          </td>
                          <td className="px-4 py-3 w-[16%]">
                            <div className="flex items-center justify-center">
                              {task.created_by === profile?.id && (
                                <Button
                                  variant="danger"
                                  size="sm"
                                  title="Delete task"
                                  onClick={(e) => { e.stopPropagation(); handleDeleteOwnTask(task); }}
                                  className={`p-2 ${task.priority === 'bombe' && task.status !== 'done' ? 'bg-transparent! text-white border-white/50! hover:bg-white/20!' : ''}`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

        {/* Mobile Card View */}
          <div className="sm:hidden">
            {sortedTasks.length === 0 ? (
              <div className="px-4 py-8 text-center text-[var(--foreground-tertiary)]">
                No tasks assigned to you yet.
              </div>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {sortedTasks.map((task) => (
                  <div 
                    key={task.id} 
                    onClick={() => openDetailModal(task)}
                    className={`p-3 relative cursor-pointer ${
                      task.status === 'done'
                        ? 'opacity-60 bg-gray-50 dark:bg-gray-800/20'
                        : task.priority === 'bombe'
                          ? 'bg-red-600'
                          : 'bg-[var(--background)]'
                    }`}
                  >
                    {/* Title & Status Row */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium text-sm leading-tight ${task.priority === 'bombe' && task.status !== 'done' ? 'text-white' : 'text-[var(--foreground)]'} ${task.status === 'done' ? 'line-through text-gray-400' : ''}`}>
                          {task.title}
                          {task.is_recurring && (
                            <span className="inline-flex items-center ml-1 px-1 py-0.5 rounded text-xs font-medium bg-[var(--primary)]/10 text-[var(--primary)]">
                              <Repeat className="w-3 h-3" />
                            </span>
                          )}
                        </p>
                        <p className={`text-xs ${task.priority === 'bombe' && task.status !== 'done' ? 'text-white font-bold' : 'text-[var(--foreground-tertiary)]'}`}>
                          {format(gmt(task.created_at), 'MMM d, yyyy')} • {differenceInDays(now(), new Date(task.created_at))} days ago
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {task.priority === 'bombe' && task.status !== 'done' && (
                          <span className="text-xs font-bold text-white animate-pulse">🚨</span>
                        )}
                        {task.created_by === profile?.id && (
                          <Button
                            variant="danger"
                            size="sm"
                            title="Delete task"
                            onClick={(e) => { e.stopPropagation(); handleDeleteOwnTask(task); }}
                            className={`p-1.5 ${task.priority === 'bombe' && task.status !== 'done' ? 'bg-transparent! text-white border-white/50! hover:bg-white/20!' : ''}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Action Row */}
                    <div className="flex items-center gap-2">
                      <StatusSelect
                        value={task.status}
                        onChange={(status) => handleStatusChange(task.id, status)}
                        disabled={mutatingTaskIds.has(task.id)}
                        inverse={task.priority === 'bombe' && task.status !== 'done'}
                      />
                      {mutatingTaskIds.has(task.id) && (
                        <span className="inline-block animate-spin rounded-full h-3 w-3 border-b-2 border-current" />
                      )}
                      {task.due_date && (
                        <span className={`text-xs px-2 py-1 rounded ml-auto ${
                          task.priority === 'bombe' && task.status !== 'done'
                            ? 'bg-white/20 text-white'
                            : new Date(task.due_date) < now() && task.status !== 'done'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-gray-100 text-gray-600'
                        }`}>
                          {format(gmt(task.due_date), 'MMM d')}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
        </>
        )}
      </main>

      {/* Add Task Modal */}
      <Modal isOpen={showCreateModal} onClose={closeCreateModal} title="Add a Task for Yourself">
        <form onSubmit={handleCreateTask} className="space-y-4">
          <Input
            label="Title"
            placeholder="What do you need to do?"
            value={newTask.title}
            onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
            required
            autoFocus
          />
          <Textarea
            label="Description"
            placeholder="Details (optional)"
            value={newTask.description}
            onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
            rows={3}
          />
          <DatePicker
            label="Due Date"
            value={newTask.due_date}
            onChange={(due_date) => setNewTask((prev) => ({ ...prev, due_date }))}
          />
          <label className="flex items-center gap-2 text-sm font-medium text-[var(--foreground-secondary)] cursor-pointer">
            <input
              type="checkbox"
              checked={newTask.priority === 'bombe'}
              onChange={(e) => setNewTask({ ...newTask, priority: e.target.checked ? 'bombe' : 'normal' })}
              className="w-4 h-4 accent-red-600"
            />
            Mark as BOMBE (urgent)
          </label>
          <RecurringTaskSelector
            isRecurring={newTask.isRecurring}
            pattern={newTask.recurrencePattern}
            startDate={newTask.recurrenceStartDate}
            endDate={newTask.recurrenceEndDate}
            dayOfWeek={newTask.recurrenceDayOfWeek}
            onChange={(config) => setNewTask((prev) => ({
              ...prev,
              isRecurring: config.isRecurring,
              recurrencePattern: config.pattern,
              recurrenceStartDate: config.startDate,
              recurrenceEndDate: config.endDate,
              recurrenceDayOfWeek: config.dayOfWeek,
            }))}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={closeCreateModal}>
              Cancel
            </Button>
            <Button type="submit" loading={createLoading} disabled={!newTask.title.trim()}>
              Add Task
            </Button>
          </div>
        </form>
      </Modal>

      {/* Task Detail Modal */}
      <Modal isOpen={showDetailModal} onClose={() => { setShowDetailModal(false); setSelectedTask(null); setComments([]); setNewComment(''); }} title="Task Details" size="lg">
        {selectedTask && (
          <div className="space-y-4">
            <div>
              <h3 className={`text-lg font-semibold ${selectedTask.priority === 'bombe' && selectedTask.status !== 'done' ? 'text-red-600 dark:text-red-400' : 'text-[var(--foreground)]'}`}>{selectedTask.title}</h3>
              {selectedTask.is_recurring && (
                <div className="flex items-center gap-2 mt-1">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-[var(--primary)]/10 text-[var(--primary)]">
                    <Repeat className="w-3 h-3" />
                    Recurring ({selectedTask.recurrence_pattern || 'daily'})
                  </span>
                </div>
              )}
              {selectedTask.description && (
                <p className="mt-2 text-[var(--foreground-secondary)]">{selectedTask.description}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 py-4 border-y border-[var(--border)]">
              <div>
                <p className="text-sm text-[var(--foreground-tertiary)]">Status</p>
                <StatusSelect
                  value={selectedTask.status}
                  onChange={(status) => handleStatusChange(selectedTask.id, status)}
                  disabled={mutatingTaskIds.has(selectedTask.id)}
                />
                {mutatingTaskIds.has(selectedTask.id) && (
                  <span className="inline-block align-middle ml-2">
                    <span className="inline-block animate-spin rounded-full h-3 w-3 border-b-2 border-current" />
                  </span>
                )}
              </div>
              <div>
                <p className="text-sm text-[var(--foreground-tertiary)]">Due Date</p>
                <p className="font-medium">{selectedTask.due_date ? format(gmt(selectedTask.due_date), 'MMM d, yyyy') : 'No due date'}</p>
              </div>
              <div>
                <p className="text-sm text-[var(--foreground-tertiary)]">Created By</p>
                <p className="font-medium">{selectedTask.created_by === profile?.id ? 'You' : selectedTask.created_by_name}</p>
              </div>
              <div>
                <p className="text-sm text-[var(--foreground-tertiary)]">Created</p>
                <p className="font-medium">{format(gmt(selectedTask.created_at), 'MMM d, yyyy')}</p>
                <p className="mt-0.5 text-xs text-[var(--foreground-tertiary)] tabular-nums">
                  {format(gmt(selectedTask.created_at), 'HH:mm')} · {differenceInDays(now(), new Date(selectedTask.created_at))} days ago
                </p>
              </div>
              {selectedTask.is_recurring && (
                <div className="col-span-2">
                  <p className="text-sm text-[var(--foreground-tertiary)]">Recurrence</p>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-[var(--primary)]/10 text-[var(--primary)]">
                      <Repeat className="w-3 h-3" />
                      Recurring ({selectedTask.recurrence_pattern || 'daily'})
                    </span>
                    {selectedTask.recurrence_start_date && (
                      <span className="text-xs text-[var(--foreground-secondary)]">
                        From {format(gmt(selectedTask.recurrence_start_date), 'MMM d, yyyy')}
                        {selectedTask.recurrence_end_date && ` to ${format(gmt(selectedTask.recurrence_end_date), 'MMM d, yyyy')}`}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {selectedTask.created_by === profile?.id && (
              <div className="flex justify-end">
                <Button variant="ghost" size="sm" className="text-[var(--danger)]" onClick={() => handleDeleteOwnTask(selectedTask)}>
                  <Trash2 className="w-4 h-4" />
                  Delete task
                </Button>
              </div>
            )}

            {/* Comments Section */}
            <div>
              <h4 className="font-semibold text-[var(--foreground)] mb-3">Comments</h4>
              <div className="space-y-3 max-h-48 overflow-y-auto mb-4">
                {comments.length === 0 ? (
                  <p className="text-sm text-[var(--foreground-tertiary)]">No comments yet.</p>
                ) : (
                  comments.map((comment) => (
                    <div key={comment.id} className="bg-[var(--background-tertiary)] rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm">{comment.user_name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[var(--foreground-muted)]">
                            {format(gmt(comment.created_at), 'MMM d, h:mm a')}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="p-1 text-[var(--danger)] hover:bg-[var(--danger)]/10"
                            onClick={() => handleDeleteComment(comment.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                      <p className="text-sm text-[var(--foreground-secondary)]">{comment.content}</p>
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={handleAddComment} className="flex gap-2">
                <Textarea
                  placeholder="Add a comment..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  className="flex-1"
                  rows={1}
                />
                <Button type="submit" loading={commentLoading} disabled={!newComment.trim()}>
                  Send
                </Button>
              </form>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
