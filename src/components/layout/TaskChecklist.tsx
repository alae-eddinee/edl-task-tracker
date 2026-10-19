'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ListChecks, Plus, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  apiAddChecklistItem,
  apiDeleteChecklistItem,
  apiGetChecklist,
  apiUpdateChecklistItem,
  type ApiChecklistItem,
} from '@/lib/api-client';

interface TaskChecklistProps {
  taskId: string;
  /** Managers, and the employee the task is assigned to */
  canEdit: boolean;
  /** Lets the page keep its progress chips in sync */
  onProgress?: (taskId: string, items: { done: boolean }[]) => void;
}

/** Small sub-steps inside a task that can be ticked off one by one */
export function TaskChecklist({ taskId, canEdit, onProgress }: TaskChecklistProps) {
  const [items, setItems] = useState<ApiChecklistItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [newText, setNewText] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const addInputRef = useRef<HTMLInputElement>(null);
  const onProgressRef = useRef(onProgress);
  useEffect(() => { onProgressRef.current = onProgress; }, [onProgress]);

  const apply = useCallback((next: ApiChecklistItem[]) => {
    setItems(next);
    onProgressRef.current?.(taskId, next.map((i) => ({ done: i.done })));
  }, [taskId]);

  const load = useCallback(async () => {
    try {
      apply(await apiGetChecklist(taskId));
    } catch (err) {
      console.error('[checklist] load failed:', err);
    } finally {
      setLoaded(true);
    }
  }, [taskId, apply]);

  useEffect(() => {
    load();
    // Someone else ticking or adding items shows up live
    const channel = supabase
      .channel(`checklist:${taskId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_checklist_items', filter: `task_id=eq.${taskId}` }, () => load())
      .subscribe();
    return () => { channel.unsubscribe(); };
  }, [taskId, load]);

  const fail = (what: string, err: unknown) => {
    alert(`Could not ${what}: ${(err as Error).message}`);
    load();
  };

  const toggle = async (item: ApiChecklistItem) => {
    apply(items.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)));
    try {
      await apiUpdateChecklistItem(item.id, { done: !item.done });
    } catch (err) {
      fail('update the item', err);
    }
  };

  const add = async () => {
    const content = newText.trim();
    if (!content || adding) return;
    setAdding(true);
    try {
      const position = items.reduce((m, i) => Math.max(m, i.position), -1) + 1;
      const row = await apiAddChecklistItem({ task_id: taskId, content, position });
      apply([...items, row]);
      setNewText('');
      // Stay in the box so several rows can be added in a row
      addInputRef.current?.focus();
    } catch (err) {
      fail('add the item', err);
    } finally {
      setAdding(false);
    }
  };

  const saveEdit = async (item: ApiChecklistItem) => {
    const content = editText.trim();
    setEditingId(null);
    if (!content || content === item.content) return;
    apply(items.map((i) => (i.id === item.id ? { ...i, content } : i)));
    try {
      await apiUpdateChecklistItem(item.id, { content });
    } catch (err) {
      fail('rename the item', err);
    }
  };

  const remove = async (item: ApiChecklistItem) => {
    apply(items.filter((i) => i.id !== item.id));
    try {
      await apiDeleteChecklistItem(item.id);
    } catch (err) {
      fail('delete the item', err);
    }
  };

  const done = items.filter((i) => i.done).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;

  // Nothing to show to someone who can't add items
  if (loaded && items.length === 0 && !canEdit) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="flex items-center gap-2 font-semibold text-[var(--foreground)]">
          <ListChecks className="w-4 h-4 text-[var(--foreground-tertiary)]" />
          Checklist
        </h4>
        {items.length > 0 && (
          <span className={`text-xs font-medium tabular-nums ${done === items.length ? 'text-[var(--success)]' : 'text-[var(--foreground-tertiary)]'}`}>
            {done}/{items.length} done
          </span>
        )}
      </div>

      {items.length > 0 && (
        <div className="h-1.5 rounded-full bg-[var(--background-tertiary)] overflow-hidden mb-2">
          <div
            className={`h-full rounded-full transition-all ${done === items.length ? 'bg-[var(--success)]' : 'bg-[var(--info)]'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      <ul className="space-y-0.5">
        {items.map((item) => (
          <li key={item.id} className="group flex items-start gap-2.5 px-1.5 py-1 -mx-1.5 rounded-md hover:bg-[var(--hover)]">
            <button
              type="button"
              role="checkbox"
              aria-checked={item.done}
              disabled={!canEdit}
              onClick={() => toggle(item)}
              className={`mt-0.5 w-4 h-4 shrink-0 rounded border flex items-center justify-center transition-colors disabled:cursor-default ${
                item.done ? 'bg-[var(--success)] border-[var(--success)] text-white' : 'bg-white border-[var(--border-hover)] hover:border-[var(--primary)]'
              }`}
            >
              {item.done && <Check className="w-3 h-3" strokeWidth={3} />}
            </button>

            {editingId === item.id ? (
              <input
                autoFocus
                value={editText}
                maxLength={500}
                onChange={(e) => setEditText(e.target.value)}
                onBlur={() => saveEdit(item)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); saveEdit(item); }
                  if (e.key === 'Escape') setEditingId(null);
                }}
                className="flex-1 min-w-0 text-sm px-1.5 py-0.5 -my-0.5 border border-[var(--border)] rounded focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              />
            ) : (
              <span
                onClick={() => { if (canEdit) { setEditingId(item.id); setEditText(item.content); } }}
                title={canEdit ? 'Click to edit' : undefined}
                className={`flex-1 min-w-0 text-sm break-words ${canEdit ? 'cursor-text' : ''} ${
                  item.done ? 'line-through text-[var(--foreground-muted)]' : 'text-[var(--foreground)]'
                }`}
              >
                {item.content}
              </span>
            )}

            {canEdit && editingId !== item.id && (
              <button
                type="button"
                onClick={() => remove(item)}
                title="Remove item"
                className="shrink-0 p-0.5 rounded text-[var(--foreground-muted)] hover:text-[var(--danger)] sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>

      {canEdit && (
        <div className="flex items-center gap-2 mt-1.5">
          <Plus className="w-4 h-4 shrink-0 text-[var(--foreground-muted)]" />
          <input
            ref={addInputRef}
            value={newText}
            maxLength={500}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
            placeholder={items.length ? 'Add another item…' : 'Add an item…'}
            className="flex-1 min-w-0 text-sm px-2 py-1.5 bg-transparent border border-transparent rounded-md placeholder:text-[var(--foreground-muted)] hover:border-[var(--border)] focus:border-[var(--border)] focus:bg-white focus:outline-none"
          />
          {newText.trim() && (
            <button type="button" onClick={add} disabled={adding} className="shrink-0 text-xs font-medium px-2.5 py-1 rounded-md bg-[var(--primary)] text-white disabled:opacity-60">
              Add
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** "☑ 2/5" next to a task title; hidden when the task has no checklist */
export function ChecklistChip({ items, inverse }: { items?: { done: boolean }[]; inverse?: boolean }) {
  if (!items || items.length === 0) return null;
  const done = items.filter((i) => i.done).length;
  const complete = done === items.length;
  return (
    <span
      title={`Checklist: ${done} of ${items.length} done`}
      className={`inline-flex items-center gap-0.5 ml-1.5 px-1.5 py-0.5 rounded text-xs font-medium align-middle tabular-nums no-underline ${
        inverse ? 'bg-white/20 text-white' : complete ? 'bg-[#edf3ec] text-[var(--success)]' : 'bg-[var(--background-tertiary)] text-[var(--foreground-secondary)]'
      }`}
    >
      <ListChecks className="w-3 h-3" />
      {done}/{items.length}
    </span>
  );
}
