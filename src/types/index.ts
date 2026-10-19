export type UserRole = 'admin' | 'manager' | 'employee';

export type TaskPriority = 'bombe' | 'normal';

export type TaskStatus = 'todo' | 'in_progress' | 'done';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export type RecurrencePattern = 'daily' | 'weekly' | 'monthly';

export interface Task {
  id: string;
  title: string;
  description?: string;
  priority: TaskPriority;
  status: TaskStatus;
  due_date?: string;
  assigned_to: string;
  assigned_to_name?: string;
  created_by: string;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
  updated_by?: string;
  // Recurring task fields
  is_recurring?: boolean;
  recurrence_pattern?: RecurrencePattern;
  recurrence_start_date?: string;
  recurrence_end_date?: string;
  parent_task_id?: string;
  recurrence_day_of_week?: number; // 0=Sunday, 6=Saturday
  // Set when an employee edits a task they added themselves
  edited_at?: string | null;
  edited_by?: string | null;
}

export interface Comment {
  id: string;
  task_id: string;
  user_id: string;
  user_name: string;
  content: string;
  created_at: string;
}

export type NotificationType =
  | 'task_assigned'
  | 'status_updated'
  | 'comment_added'
  | 'task_completed'
  | 'task_deleted'
  | 'task_updated'
  | 'comment_deleted'
  | 'task_added';

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: NotificationType;
  read: boolean;
  created_at: string;
  task_id?: string | null;
  actor_id?: string | null;
}

export interface OnlineUser {
  user_id: string;
  user_name: string;
  online_at: string;
}
