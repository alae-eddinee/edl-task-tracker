-- Delete only tasks created today by the recurring task glitch
-- This targets tasks created on the current day only

DELETE FROM tasks 
WHERE parent_task_id IS NOT NULL 
  AND DATE(created_at) = CURRENT_DATE;

-- Also delete any duplicate parent recurring tasks created today
DELETE FROM tasks 
WHERE is_recurring = true 
  AND parent_task_id IS NULL
  AND DATE(created_at) = CURRENT_DATE;
