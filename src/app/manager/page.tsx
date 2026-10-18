'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth, useTaskNotifications, useNotifications, notificationToToast } from '@/hooks';
import { Header, StatsCard, OnlineUsers, NotificationInbox } from '@/components/layout';
import { Button, Input, Select, Textarea, Modal, Card, Badge, DatePicker, StatusSelect, StatusPill } from '@/components/ui';
import { RecurringTaskSelector } from '@/components/ui/RecurringTaskSelector';
import { formatRecurrencePattern, calculateNextOccurrence } from '@/lib/recurring-tasks';
import { TaskNotificationProvider } from '@/hooks/useTaskNotifications';
import { TaskToastNotifications } from '@/components/ui/TaskToastNotifications';
import { Task, Profile, TaskPriority, TaskStatus, Comment, RecurrencePattern, Notification } from '@/types';
import { apiGetEmployees, apiGetTasks, apiCreateTask, apiUpdateTask, apiDeleteTask, apiGetComments, apiCreateComment, apiDeleteComment, apiGetTasksByParentId } from '@/lib/api-client';
import { 
  ClipboardList, 
  Clock, 
  CheckCircle, 
  AlertTriangle,
  Plus,
  Pencil,
  Trash2,
  MessageSquare,
  Users,
  Search,
  Repeat,
  Bell,
  UserPlus,
} from 'lucide-react';
import { format, isSameDay, startOfDay, differenceInDays } from 'date-fns';
import { gmt, now } from '@/lib/time';

const priorityOptions = [
  { value: 'bombe', label: '🚨 BOMBE (Urgent)' },
  { value: 'normal', label: 'Normal' },
];

const statusOptions = [
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
];

const priorityBadgeVariant: Record<TaskPriority, 'danger' | 'secondary'> = {
  bombe: 'danger',
  normal: 'secondary',
};

export default function ManagerDashboard() {
  return (
    <TaskNotificationProvider>
      <ManagerDashboardInner />
    </TaskNotificationProvider>
  );
}

function ManagerDashboardInner() {
  const { profile, loading: authLoading } = useAuth();
  const { addNotification, markTaskAsRead } = useTaskNotifications();
  const inbox = useNotifications(profile?.id, (n) => {
    addNotification(notificationToToast(n));
    // A notification means the task changed. Refetch here too: the tasks channel can miss
    // events while it resubscribes (e.g. right after the profile reloads).
    fetchData(true);
    if (n.task_id && n.task_id === selectedTask?.id) fetchComments(n.task_id);
  });
  const [activeTab, setActiveTab] = useState<'tasks' | 'inbox'>('tasks');
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterEmployee, setFilterEmployee] = useState<string>('all');
  const [employeeSearch, setEmployeeSearch] = useState<string>('');
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState<boolean>(false);
  const [taskSearch, setTaskSearch] = useState<string>('');
  const [showFilterDropdown, setShowFilterDropdown] = useState<boolean>(false);
  const [mutatingTaskIds, setMutatingTaskIds] = useState<Set<string>>(new Set());
  
  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [dueDate, setDueDate] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  
  // Recurring task state
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrencePattern, setRecurrencePattern] = useState<RecurrencePattern>('daily');
  const [recurrenceStartDate, setRecurrenceStartDate] = useState('');
  const [recurrenceEndDate, setRecurrenceEndDate] = useState<string | undefined>(undefined);
  const [recurrenceDayOfWeek, setRecurrenceDayOfWeek] = useState<number | undefined>(undefined);

  const debounce = useCallback((fn: () => void, delayMs: number) => {
    let timeoutId: number | undefined;
    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(fn, delayMs);
    };
  }, []);

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      console.error('[diagnostics] window.error:', event.message, event.error);
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('[diagnostics] unhandledrejection:', event.reason);
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);

    const { data: authSub } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[diagnostics] auth event:', event, {
        userId: session?.user?.id,
        expiresAt: session?.expires_at,
      });
    });

    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
      authSub.subscription.unsubscribe();
    };
  }, []);

  const fetchData = useCallback(async (isBackgroundRefresh = false) => {
    if (!profile) return;

    if (!isBackgroundRefresh) {
      setLoading(true);
    }

    // Timeout failsafe - ensure loading always completes
    const timeoutId = setTimeout(() => {
      console.warn('[fetchData] Timeout reached, forcing loading to false');
      setLoading(false);
    }, 15000);

    try {
      const employeesData = await apiGetEmployees();
      setEmployees(employeesData as Profile[]);

      const tasksData = await apiGetTasks();
      console.log('[fetchData] First task from API:', tasksData[0]);
      console.log('[fetchData] First task is_recurring:', tasksData[0]?.is_recurring);
      const mappedTasks = tasksData.map((t) => ({
        ...t,
        assigned_to_name: t.assigned_to_name?.full_name,
        created_by_name: t.created_by_name?.full_name,
      })) as Task[];
      console.log('[fetchData] First mapped task is_recurring:', mappedTasks[0]?.is_recurring);
      setTasks(mappedTasks);

      // Roll over recurring tasks that have passed their due date
      await rolloverRecurringTasks(mappedTasks);
    } catch (err) {
      console.error('[fetchData] API error:', err);
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
        t => t.is_recurring && 
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
      await fetchData(true);
    } catch (err) {
      console.error('[rolloverRecurringTasks] Error:', err);
    }
  }, [fetchData]);

  useEffect(() => {
    if (!authLoading && !profile) {
      router.push('/login');
    } else if (profile && profile.role === 'employee') {
      router.push('/employee');
    } else if (profile) {
      fetchData();
    }
  }, [profile, authLoading, router, fetchData]);

  // Real-time subscription for tasks with notifications
  useEffect(() => {
    if (!profile) return;

    const refresh = debounce(() => fetchData(true), 300);

    const channel = supabase
      .channel('manager-tasks')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'tasks' },
        (payload) => {
          const newTask = payload.new as Task;
          // Manager created the task - DON'T notify manager, employee will get it via their subscription
          // Only refresh the task list for the manager
          refresh();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tasks' },
        () => {
          // Notifications for changes come from DB triggers (see useNotifications)
          refresh();
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'tasks' },
        (payload) => {
          // Just refresh the task list - employee gets notified via their own subscription
          refresh();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [profile, fetchData, debounce]);

  // Periodic rollover check - run every minute to catch tasks that need rollover without page refresh
  useEffect(() => {
    if (!profile) return;
    
    const intervalId = setInterval(() => {
      console.log('[Periodic Rollover] Checking for recurring tasks to rollover...');
      rolloverRecurringTasks(tasks);
    }, 60000); // Check every minute
    
    return () => clearInterval(intervalId);
  }, [profile, tasks, rolloverRecurringTasks]);

  // Real-time subscription for comments with notifications
  useEffect(() => {
    if (!profile) return;

    console.log('[Realtime] Setting up comments subscription for manager:', profile.id);

    let retryCount = 0;
    const maxRetries = 3;
    let isActive = true;

    const setupSubscription = () => {
      if (!isActive) return;
      
      // Use unique channel name to avoid conflicts
      const channelName = `comments-ins-${profile.id}-${Date.now()}`;
      console.log('[Realtime] Creating channel:', channelName);
      
      const channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'comments',
          },
          async (payload) => {
            const newComment = payload.new as Comment;

            if (selectedTask?.id === newComment.task_id) {
              fetchComments(newComment.task_id);
            }
          }
        )
        .subscribe((status, err) => {
          console.log('[Realtime] Status:', status, err || '');
          if (status === 'SUBSCRIBED') {
            console.log('[Realtime] ✓ ACTIVE');
            retryCount = 0;
          } else if ((status === 'CLOSED' || status === 'CHANNEL_ERROR') && isActive) {
            console.error('[Realtime] ✗ Failed:', status);
            if (retryCount < maxRetries) {
              retryCount++;
              console.log(`[Realtime] Retry ${retryCount}/${maxRetries}...`);
              setTimeout(setupSubscription, 1000 * retryCount);
            }
          }
        });

      return channel;
    };

    const channel = setupSubscription();

    return () => {
      isActive = false;
      channel?.unsubscribe();
    };
  }, [profile, selectedTask]);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setPriority('normal');
    setStatus('todo');
    setDueDate('');
    setAssignedTo('');
    setEmployeeSearch('');
    // Reset recurring task state
    setIsRecurring(false);
    setRecurrencePattern('daily');
    setRecurrenceStartDate('');
    setRecurrenceEndDate(undefined);
    setRecurrenceDayOfWeek(undefined);
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    
    console.log('handleCreateTask called');
    console.log('title:', title);
    console.log('assignedTo:', assignedTo);
    console.log('profile:', profile?.id, profile?.role);
    console.log('isRecurring:', isRecurring);
    
    if (!title.trim()) {
      alert('Please enter a task title');
      return;
    }
    if (!assignedTo) {
      alert('Please select an employee');
      return;
    }
    if (!profile) {
      alert('User profile not loaded. Please refresh the page.');
      return;
    }

    setFormLoading(true);

    try {
      // Ensure priority is strictly 'bombe' or 'normal' - handle all edge cases
      let validPriority: 'bombe' | 'normal' = 'normal';
      
      console.log('Raw priority state:', priority, 'type:', typeof priority);
      
      if (priority === 'bombe') {
        validPriority = 'bombe';
      } else {
        validPriority = 'normal';
      }
      
      console.log('Final priority value:', validPriority, 'type:', typeof validPriority);
      
      const taskData = {
        title: title.trim(),
        description: description.trim() || null,
        priority: validPriority as 'bombe' | 'normal',
        due_date: dueDate || null,
        assigned_to: assignedTo,
        created_by: profile.id,
        status: 'todo' as const,
      };
      
      console.log('Inserting task:', taskData);
      
      const newTask = await apiCreateTask(taskData);
      
      console.log('Insert successful:', newTask);
      console.log('newTask type:', Array.isArray(newTask) ? 'array' : typeof newTask);
      console.log('newTask[0]?.id:', newTask?.[0]?.id);
      console.log('newTask?.id:', newTask?.id);

      // If recurring, just update the task with recurring config
      // No instances are generated upfront - task will rollover when due date arrives
      console.log('[handleCreateTask] Checking if recurring:', isRecurring, newTask);
      if (isRecurring && newTask) {
        const taskId = Array.isArray(newTask) ? newTask[0]?.id : newTask.id;
        
        console.log('[handleCreateTask] Extracted taskId:', taskId);
        
        if (!taskId) {
          console.error('[handleCreateTask] Could not get task ID from created task:', newTask);
          throw new Error('Task created but ID not found');
        }
        
        const recurringConfig = {
          is_recurring: true,
          recurrence_pattern: recurrencePattern,
          recurrence_start_date: recurrenceStartDate || new Date().toISOString().split('T')[0],
          recurrence_end_date: recurrenceEndDate,
          recurrence_day_of_week: recurrencePattern === 'weekly' ? recurrenceDayOfWeek : null,
        };
        
        console.log('[handleCreateTask] About to update task with recurring config:', recurringConfig);
        
        // Update the task to be recurring
        try {
          await apiUpdateTask(taskId, recurringConfig);
          console.log('[handleCreateTask] Successfully updated task with recurring config');
        } catch (updateErr) {
          console.error('[handleCreateTask] Failed to update recurring config:', updateErr);
          throw updateErr;
        }
        
        // Small delay to ensure DB has committed the recurring config
        await new Promise(resolve => setTimeout(resolve, 200));
      } else {
        console.log('[handleCreateTask] Skipping recurring update - isRecurring:', isRecurring, 'newTask:', newTask);
      }

      resetForm();
      setShowCreateModal(false);
      // Force a fresh fetch to get the recurring fields
      await fetchData();
    } catch (err) {
      console.error('Exception creating task:', err);
      alert('An error occurred while creating the task');
    } finally {
      setFormLoading(false);
    }
  };

  const handleUpdateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask || !title.trim()) return;

    setFormLoading(true);

    try {
      // Ensure priority is a valid value
      const validPriority: TaskPriority = priority === 'bombe' ? 'bombe' : 'normal';

      try {
        await apiUpdateTask(selectedTask.id, {
          title: title.trim(),
          description: description.trim() || null,
          priority: validPriority,
          status: status,
          due_date: dueDate || null,
          assigned_to: assignedTo || selectedTask.assigned_to,
          // Recurring task fields
          is_recurring: isRecurring,
          recurrence_pattern: isRecurring ? recurrencePattern : null,
          recurrence_start_date: isRecurring ? (recurrenceStartDate || new Date().toISOString().split('T')[0]) : null,
          recurrence_end_date: isRecurring ? recurrenceEndDate : null,
          recurrence_day_of_week: isRecurring && recurrencePattern === 'weekly' ? recurrenceDayOfWeek : null,
        });

        setShowEditModal(false);
        setSelectedTask(null);
        resetForm();
        fetchData();
      } catch (err) {
        console.error('Error updating task:', err);
        alert('Failed to update task: ' + (err as Error).message);
      }
    } catch (err) {
      console.error('Exception updating task:', err);
      alert('An error occurred while updating the task');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;

    const taskToDelete = tasks.find(t => t.id === taskId);
    if (!taskToDelete) return;

    console.log('[handleDeleteTask] Deleting task:', taskId, 'Title:', taskToDelete.title);

    try {
      await apiDeleteTask(taskId);
      console.log('[handleDeleteTask] Delete successful');
      fetchData();
    } catch (err) {
      console.error('[handleDeleteTask] Error deleting task:', err);
      alert('Failed to delete task: ' + (err as Error).message);
    }
  };

  const handleStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    const prevTask = tasks.find(t => t.id === taskId);
    if (!prevTask) return;

    setMutatingTaskIds(prev => new Set(prev).add(taskId));

    // Optimistic update
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));
    if (selectedTask?.id === taskId) {
      setSelectedTask((prev) => (prev ? { ...prev, status: newStatus } : prev));
    }

    try {
      await apiUpdateTask(taskId, { status: newStatus });
    } catch (err) {
      // Rollback
      setTasks((prev) => prev.map((t) => (t.id === taskId ? prevTask : t)));
      if (selectedTask?.id === taskId) setSelectedTask(prevTask);
      alert('Failed to update status: ' + (err as Error).message);
    } finally {
      setMutatingTaskIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(taskId);
        return newSet;
      });
      fetchData(true);
    }
  };

  const openEditModal = (task: Task) => {
    console.log('[openEditModal] Opening task:', task.id, task.title);
    console.log('[openEditModal] Raw task.is_recurring:', task.is_recurring);
    console.log('[openEditModal] Raw task.recurrence_pattern:', task.recurrence_pattern);
    console.log('[openEditModal] Raw task.recurrence_start_date:', task.recurrence_start_date);
    
    setSelectedTask(task);
    setTitle(task.title);
    setDescription(task.description || '');
    setPriority(task.priority);
    setStatus(task.status);
    setDueDate(task.due_date || '');
    setAssignedTo(task.assigned_to);
    setEmployeeSearch(task.assigned_to_name || '');
    // Initialize recurring task state from task
    const recurringValue = task.is_recurring === true;
    console.log('[openEditModal] Setting isRecurring to:', recurringValue);
    setIsRecurring(recurringValue);
    setRecurrencePattern(task.recurrence_pattern || 'daily');
    setRecurrenceStartDate(task.recurrence_start_date || '');
    setRecurrenceEndDate(task.recurrence_end_date);
    setRecurrenceDayOfWeek(task.recurrence_day_of_week);
    setShowEditModal(true);
  };

  const fetchComments = async (taskId: string) => {
    try {
      const data = await apiGetComments(taskId);
      setComments(data.map((c) => ({
        ...c,
        user_name: c.user_name?.full_name || 'Unknown',
      })) as Comment[]);
    } catch (err) {
      console.error('[fetchComments] API error:', err);
    }
  };

  const openDetailModal = async (task: Task) => {
    inbox.markTaskAsRead(task.id);
    setSelectedTask(task);
    setComments([]);
    setShowDetailModal(true);
    await fetchComments(task.id);
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
      setNewComment('');
      await fetchComments(selectedTask.id);
    } catch (err) {
      console.error('Error adding comment:', err);
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
    const active = tasks.filter(t => t.status !== 'done').length;
    const completed = tasks.filter(t => t.status === 'done').length;
    const overdue = tasks.filter(t => {
      if (!t.due_date || t.status === 'done') return false;
      return new Date(t.due_date) < now();
    }).length;
    return { total, active, completed, overdue };
  };

  const getEmployeeStats = (employeeId: string) => {
    const employeeTasks = tasks.filter(t => t.assigned_to === employeeId);
    const total = employeeTasks.length;
    const todo = employeeTasks.filter(t => t.status === 'todo').length;
    const inProgress = employeeTasks.filter(t => t.status === 'in_progress').length;
    const done = employeeTasks.filter(t => t.status === 'done').length;
    const bombe = employeeTasks.filter(t => t.priority === 'bombe' && t.status !== 'done').length;
    const overdue = employeeTasks.filter(t => {
      if (!t.due_date || t.status === 'done') return false;
      return new Date(t.due_date) < now();
    }).length;
    return { total, todo, inProgress, done, bombe, overdue };
  };

  const getEmployeeTasks = (employeeId: string) => {
    const employeeTasks = tasks.filter(t => t.assigned_to === employeeId);
    return [...employeeTasks].sort((a, b) => {
      // Done tasks go to the bottom
      if (a.status === 'done' && b.status !== 'done') return 1;
      if (b.status === 'done' && a.status !== 'done') return -1;

      // Among non-done tasks: BOMBE tasks come first
      const aIsBombe = a.priority === 'bombe';
      const bIsBombe = b.priority === 'bombe';

      if (aIsBombe && !bIsBombe) return -1;
      if (bIsBombe && !aIsBombe) return 1;

      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  };

  const matchesEmployeeQuery = (e: Profile, query: string) => {
    const q = query.trim().toLowerCase();
    return q === '' ||
      e.full_name.toLowerCase().includes(q) ||
      (e.email || '').toLowerCase().includes(q);
  };

  const filteredTasks = tasks.filter(t => {
    const matchesStatus = filterStatus === 'all' || t.status === filterStatus;
    let matchesSearch = true;
    if (filterEmployee !== 'all') {
      matchesSearch = t.assigned_to === filterEmployee;
    } else if (taskSearch.trim() !== '') {
      const assignee = employees.find(e => e.id === t.assigned_to);
      matchesSearch = assignee
        ? matchesEmployeeQuery(assignee, taskSearch)
        : (t.assigned_to_name || '').toLowerCase().includes(taskSearch.trim().toLowerCase());
    }
    return matchesStatus && matchesSearch;
  });

  // Filter employees for search dropdown
  const filteredEmployees = employees.filter(e =>
    e.full_name.toLowerCase().includes(employeeSearch.toLowerCase())
  );

  // Employees matching the task list filter search box
  const filterEmployeeOptions = employees
    .filter(e => matchesEmployeeQuery(e, filterEmployee === 'all' ? taskSearch : ''))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

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
      {profile && <OnlineUsers currentUserId={profile.id} />}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-[var(--foreground)]">Manager Dashboard</h1>
            <p className="text-[var(--foreground-secondary)]">Manage and track your team&apos;s tasks</p>
          </div>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4" />
            Create Task
          </Button>
        </div>

        {/* Main tabs */}
        <div className="mb-6 flex gap-1 border-b border-[var(--border)]">
          {([
            { key: 'tasks', label: 'Tasks', icon: <ClipboardList className="w-4 h-4" /> },
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
        ) : (
        <>
        {/* Stats - 2x2 Grid on mobile */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
          <StatsCard title="Total" value={stats.total} icon={<ClipboardList className="w-5 h-5" />} color="blue" />
          <StatsCard title="Active" value={stats.active} icon={<Clock className="w-5 h-5" />} color="orange" />
          <StatsCard title="Done" value={stats.completed} icon={<CheckCircle className="w-5 h-5" />} color="green" />
          <StatsCard title="Overdue" value={stats.overdue} icon={<AlertTriangle className="w-5 h-5" />} color="red" />
        </div>

        {/* Filter */}
        <div className="mb-6 flex flex-col sm:flex-row gap-4 items-end">
          <div className="w-full sm:flex-1">
            <label className="block text-sm font-medium text-[var(--foreground-secondary)] mb-1.5">
              Filter by Employee
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-muted)] pointer-events-none" />
              <input
                type="text"
                placeholder="Search employee by name or email..."
                value={taskSearch}
                onChange={(e) => {
                  setTaskSearch(e.target.value);
                  setFilterEmployee('all');
                  setShowFilterDropdown(true);
                }}
                onFocus={() => setShowFilterDropdown(true)}
                onBlur={() => setTimeout(() => setShowFilterDropdown(false), 200)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setShowFilterDropdown(false);
                  if (e.key === 'Enter' && filterEmployeeOptions.length === 1) {
                    const match = filterEmployeeOptions[0];
                    setFilterEmployee(match.id);
                    setTaskSearch(match.full_name);
                    setShowFilterDropdown(false);
                  }
                }}
                className="w-full pl-9 pr-9 py-2 bg-white border border-[var(--border)] rounded-lg text-[var(--foreground)] placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
              />
              {taskSearch && (
                <button
                  type="button"
                  aria-label="Clear employee filter"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setTaskSearch('');
                    setFilterEmployee('all');
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--foreground-muted)] hover:text-[var(--foreground)] text-lg leading-none"
                >
                  ×
                </button>
              )}
              {showFilterDropdown && (
                <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-[var(--border)] rounded-lg max-h-64 overflow-y-auto shadow-lg">
                  <button
                    type="button"
                    onMouseDown={() => {
                      setTaskSearch('');
                      setFilterEmployee('all');
                      setShowFilterDropdown(false);
                    }}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-[var(--background-secondary)] transition-colors ${filterEmployee === 'all' && !taskSearch ? 'bg-[var(--primary)]/10 text-[var(--primary)] font-medium' : 'text-[var(--foreground)]'}`}
                  >
                    All Employees
                  </button>
                  {filterEmployeeOptions.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-[var(--foreground-muted)]">No employees found</div>
                  ) : (
                    filterEmployeeOptions.map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        onMouseDown={() => {
                          setFilterEmployee(e.id);
                          setTaskSearch(e.full_name);
                          setShowFilterDropdown(false);
                        }}
                        className={`w-full px-3 py-2 text-left text-sm hover:bg-[var(--background-secondary)] transition-colors ${filterEmployee === e.id ? 'bg-[var(--primary)]/10 text-[var(--primary)] font-medium' : 'text-[var(--foreground)]'}`}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-[#454954] flex items-center justify-center text-white text-xs font-medium shrink-0">
                            {e.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate">{e.full_name}</div>
                            {e.email && e.email !== e.full_name && (
                              <div className="text-xs text-[var(--foreground-muted)] truncate">{e.email}</div>
                            )}
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="w-full sm:w-64">
            <Select
              label="Filter by Status"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              options={[
                { value: 'all', label: 'All Tasks' },
                ...statusOptions,
              ]}
              className="w-full"
            />
          </div>
        </div>

        {/* Tasks - Desktop: Table, Mobile: Cards */}
        <Card padding="none" className="overflow-hidden">
          {/* Desktop Table View */}
          <div className="hidden sm:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead className="bg-[var(--background-tertiary)] border-b border-[var(--border)] sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--foreground-secondary)] uppercase w-[28%]">Task</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--foreground-secondary)] uppercase w-[18%]">Assigned</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--foreground-secondary)] uppercase w-[14%]">Status</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--foreground-secondary)] uppercase w-[10%]">Due</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--foreground-secondary)] uppercase w-[12%]">Days Ago</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--foreground-secondary)] uppercase w-[18%]">Actions</th>
                  </tr>
                </thead>
              </table>
              <div className="max-h-[480px] overflow-y-auto">
                <table className="w-full min-w-[640px]">
                  <tbody className="divide-y divide-[var(--border)]">
                    {sortedTasks.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-[var(--foreground-tertiary)]">
                          No tasks found. Create your first task!
                        </td>
                      </tr>
                    ) : (
                      sortedTasks.map((task) => (
                        <tr key={task.id} onClick={() => openDetailModal(task)} className={`transition-colors cursor-pointer relative ${
                          task.status === 'done'
                            ? 'opacity-50 bg-gray-50 dark:bg-gray-800/30 hover:bg-gray-100 dark:hover:bg-gray-800/50'
                            : task.priority === 'bombe'
                              ? 'bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30'
                              : 'hover:bg-[var(--background-secondary)]'
                        }`}>
                          <td className="px-4 py-3 relative w-[28%]">
                            <div>
                                <p className={`font-medium text-base ${task.priority === 'bombe' && task.status !== 'done' ? 'text-red-600 dark:text-red-400 font-bold' : 'text-[var(--foreground)]'} ${task.status === 'done' ? 'line-through text-gray-400 dark:text-gray-500' : ''}`}>
                                  {task.title}
                                  {task.created_by === task.assigned_to && (
                                    <span className="inline-flex items-center ml-2 px-1.5 py-0.5 rounded text-xs font-medium bg-teal-500/10 text-teal-700" title="Added by the employee">
                                      <UserPlus className="w-3 h-3 mr-0.5" />
                                      self-added
                                    </span>
                                  )}
                                  {task.is_recurring && (
                                    <span className="inline-flex items-center ml-2 px-1.5 py-0.5 rounded text-xs font-medium bg-[var(--primary)]/10 text-[var(--primary)]">
                                      <Repeat className="w-3 h-3 mr-0.5" />
                                      {task.recurrence_pattern || 'daily'}
                                    </span>
                                  )}
                                </p>
                                <p className={`text-xs ${task.priority === 'bombe' && task.status !== 'done' ? 'text-gray-900 font-bold' : 'text-[var(--foreground-tertiary)]'}`}>
                                  Created: {format(gmt(task.created_at), 'MMM d, yyyy')}
                                </p>
                              </div>
                          </td>
                          <td className={`px-4 py-3 text-sm w-[18%] ${task.status === 'done' ? 'text-gray-400 line-through' : 'text-[var(--foreground-secondary)]'}`}>
                            {task.assigned_to_name || 'Unknown'}
                          </td>
                          <td className="px-4 py-3 w-[14%] text-center">
                            <StatusPill status={task.status} />
                          </td>
                          <td className={`px-4 py-3 text-sm w-[10%] text-center ${task.status === 'done' ? 'line-through text-gray-400 dark:text-gray-500' : 'text-[var(--foreground-secondary)]'}`}>
                            {task.due_date ? format(gmt(task.due_date), 'MMM d') : '-'}
                          </td>
                          <td className={`px-4 py-3 text-sm w-[12%] text-center ${task.status === 'done' ? 'text-gray-400 line-through' : ''}`}>
                            <span className={`font-bold ${task.priority === 'bombe' && task.status !== 'done' ? 'text-gray-900' : 'text-[var(--foreground-secondary)]'}`}>
                              {differenceInDays(now(), new Date(task.created_at))} days
                            </span>
                          </td>
                          <td className="px-4 py-3 w-[18%]">
                            <div className="flex items-center justify-end gap-2">
                              <Button variant="ghost" size="sm" className="p-2" title="Edit task" onClick={(e) => { e.stopPropagation(); openEditModal(task); }}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button variant="danger" size="sm" className="p-2" title="Delete task" onClick={(e) => { e.stopPropagation(); handleDeleteTask(task.id); }}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
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
                No tasks found. Create your first task!
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
                          ? 'bg-red-50 dark:bg-red-900/10'
                          : 'bg-[var(--background)]'
                    }`}
                  >
                    {/* Title Row */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <p className={`font-semibold text-sm leading-tight ${task.priority === 'bombe' && task.status !== 'done' ? 'text-red-600 font-bold' : 'text-[var(--foreground)]'} ${task.status === 'done' ? 'line-through text-gray-400' : ''}`}>
                          {task.title}
                          {task.created_by === task.assigned_to && (
                            <span className="inline-flex items-center ml-1.5 px-1 py-0.5 rounded text-xs font-medium bg-teal-500/10 text-teal-700" title="Added by the employee">
                              <UserPlus className="w-3 h-3" />
                            </span>
                          )}
                          {task.is_recurring && (
                            <span className="inline-flex items-center ml-1.5 px-1 py-0.5 rounded text-xs font-medium bg-[var(--primary)]/10 text-[var(--primary)]">
                              <Repeat className="w-3 h-3" />
                            </span>
                          )}
                        </p>
                        <p className={`text-xs ${task.priority === 'bombe' && task.status !== 'done' ? 'text-gray-900 font-bold' : 'text-[var(--foreground-tertiary)]'}`}>
                          {format(gmt(task.created_at), 'MMM d, yyyy')} • {differenceInDays(now(), new Date(task.created_at))} days ago
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {task.priority === 'bombe' && task.status !== 'done' && (
                          <Badge variant="danger" className="text-xs">🚨</Badge>
                        )}
                      </div>
                    </div>

                    {/* Meta Row */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusPill status={task.status} compact />
                        <span className={`text-xs ${task.status === 'done' ? 'text-gray-400 line-through' : 'text-[var(--foreground-secondary)]'}`}>
                          {task.assigned_to_name || 'Unknown'}
                        </span>
                        {task.due_date && (
                          <span className={`text-xs px-2 py-0.5 rounded ${new Date(task.due_date) < now() && task.status !== 'done' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                            {format(gmt(task.due_date), 'MMM d')}
                          </span>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="sm" className="p-1.5" title="Edit task" onClick={(e) => { e.stopPropagation(); openEditModal(task); }}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="danger" size="sm" className="p-1.5" title="Delete task" onClick={(e) => { e.stopPropagation(); handleDeleteTask(task.id); }}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Employee Tracking Section */}
        <div className="mt-8 sm:mt-10">
          <div className="flex items-center gap-2 mb-4 sm:mb-6">
            <Users className="w-4 h-4 sm:w-5 sm:h-5 text-[var(--primary)]" />
            <h2 className="text-lg sm:text-xl font-bold text-[var(--foreground)]">Employee Tracking</h2>
          </div>

          {employees.length === 0 ? (
            <Card>
              <p className="text-center text-[var(--foreground-tertiary)]">No employees found.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {employees.map((employee) => {
                const empStats = getEmployeeStats(employee.id);
                const empTasks = getEmployeeTasks(employee.id);
                
                return (
                  <Card key={employee.id} padding="none" className="overflow-hidden">
                    {/* Employee Header */}
                    <div className="px-3 sm:px-4 py-2 sm:py-3 bg-[var(--background-tertiary)] border-b border-[var(--border)]">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#454954] flex items-center justify-center text-white font-medium text-xs sm:text-sm">
                            {employee.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                          </div>
                          <div>
                            <p className="font-semibold text-[var(--foreground)] text-xs sm:text-sm">{employee.full_name}</p>
                            <p className="text-xs text-[var(--foreground-tertiary)]">{empStats.total} tasks</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 text-xs">
                          <span className="px-1.5 py-0.5 rounded bg-orange-200 text-orange-900 dark:bg-orange-900/60 dark:text-orange-200">
                            {empStats.todo}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-blue-200 text-blue-900 dark:bg-blue-900/60 dark:text-blue-200 hidden sm:inline">
                            {empStats.inProgress}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-green-200 text-green-900 dark:bg-green-900/60 dark:text-green-200">
                            {empStats.done}
                          </span>
                          {empStats.bombe > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-red-200 text-red-900 dark:bg-red-900/60 dark:text-red-200 animate-pulse font-bold">
                              🚨{empStats.bombe}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {/* Employee Tasks Table */}
                    <div className="max-h-48 sm:max-h-64 overflow-y-auto">
                      <table className="w-full">
                        <thead className="bg-[var(--background-secondary)] border-b border-[var(--border)]">
                          <tr>
                            <th className="px-2 sm:px-3 py-2 text-left text-xs font-medium text-[var(--foreground-secondary)]">Task</th>
                            <th className="px-1 sm:px-2 py-2 text-center text-xs font-medium text-[var(--foreground-secondary)] w-16">Priority</th>
                            <th className="px-1 sm:px-2 py-2 text-right text-xs font-medium text-[var(--foreground-secondary)] w-24">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                          {empTasks.length === 0 ? (
                            <tr>
                              <td colSpan={3} className="px-3 sm:px-4 py-3 sm:py-4 text-center text-[var(--foreground-tertiary)] text-xs sm:text-sm">
                                No tasks
                              </td>
                            </tr>
                          ) : (
                            empTasks.map((task) => (
                              <tr key={task.id} onClick={() => openDetailModal(task)} className={`transition-colors cursor-pointer ${
                                task.status === 'done'
                                  ? 'opacity-50 bg-gray-50 dark:bg-gray-800/30 hover:bg-gray-100 dark:hover:bg-gray-800/50'
                                  : task.priority === 'bombe'
                                    ? 'bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20'
                                    : 'hover:bg-[var(--background-secondary)]'
                              }`}>
                                <td className="px-2 sm:px-3 py-1.5 sm:py-2">
                                  <p className={`text-xs sm:text-sm truncate max-w-[140px] sm:max-w-[180px] ${task.priority === 'bombe' && task.status !== 'done' ? 'text-red-600 dark:text-red-400 font-bold' : 'text-[var(--foreground)]'} ${task.status === 'done' ? 'line-through text-gray-400' : ''}`}>
                                    {task.title}
                                    {task.created_by === task.assigned_to && (
                                      <span className="inline-flex items-center ml-1 text-teal-700" title="Added by the employee">
                                        <UserPlus className="w-3 h-3" />
                                      </span>
                                    )}
                                    {task.is_recurring && (
                                      <span className="inline-flex items-center ml-1 text-[var(--primary)]" title={`Recurring ${task.recurrence_pattern || 'daily'}`}>
                                        <Repeat className="w-3 h-3" />
                                      </span>
                                    )}
                                  </p>
                                </td>
                                <td className="px-1 sm:px-2 py-1.5 sm:py-2 text-center">
                                  <span className={task.status === 'done' ? 'opacity-60' : ''}>
                                    <Badge variant={priorityBadgeVariant[task.priority]}>
                                      {task.priority === 'bombe' ? '🚨' : task.priority.charAt(0).toUpperCase()}
                                    </Badge>
                                  </span>
                                </td>
                                <td className="px-1 sm:px-2 py-1.5 sm:py-2">
                                  <div className="flex items-center justify-end gap-1">
                                    <Button variant="ghost" size="sm" className="p-1 sm:p-1.5 h-7 w-7" title="Edit task" onClick={(e) => { e.stopPropagation(); openEditModal(task); }}>
                                      <Pencil className="w-3.5 h-3.5" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
        </>
        )}
      </main>

      {/* Create Task Modal */}
      <Modal isOpen={showCreateModal} onClose={() => { setShowCreateModal(false); resetForm(); }} title="Create New Task" size="lg">
        <form onSubmit={handleCreateTask} className="space-y-4">
          <Input
            label="Task Title"
            placeholder="Enter task title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <Textarea
            label="Description"
            placeholder="Enter task details"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--foreground-secondary)] mb-1.5">
                Priority
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={priority === 'bombe'}
                  onChange={(e) => setPriority(e.target.checked ? 'bombe' : 'normal')}
                  className="w-4 h-4 rounded border-[var(--border)] text-[var(--danger)] focus:ring-[var(--primary)]"
                />
                <span className="text-sm text-[var(--foreground)]">🚨 BOMBE (Urgent)</span>
              </label>
            </div>
            <DatePicker
              label="Due Date"
              value={dueDate}
              onChange={setDueDate}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--foreground-secondary)] mb-1.5">
              Assign to Employee
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-muted)] pointer-events-none" />
              <input
                type="text"
                placeholder="Search and select employee..."
                value={employeeSearch}
                onChange={(e) => {
                  setEmployeeSearch(e.target.value);
                  setShowEmployeeDropdown(true);
                  if (!e.target.value) setAssignedTo('');
                }}
                onFocus={() => setShowEmployeeDropdown(true)}
                onBlur={() => setTimeout(() => setShowEmployeeDropdown(false), 200)}
                className="w-full pl-9 pr-3 py-2 bg-white border border-[var(--border)] rounded-lg text-[var(--foreground)] placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
              />
              {showEmployeeDropdown && (
                <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-[var(--border)] rounded-lg max-h-48 overflow-y-auto shadow-lg">
                  {filteredEmployees.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-[var(--foreground-muted)]">No employees found</div>
                  ) : (
                    filteredEmployees.map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        onMouseDown={() => {
                          setAssignedTo(e.id);
                          setEmployeeSearch(e.full_name);
                          setShowEmployeeDropdown(false);
                        }}
                        className={`w-full px-3 py-2 text-left text-sm hover:bg-[var(--background-secondary)] transition-colors ${assignedTo === e.id ? 'bg-[var(--primary)]/10 text-[var(--primary)] font-medium' : 'text-[var(--foreground)]'}`}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-[#454954] flex items-center justify-center text-white text-xs font-medium">
                            {e.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                          </div>
                          {e.full_name}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            {assignedTo && !showEmployeeDropdown && (
              <p className="mt-1 text-xs text-green-600 font-medium">
                ✓ {employees.find(e => e.id === assignedTo)?.full_name} selected
              </p>
            )}
          </div>
          
          {/* Recurring Task Selector */}
          <RecurringTaskSelector
            isRecurring={isRecurring}
            pattern={recurrencePattern}
            startDate={recurrenceStartDate}
            endDate={recurrenceEndDate}
            dayOfWeek={recurrenceDayOfWeek}
            onChange={(config) => {
              setIsRecurring(config.isRecurring);
              setRecurrencePattern(config.pattern);
              setRecurrenceStartDate(config.startDate);
              setRecurrenceEndDate(config.endDate);
              setRecurrenceDayOfWeek(config.dayOfWeek);
            }}
          />
          
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="ghost" type="button" onClick={() => { setShowCreateModal(false); resetForm(); }}>
              Cancel
            </Button>
            <Button type="submit" loading={formLoading}>
              Create Task
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Task Modal */}
      <Modal isOpen={showEditModal} onClose={() => { setShowEditModal(false); setSelectedTask(null); resetForm(); }} title="Edit Task" size="lg">
        <form onSubmit={handleUpdateTask} className="space-y-4">
          <Input
            label="Task Title"
            placeholder="Enter task title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <Textarea
            label="Description"
            placeholder="Enter task details"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--foreground-secondary)] mb-1.5">
                Priority
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={priority === 'bombe'}
                  onChange={(e) => setPriority(e.target.checked ? 'bombe' : 'normal')}
                  className="w-4 h-4 rounded border-[var(--border)] text-[var(--danger)] focus:ring-[var(--primary)]"
                />
                <span className="text-sm text-[var(--foreground)]">🚨 BOMBE</span>
              </label>
            </div>
            <Select
              label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
              options={statusOptions}
            />
            <DatePicker
              label="Due Date"
              value={dueDate}
              onChange={setDueDate}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--foreground-secondary)] mb-1.5">
              Assign to Employee
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-muted)] pointer-events-none" />
              <input
                type="text"
                placeholder="Search and select employee..."
                value={employeeSearch}
                onChange={(e) => {
                  setEmployeeSearch(e.target.value);
                  setShowEmployeeDropdown(true);
                  if (!e.target.value) setAssignedTo('');
                }}
                onFocus={() => setShowEmployeeDropdown(true)}
                onBlur={() => setTimeout(() => setShowEmployeeDropdown(false), 200)}
                className="w-full pl-9 pr-3 py-2 bg-white border border-[var(--border)] rounded-lg text-[var(--foreground)] placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
              />
              {showEmployeeDropdown && (
                <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-[var(--border)] rounded-lg max-h-48 overflow-y-auto shadow-lg">
                  {filteredEmployees.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-[var(--foreground-muted)]">No employees found</div>
                  ) : (
                    filteredEmployees.map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        onMouseDown={() => {
                          setAssignedTo(e.id);
                          setEmployeeSearch(e.full_name);
                          setShowEmployeeDropdown(false);
                        }}
                        className={`w-full px-3 py-2 text-left text-sm hover:bg-[var(--background-secondary)] transition-colors ${assignedTo === e.id ? 'bg-[var(--primary)]/10 text-[var(--primary)] font-medium' : 'text-[var(--foreground)]'}`}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-[#454954] flex items-center justify-center text-white text-xs font-medium">
                            {e.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                          </div>
                          {e.full_name}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            {assignedTo && !showEmployeeDropdown && (
              <p className="mt-1 text-xs text-green-600 font-medium">
                ✓ {employees.find(e => e.id === assignedTo)?.full_name} selected
              </p>
            )}
          </div>
          
          {/* Recurring Task Selector */}
          <RecurringTaskSelector
            isRecurring={isRecurring}
            pattern={recurrencePattern}
            startDate={recurrenceStartDate}
            endDate={recurrenceEndDate}
            dayOfWeek={recurrenceDayOfWeek}
            onChange={(config) => {
              setIsRecurring(config.isRecurring);
              setRecurrencePattern(config.pattern);
              setRecurrenceStartDate(config.startDate);
              setRecurrenceEndDate(config.endDate);
              setRecurrenceDayOfWeek(config.dayOfWeek);
            }}
          />
          
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="ghost" type="button" onClick={() => { setShowEditModal(false); setSelectedTask(null); resetForm(); }}>
              Cancel
            </Button>
            <Button type="submit" loading={formLoading}>
              Update Task
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-[var(--foreground-tertiary)]">Assigned To</p>
                <p className="font-medium">{selectedTask.assigned_to_name}</p>
              </div>
              <div>
                <p className="text-sm text-[var(--foreground-tertiary)]">Priority</p>
                <Badge variant={priorityBadgeVariant[selectedTask.priority]}>
                  {selectedTask.priority === 'bombe' ? '🚨 BOMBE' : selectedTask.priority}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-[var(--foreground-tertiary)]">Status</p>
                <StatusSelect
                  value={selectedTask.status}
                  onChange={(status) => handleStatusChange(selectedTask.id, status)}
                />
              </div>
              <div>
                <p className="text-sm text-[var(--foreground-tertiary)]">Due Date</p>
                <p className="font-medium">{selectedTask.due_date ? format(gmt(selectedTask.due_date), 'MMM d, yyyy') : 'No due date'}</p>
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

            {/* Comments Section */}
            <div className="border-t border-[var(--border)] pt-4">
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

            <div className="text-sm text-[var(--foreground-tertiary)]">
              <p>
                <MessageSquare className="w-4 h-4 inline mr-1 -mt-0.5" />
                Created {format(gmt(selectedTask.created_at), 'MMM d, yyyy')}
              </p>
              <p className="mt-0.5 pl-5 text-xs tabular-nums">
                {format(gmt(selectedTask.created_at), 'HH:mm')} · {differenceInDays(now(), new Date(selectedTask.created_at))} days ago
              </p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
