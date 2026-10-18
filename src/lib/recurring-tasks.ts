'use client';

import type { RecurrencePattern, Task } from '@/types';
import { addDays, addWeeks, addMonths, format, parseISO, startOfWeek, getDay } from 'date-fns';

export interface RecurringTaskConfig {
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern;
  recurrence_start_date: string;
  recurrence_end_date?: string;
  recurrence_day_of_week?: number;
}

const GENERATION_WINDOW_DAYS = 30; // How many days ahead to always have instances for

/**
 * Generate recurring task instances based on the parent task configuration
 * If fromDate is provided, generates from that date onward (for resuming generation)
 */
export function generateRecurringTaskInstances(
  parentTask: Task,
  config: RecurringTaskConfig,
  daysToGenerate: number = GENERATION_WINDOW_DAYS,
  fromDate?: Date
): Omit<Task, 'id' | 'created_at' | 'updated_at'>[] {
  if (!config.is_recurring) return [];

  const instances: Omit<Task, 'id' | 'created_at' | 'updated_at'>[] = [];
  const startDate = fromDate || parseISO(config.recurrence_start_date);
  const endDate = config.recurrence_end_date ? parseISO(config.recurrence_end_date) : null;
  const today = new Date();
  const maxDate = addDays(today, daysToGenerate);

  let currentDate = startDate;

  while (currentDate <= maxDate && (!endDate || currentDate <= endDate)) {
    // Check if this day matches the recurrence pattern
    if (shouldCreateInstance(currentDate, config)) {
      instances.push({
        title: parentTask.title,
        description: parentTask.description,
        priority: parentTask.priority,
        status: 'todo',
        due_date: format(currentDate, 'yyyy-MM-dd'),
        assigned_to: parentTask.assigned_to,
        assigned_to_name: parentTask.assigned_to_name,
        created_by: parentTask.created_by,
        created_by_name: parentTask.created_by_name,
        updated_by: parentTask.updated_by,
        is_recurring: false, // Instances are not recurring
        parent_task_id: parentTask.id,
      });
    }

    // Move to next date based on pattern
    currentDate = getNextDate(currentDate, config.recurrence_pattern);
  }

  return instances;
}

/**
 * Calculate what instances should exist for a recurring task
 * Returns array of due dates that should have instances
 */
export function calculateExpectedInstances(
  config: RecurringTaskConfig,
  existingDueDates: string[],
  daysToGenerate: number = GENERATION_WINDOW_DAYS
): string[] {
  if (!config.is_recurring) return [];

  const expectedDates: string[] = [];
  const startDate = parseISO(config.recurrence_start_date);
  const endDate = config.recurrence_end_date ? parseISO(config.recurrence_end_date) : null;
  const today = new Date();
  const maxDate = addDays(today, daysToGenerate);

  let currentDate = startDate;

  while (currentDate <= maxDate && (!endDate || currentDate <= endDate)) {
    if (shouldCreateInstance(currentDate, config)) {
      const dateStr = format(currentDate, 'yyyy-MM-dd');
      expectedDates.push(dateStr);
    }
    currentDate = getNextDate(currentDate, config.recurrence_pattern);
  }

  return expectedDates;
}

/**
 * Find missing instance dates that need to be created
 */
export function findMissingInstanceDates(
  config: RecurringTaskConfig,
  existingDueDates: string[],
  daysToGenerate: number = GENERATION_WINDOW_DAYS
): string[] {
  const expectedDates = calculateExpectedInstances(config, existingDueDates, daysToGenerate);
  const existingSet = new Set(existingDueDates);
  return expectedDates.filter(date => !existingSet.has(date));
}

/**
 * Check if an instance should be created for a given date
 */
function shouldCreateInstance(date: Date, config: RecurringTaskConfig): boolean {
  if (config.recurrence_pattern === 'daily') {
    return true;
  }

  if (config.recurrence_pattern === 'weekly') {
    const dayOfWeek = getDay(date); // 0 = Sunday, 6 = Saturday
    return config.recurrence_day_of_week === undefined || config.recurrence_day_of_week === dayOfWeek;
  }

  if (config.recurrence_pattern === 'monthly') {
    // For monthly, we create on the same day of the month as the start date
    return true;
  }

  return false;
}

/**
 * Get the next date based on recurrence pattern
 */
function getNextDate(currentDate: Date, pattern: RecurrencePattern): Date {
  switch (pattern) {
    case 'daily':
      return addDays(currentDate, 1);
    case 'weekly':
      return addWeeks(currentDate, 1);
    case 'monthly':
      return addMonths(currentDate, 1);
    default:
      return addDays(currentDate, 1);
  }
}

/**
 * Check if a recurring task should generate new instances today
 */
export function shouldGenerateToday(task: Task): boolean {
  if (!task.is_recurring || task.parent_task_id) return false;

  const today = format(new Date(), 'yyyy-MM-dd');
  const startDate = task.recurrence_start_date;
  const endDate = task.recurrence_end_date;

  if (startDate && startDate > today) return false;
  if (endDate && endDate < today) return false;

  return true;
}

/**
 * Format recurrence pattern for display
 */
export function formatRecurrencePattern(pattern: RecurrencePattern, dayOfWeek?: number): string {
  switch (pattern) {
    case 'daily':
      return 'Daily';
    case 'weekly':
      if (dayOfWeek !== undefined) {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return `Weekly on ${days[dayOfWeek]}`;
      }
      return 'Weekly';
    case 'monthly':
      return 'Monthly';
    default:
      return pattern;
  }
}

/**
 * Generate missing instance tasks for a recurring parent task
 * Returns the tasks that need to be created
 */
export function generateMissingInstances(
  parentTask: Task,
  existingInstances: Array<{ due_date: string }>,
  daysToGenerate: number = GENERATION_WINDOW_DAYS
): Omit<Task, 'id' | 'created_at' | 'updated_at'>[] {
  if (!parentTask.is_recurring || parentTask.parent_task_id) return [];

  const existingDueDates = existingInstances.map(i => i.due_date).filter(Boolean) as string[];
  
  const missingDates = findMissingInstanceDates(
    {
      is_recurring: parentTask.is_recurring,
      recurrence_pattern: parentTask.recurrence_pattern || 'daily',
      recurrence_start_date: parentTask.recurrence_start_date || new Date().toISOString().split('T')[0],
      recurrence_end_date: parentTask.recurrence_end_date,
      recurrence_day_of_week: parentTask.recurrence_day_of_week,
    },
    existingDueDates,
    daysToGenerate
  );

  const instances: Omit<Task, 'id' | 'created_at' | 'updated_at'>[] = [];

  for (const dueDate of missingDates) {
    instances.push({
      title: parentTask.title,
      description: parentTask.description,
      priority: parentTask.priority,
      status: 'todo',
      due_date: dueDate,
      assigned_to: parentTask.assigned_to,
      created_by: parentTask.created_by,
      updated_by: parentTask.updated_by,
      is_recurring: false, // Instances are not recurring
      parent_task_id: parentTask.id,
    });
  }

  return instances;
}

/**
 * Calculate the next occurrence date for a recurring task
 */
export function calculateNextOccurrence(
  currentDueDate: string,
  pattern: RecurrencePattern,
  dayOfWeek?: number
): Date {
  const current = parseISO(currentDueDate);

  switch (pattern) {
    case 'daily':
      return addDays(current, 1);
    case 'weekly':
      // Add 7 days for weekly
      return addWeeks(current, 1);
    case 'monthly':
      return addMonths(current, 1);
    default:
      return addDays(current, 1);
  }
}
