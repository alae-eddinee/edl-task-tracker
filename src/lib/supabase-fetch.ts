// Direct fetch fallback for when Supabase client hangs
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function getAuthToken(): Promise<string | null> {
  // Try multiple possible Supabase storage key formats
  const possibleKeys = [
    `sb-${SUPABASE_URL.replace('https://', '').replace(/\./g, '-')}-auth-token`,
    `sb-${SUPABASE_URL.replace('https://', '')}-auth-token`,
    'supabase.auth.token',
    'sb-auth-token',
  ];
  
  for (const key of possibleKeys) {
    try {
      const data = localStorage.getItem(key);
      if (data) {
        const parsed = JSON.parse(data);
        // Handle different storage formats
        const token = parsed?.access_token || parsed?.token || (parsed?.data?.session?.access_token);
        if (token) return token;
      }
    } catch {
      // ignore and try next key
    }
  }
  return null;
}

export async function fetchWithAuth(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    'apikey': SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

// Direct fetch implementations as fallback
export async function fetchEmployeesDirect() {
  const res = await fetchWithAuth('/profiles?select=*&role=eq.employee');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchTasksDirect() {
  const res = await fetchWithAuth('/tasks?select=*,assigned_to_name:profiles!tasks_assigned_to_fkey(full_name),created_by_name:profiles!tasks_created_by_fkey(full_name)&order=priority.desc,created_at.desc');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function insertTaskDirect(data: Record<string, unknown>) {
  const res = await fetchWithAuth('/tasks', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function updateTaskDirect(id: string, data: Record<string, unknown>) {
  const res = await fetchWithAuth(`/tasks?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  // PATCH returns 204 No Content on success, so don't try to parse JSON
  return res.status === 204 ? null : await res.json().catch(() => null);
}

export async function deleteTaskDirect(id: string) {
  const res = await fetchWithAuth(`/tasks?id=eq.${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  // DELETE returns 204 No Content on success
  return res.status === 204 ? null : await res.json().catch(() => null);
}

export async function fetchCommentsDirect(taskId: string) {
  const res = await fetchWithAuth(`/comments?select=*,user_name:profiles(full_name)&task_id=eq.${taskId}&order=created_at.asc`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function insertCommentDirect(data: { task_id: string; user_id: string; content: string }) {
  const res = await fetchWithAuth('/comments', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.status === 201 ? await res.json().catch(() => null) : null;
}
