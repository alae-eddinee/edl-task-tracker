'use client';

import { PencilLine } from 'lucide-react';
import { format } from 'date-fns';
import { gmt } from '@/lib/time';
import type { Task } from '@/types';

// Only employees editing tasks they added get marked (set by the guard_task_update trigger),
// so the editor is always the assignee.
const editedText = (task: Task, viewerId?: string) => {
  const who = task.edited_by && task.edited_by === viewerId ? 'you' : task.assigned_to_name || 'the employee';
  return `Edited by ${who} on ${format(gmt(task.edited_at!), "MMM d, yyyy 'at' HH:mm")} (GMT+0)`;
};

interface EditedBadgeProps {
  task: Task;
  /** Icon only, for tight rows */
  compact?: boolean;
  /** White-on-colour styling for strong row backgrounds (e.g. BOMBE) */
  inverse?: boolean;
  viewerId?: string;
}

/** Small marker shown next to a task title when an employee changed the task after adding it */
export function EditedBadge({ task, compact, inverse, viewerId }: EditedBadgeProps) {
  if (!task.edited_at) return null;
  return (
    <span
      title={editedText(task, viewerId)}
      className={`inline-flex items-center gap-0.5 ml-1.5 px-1.5 py-0.5 rounded text-xs font-medium align-middle no-underline ${
        inverse ? 'bg-white/20 text-white' : 'bg-amber-500/15 text-amber-700'
      }`}
    >
      <PencilLine className="w-3 h-3" />
      {!compact && 'edited'}
    </span>
  );
}

/** Notice for the task details: who changed the task and when */
export function EditedNote({ task, viewerId }: { task: Task; viewerId?: string }) {
  if (!task.edited_at) return null;
  return (
    <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
      <PencilLine className="w-4 h-4 mt-0.5 shrink-0" />
      <span>{editedText(task, viewerId)}, after the task was added.</span>
    </div>
  );
}
