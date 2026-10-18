'use client';

import { useCallback, useRef, useState } from 'react';
import {
  addDays,
  addMonths,
  format,
  isSameDay,
  isSameMonth,
  nextMonday,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { FloatingPanel } from './FloatingPanel';

interface DatePickerProps {
  /** 'yyyy-MM-dd' or '' */
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  /** Show the clear (x) button when a date is set */
  clearable?: boolean;
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const POPOVER_WIDTH = 272;

// Parse as a local date: new Date('2026-10-17') would be UTC midnight and can shift a day
function parseValue(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

const toValue = (date: Date) => format(date, 'yyyy-MM-dd');

export function DatePicker({ value, onChange, label, placeholder = 'Empty', clearable = true }: DatePickerProps) {
  const selected = parseValue(value);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => startOfMonth(selected ?? new Date()));
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);

  const openPicker = () => {
    setMonth(startOfMonth(selected ?? new Date()));
    setOpen(true);
  };

  const pick = (date: Date | null) => {
    onChange(date ? toValue(date) : '');
    setOpen(false);
  };

  const today = new Date();
  const gridStart = startOfWeek(month, { weekStartsOn: 1 });
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  const quickPicks = [
    { label: 'Today', date: today },
    { label: 'Tomorrow', date: addDays(today, 1) },
    { label: 'Next week', date: nextMonday(today) },
  ];

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-[var(--foreground-secondary)] mb-1.5">{label}</label>
      )}
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => (open ? setOpen(false) : openPicker())}
          className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm bg-white border rounded-md transition-colors
            ${open
              ? 'border-[var(--primary)] ring-[3px] ring-[var(--primary)]/15'
              : 'border-[var(--border)] hover:border-[var(--border-hover)]'}`}
        >
          <Calendar className="w-4 h-4 shrink-0 text-[var(--foreground-tertiary)]" />
          <span className={selected ? 'text-[var(--foreground)]' : 'text-[var(--foreground-muted)]'}>
            {selected ? format(selected, 'MMM d, yyyy') : placeholder}
          </span>
        </button>
        {clearable && selected && (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="Clear date"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-[var(--hover)]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <FloatingPanel
        anchorRef={triggerRef}
        open={open}
        onClose={close}
        width={POPOVER_WIDTH}
        estimatedHeight={360}
        ariaLabel="Choose a date"
        className="p-2"
      >
          <div className="flex flex-wrap gap-1 pb-2 mb-1 border-b border-[var(--border)]">
            {quickPicks.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => pick(q.date)}
                className="px-2 py-1 rounded text-xs font-medium text-[var(--foreground-secondary)] hover:bg-[var(--hover)] hover:text-[var(--foreground)] transition-colors"
              >
                {q.label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between px-1 py-1.5">
            <span className="text-sm font-semibold text-[var(--foreground)]">{format(month, 'MMMM yyyy')}</span>
            <div className="flex items-center">
              <button
                type="button"
                onClick={() => setMonth((m) => addMonths(m, -1))}
                aria-label="Previous month"
                className="p-1 rounded text-[var(--foreground-tertiary)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setMonth(startOfMonth(new Date()))}
                className="px-1.5 py-0.5 rounded text-xs font-medium text-[var(--foreground-tertiary)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setMonth((m) => addMonths(m, 1))}
                aria-label="Next month"
                className="p-1 rounded text-[var(--foreground-tertiary)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {WEEKDAYS.map((d) => (
              <div key={d} className="h-7 flex items-center justify-center text-[11px] font-medium text-[var(--foreground-muted)]">
                {d}
              </div>
            ))}
            {days.map((day) => {
              const isSelected = selected && isSameDay(day, selected);
              const isToday = isSameDay(day, today);
              const inMonth = isSameMonth(day, month);
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => pick(day)}
                  className={`h-8 rounded-md text-sm tabular-nums transition-colors
                    ${isSelected
                      ? 'bg-[var(--primary)] text-white font-medium'
                      : isToday
                        ? 'text-[var(--foreground)] font-semibold ring-1 ring-inset ring-[var(--border-hover)] hover:bg-[var(--hover)]'
                        : inMonth
                          ? 'text-[var(--foreground)] hover:bg-[var(--hover)]'
                          : 'text-[var(--foreground-muted)] hover:bg-[var(--hover)]'}`}
                >
                  {format(day, 'd')}
                </button>
              );
            })}
          </div>

          {clearable && (
            <div className="mt-1 pt-1 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={() => pick(null)}
                className="w-full text-left px-2 py-1.5 rounded text-sm text-[var(--foreground-tertiary)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
              >
                Clear
              </button>
            </div>
          )}
      </FloatingPanel>
    </div>
  );
}
