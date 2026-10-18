-- Remove the recurring task trigger that's causing infinite task creation
DROP TRIGGER IF EXISTS generate_recurring_instances ON tasks;
DROP FUNCTION IF EXISTS generate_recurring_task_instances();
