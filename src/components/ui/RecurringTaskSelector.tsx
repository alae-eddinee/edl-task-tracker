'use client';

import { useState } from 'react';
import type { RecurrencePattern } from '@/types';
import { formatRecurrencePattern } from '@/lib/recurring-tasks';
import { Repeat } from 'lucide-react';
import { DatePicker } from './DatePicker';

interface RecurringTaskSelectorProps {
  isRecurring: boolean;
  pattern: RecurrencePattern;
  startDate: string;
  endDate?: string;
  dayOfWeek?: number;
  onChange: (config: {
    isRecurring: boolean;
    pattern: RecurrencePattern;
    startDate: string;
    endDate?: string;
    dayOfWeek?: number;
  }) => void;
}

const patterns: RecurrencePattern[] = ['daily', 'weekly', 'monthly'];

const daysOfWeek = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

export function RecurringTaskSelector({
  isRecurring,
  pattern,
  startDate,
  endDate,
  dayOfWeek,
  onChange,
}: RecurringTaskSelectorProps) {
  const [showOptions, setShowOptions] = useState(isRecurring);

  const handleToggleRecurring = () => {
    const newValue = !isRecurring;
    setShowOptions(newValue);
    if (!newValue) {
      onChange({
        isRecurring: false,
        pattern: 'daily',
        startDate: startDate || new Date().toISOString().split('T')[0],
      });
    } else {
      onChange({
        isRecurring: true,
        pattern,
        startDate: startDate || new Date().toISOString().split('T')[0],
        endDate,
        dayOfWeek,
      });
    }
  };

  return (
    <div className="space-y-3">
      {/* Toggle Button */}
      <button
        type="button"
        onClick={handleToggleRecurring}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
          isRecurring
            ? 'bg-[var(--primary)]/10 border-[var(--primary)] text-[var(--primary)]'
            : 'bg-[var(--background)] border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--background-secondary)]'
        }`}
      >
        <Repeat className="w-4 h-4" />
        <span className="text-sm font-medium">
          {isRecurring ? 'Recurring Task' : 'Make Recurring'}
        </span>
        {isRecurring && (
          <span className="ml-2 text-xs bg-[var(--primary)] text-white px-2 py-0.5 rounded-full">
            {formatRecurrencePattern(pattern, dayOfWeek)}
          </span>
        )}
      </button>

      {/* Options Panel */}
      {showOptions && isRecurring && (
        <div className="p-4 bg-[var(--background-secondary)] rounded-lg border border-[var(--border)] space-y-4">
          {/* Pattern Selection */}
          <div>
            <label className="block text-sm font-medium text-[var(--foreground-secondary)] mb-2">
              Repeat
            </label>
            <div className="flex gap-2 flex-wrap">
              {patterns.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() =>
                    onChange({
                      isRecurring: true,
                      pattern: p,
                      startDate,
                      endDate,
                      dayOfWeek,
                    })
                  }
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    pattern === p
                      ? 'bg-[var(--primary)] text-white'
                      : 'bg-[var(--background)] text-[var(--foreground)] border border-[var(--border)] hover:bg-[var(--background-tertiary)]'
                  }`}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Day of Week (for weekly pattern) */}
          {pattern === 'weekly' && (
            <div>
              <label className="block text-sm font-medium text-[var(--foreground-secondary)] mb-2">
                On day
              </label>
              <div className="flex gap-1 flex-wrap">
                {daysOfWeek.map((day) => (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() =>
                      onChange({
                        isRecurring: true,
                        pattern,
                        startDate,
                        endDate,
                        dayOfWeek: day.value,
                      })
                    }
                    className={`w-10 h-10 rounded-md text-xs font-medium transition-colors ${
                      dayOfWeek === day.value
                        ? 'bg-[var(--primary)] text-white'
                        : 'bg-[var(--background)] text-[var(--foreground)] border border-[var(--border)] hover:bg-[var(--background-tertiary)]'
                    }`}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Start Date */}
          <DatePicker
            label="Start Date"
            value={startDate}
            clearable={false}
            onChange={(value) =>
              onChange({
                isRecurring: true,
                pattern,
                startDate: value,
                endDate,
                dayOfWeek,
              })
            }
          />

          {/* End Date (optional) */}
          <div>
            <DatePicker
              label="End Date (optional)"
              value={endDate || ''}
              placeholder="Never"
              onChange={(value) =>
                onChange({
                  isRecurring: true,
                  pattern,
                  startDate,
                  endDate: value || undefined,
                  dayOfWeek,
                })
              }
            />
            <p className="mt-1 text-xs text-[var(--foreground-tertiary)]">
              Leave empty to repeat indefinitely
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
