import { createFreshClient } from '@/lib/supabase';

const DEFAULT_TIMEOUT = 8000;

export function withTimeout<T>(
  promise: PromiseLike<T>,
  timeoutMs = DEFAULT_TIMEOUT,
  context = 'supabase'
): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`${context} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }),
  ]);
}

export async function insertTask(data: {
  title: string;
  description: string | null;
  priority: 'bombe' | 'normal';
  due_date: string | null;
  assigned_to: string;
  created_by: string;
  status: 'todo';
}) {
  const client = createFreshClient();
  return withTimeout(
    client.from('tasks').insert(data),
    5000,
    'insertTask'
  );
}

export async function updateTask(
  id: string,
  data: {
    title: string;
    description: string | null;
    priority: 'bombe' | 'normal';
    due_date: string | null;
    assigned_to: string;
  }
) {
  const client = createFreshClient();
  return withTimeout(
    client.from('tasks').update(data).eq('id', id),
    5000,
    'updateTask'
  );
}

export async function deleteTask(id: string) {
  const client = createFreshClient();
  return withTimeout(
    client.from('tasks').delete().eq('id', id),
    5000,
    'deleteTask'
  );
}

export async function insertNotification(data: {
  user_id: string;
  title: string;
  message: string;
  type: string;
}) {
  const client = createFreshClient();
  return withTimeout(
    client.from('notifications').insert(data),
    8000,
    'insertNotification'
  );
}

export async function fetchTasks() {
  const client = createFreshClient();
  return withTimeout(
    client
      .from('tasks')
      .select(`
        *,
        assigned_to_name:profiles!tasks_assigned_to_fkey(full_name),
        created_by_name:profiles!tasks_created_by_fkey(full_name)
      `)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false }),
    10000,
    'fetchTasks'
  );
}

export async function fetchEmployees() {
  const client = createFreshClient();
  return withTimeout(
    client.from('profiles').select('*').eq('role', 'employee'),
    5000,
    'fetchEmployees'
  );
}
