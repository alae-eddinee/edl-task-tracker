'use client';

import { useState } from 'react';
import { Pencil, Repeat, Trash2 } from 'lucide-react';
import { format, startOfDay } from 'date-fns';
import { Button, Card, EditedBadge, StatusPill, StatusSelect } from '@/components/ui';
import { formatRecurrencePattern } from '@/lib/recurring-tasks';
import { gmt, now } from '@/lib/time';
import type { RecurrencePattern, Task, TaskStatus } from '@/types';

type Filter = 'all' | RecurrencePattern;

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
];

interface RecurringTasksProps {
  /** Every task the viewer can see; only the recurring ones are listed */
  tasks: Task[];
  onOpen: (task: Task) => void;
  /** Manager view: show who the task is assigned to */
  showAssignee?: boolean;
  /** Employee view: change status inline (otherwise a read-only pill) */
  onStatusChange?: (taskId: string, status: TaskStatus) => void;
  mutatingIds?: Set<string>;
  onEdit?: (task: Task) => void;
  onDelete?: (taskId: string) => void;
}

const patternOf = (t: Task): RecurrencePattern => t.recurrence_pattern || 'daily';

const isDone = (t: Task) => t.status === 'done';

// Same treatment as the Tasks tab: done rows are faded, greyed and struck through
const struck = (t: Task) => (isDone(t) ? 'line-through text-gray-400' : '');

const isOverdue = (t: Task) =>
  !!t.due_date && t.status !== 'done' && startOfDay(gmt(t.due_date)) < startOfDay(gmt(now()));

/** All recurring tasks (daily, weekly and monthly) in one place, soonest occurrence first */
export function RecurringTasks({ tasks, onOpen, showAssignee, onStatusChange, mutatingIds, onEdit, onDelete }: RecurringTasksProps) {
  const [filter, setFilter] = useState<Filter>('all');

  const recurring = tasks
    .filter((t) => t.is_recurring)
    .sort((a, b) => {
      // Done tasks go to the bottom, like the other task lists
      if (a.status === 'done' && b.status !== 'done') return 1;
      if (b.status === 'done' && a.status !== 'done') return -1;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    });
  const visible = filter === 'all' ? recurring : recurring.filter((t) => patternOf(t) === filter);
  const count = (f: Filter) => (f === 'all' ? recurring.length : recurring.filter((t) => patternOf(t) === f).length);

  const status = (task: Task) =>
    onStatusChange ? (
      <StatusSelect
        value={task.status}
        onChange={(s) => onStatusChange(task.id, s)}
        disabled={mutatingIds?.has(task.id)}
        size="sm"
      />
    ) : (
      <StatusPill status={task.status} />
    );

  const frequency = (task: Task) => (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-[var(--primary)]/10 text-[var(--primary)] whitespace-nowrap">
      <Repeat className="w-3 h-3" />
      {formatRecurrencePattern(patternOf(task), task.recurrence_day_of_week ?? undefined)}
    </span>
  );

  const due = (task: Task) =>
    task.due_date ? (
      <span className={isOverdue(task) ? 'text-[var(--danger)] font-medium' : ''}>
        {format(gmt(task.due_date), 'EEE, MMM d')}
      </span>
    ) : (
      <span className="text-[var(--foreground-muted)]">–</span>
    );

  const actions = (task: Task, compact = false) =>
    (onEdit || onDelete) && (
      <div className="flex items-center justify-end gap-2">
        {onEdit && (
          <Button variant="ghost" size="sm" className={compact ? 'p-1.5' : 'p-2'} title="Edit task" onClick={(e) => { e.stopPropagation(); onEdit(task); }}>
            <Pencil className="w-4 h-4" />
          </Button>
        )}
        {onDelete && (
          <Button variant="danger" size="sm" className={compact ? 'p-1.5' : 'p-2'} title="Delete task" onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}>
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>
    );

  const titleClass = (task: Task) =>
    isDone(task)
      ? 'line-through text-gray-400'
      : task.priority === 'bombe' ? 'text-red-600 font-bold' : 'text-[var(--foreground)]';

  return (
    <Card padding="none" className="overflow-hidden">
      {/* Frequency filter */}
      <div className="flex flex-wrap items-center gap-1 px-3 sm:px-4 py-3 border-b border-[var(--border)] bg-[var(--background-tertiary)]">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              filter === f.key
                ? 'bg-white text-[var(--foreground)] shadow-sm'
                : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
            }`}
          >
            {f.label}
            <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-xs bg-[var(--border)] text-[var(--foreground-secondary)]">{count(f.key)}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="px-4 py-12 text-center">
          <Repeat className="w-8 h-8 mx-auto mb-2 text-[var(--foreground-muted)]" />
          <p className="text-sm text-[var(--foreground-tertiary)]">
            {recurring.length === 0 ? 'No recurring tasks yet. Turn on “Recurring task” when creating a task.' : 'No recurring tasks with this frequency.'}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="bg-[var(--background-tertiary)] border-b border-[var(--border)]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--foreground-secondary)] uppercase">Task</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--foreground-secondary)] uppercase">Frequency</th>
                  {showAssignee && <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--foreground-secondary)] uppercase">Assigned</th>}
                  <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--foreground-secondary)] uppercase">Next due</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-[var(--foreground-secondary)] uppercase">Status</th>
                  {(onEdit || onDelete) && <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--foreground-secondary)] uppercase">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {visible.map((task) => (
                  <tr
                    key={task.id}
                    onClick={() => onOpen(task)}
                    className={`cursor-pointer transition-colors ${
                      isDone(task)
                        ? 'opacity-50 bg-gray-50 hover:bg-gray-100'
                        : task.priority === 'bombe' ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-[var(--background-secondary)]'
                    }`}
                  >
                    <td className="px-4 py-3">
                      <p className={`font-medium ${titleClass(task)}`}>{task.title}<EditedBadge task={task} /></p>
                      {task.recurrence_end_date && (
                        <p className="text-xs text-[var(--foreground-tertiary)]">Until {format(gmt(task.recurrence_end_date), 'MMM d, yyyy')}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">{frequency(task)}</td>
                    {showAssignee && <td className={`px-4 py-3 text-sm ${struck(task) || 'text-[var(--foreground-secondary)]'}`}>{task.assigned_to_name || 'Unknown'}</td>}
                    <td className={`px-4 py-3 text-sm text-center ${struck(task) || 'text-[var(--foreground-secondary)]'}`}>{due(task)}</td>
                    <td className="px-4 py-3 text-center">{status(task)}</td>
                    {(onEdit || onDelete) && <td className="px-4 py-3">{actions(task)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden divide-y divide-[var(--border)]">
            {visible.map((task) => (
              <div
                key={task.id}
                onClick={() => onOpen(task)}
                className={`p-3 cursor-pointer ${
                  isDone(task) ? 'opacity-60 bg-gray-50' : task.priority === 'bombe' ? 'bg-red-50' : 'bg-[var(--background)]'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className={`font-medium text-sm leading-tight ${titleClass(task)}`}>{task.title}<EditedBadge task={task} compact /></p>
                    {showAssignee && <p className={`text-xs ${struck(task) || 'text-[var(--foreground-tertiary)]'}`}>{task.assigned_to_name || 'Unknown'}</p>}
                  </div>
                  {actions(task, true)}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {frequency(task)}
                  {status(task)}
                  <span className={`ml-auto px-2 py-1 rounded bg-gray-100 ${struck(task) || 'text-gray-600'}`}>{due(task)}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
