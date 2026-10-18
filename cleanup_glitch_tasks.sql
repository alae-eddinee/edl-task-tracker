-- Delete all tasks created by the recurring task glitch
-- This removes all child instances (tasks with parent_task_id) and duplicate recurring tasks

-- First, delete all child instances (tasks with parent_task_id)
DELETE FROM tasks WHERE parent_task_id IS NOT NULL;

-- Optional: If you have many duplicate parent recurring tasks with the same title,
-- keep only one of each and delete the rest.
-- Uncomment and modify the query below if needed:

-- WITH duplicates AS (
--   SELECT id,
--          ROW_NUMBER() OVER (PARTITION BY title, assigned_to, created_by 
--                            ORDER BY created_at ASC) as rn
--   FROM tasks
--   WHERE is_recurring = true
-- )
-- DELETE FROM tasks WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);
