-- Employees can edit the tasks they added for themselves; every such edit is marked
-- (edited_at / edited_by) and managers are notified, so changes don't go unnoticed.
--
-- Also closes a gap: the "Employees can update own assigned tasks" policy had no column
-- limits, so an employee could rewrite a manager-assigned task through the API.
-- On those tasks employees may now only change the status (plus the automatic
-- recurring rollover, which moves due_date and created_at together).

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS edited_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.guard_task_update()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  actor UUID := auth.uid();
  actor_role TEXT;
  self_added BOOLEAN;
  rollover BOOLEAN := NEW.created_at IS DISTINCT FROM OLD.created_at;
  content_changed BOOLEAN;
BEGIN
  -- Server-side / system updates (service role) are not restricted
  IF actor IS NULL THEN
    RETURN NEW;
  END IF;

  -- The edit mark can only be set by this trigger, never written directly
  NEW.edited_at := OLD.edited_at;
  NEW.edited_by := OLD.edited_by;

  SELECT role INTO actor_role FROM profiles WHERE id = actor;
  IF actor_role IN ('manager', 'admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.parent_task_id IS DISTINCT FROM OLD.parent_task_id THEN
    RAISE EXCEPTION 'Employees cannot reassign tasks' USING ERRCODE = '42501';
  END IF;

  content_changed :=
       NEW.title IS DISTINCT FROM OLD.title
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW.priority IS DISTINCT FROM OLD.priority
    OR NEW.is_recurring IS DISTINCT FROM OLD.is_recurring
    OR NEW.recurrence_pattern IS DISTINCT FROM OLD.recurrence_pattern
    OR NEW.recurrence_start_date IS DISTINCT FROM OLD.recurrence_start_date
    OR NEW.recurrence_end_date IS DISTINCT FROM OLD.recurrence_end_date
    OR NEW.recurrence_day_of_week IS DISTINCT FROM OLD.recurrence_day_of_week
    OR (NEW.due_date IS DISTINCT FROM OLD.due_date AND NOT rollover);

  self_added := OLD.created_by = actor AND OLD.assigned_to = actor;

  IF content_changed THEN
    IF NOT self_added THEN
      RAISE EXCEPTION 'You can only edit tasks you added yourself' USING ERRCODE = '42501';
    END IF;
    NEW.edited_at := now();
    NEW.edited_by := actor;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_task_update ON tasks;
CREATE TRIGGER guard_task_update
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION public.guard_task_update();

-- Tell the managers what an employee changed on a task they added themselves
CREATE OR REPLACE FUNCTION public.notify_employee_task_edit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  changes TEXT[] := '{}';
BEGIN
  IF NEW.edited_at IS NOT DISTINCT FROM OLD.edited_at OR NEW.edited_by IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.title IS DISTINCT FROM OLD.title THEN
    changes := changes || ('renamed it from "' || left(OLD.title, 80) || '"');
  END IF;
  IF NEW.description IS DISTINCT FROM OLD.description THEN
    changes := changes || 'changed the description'::TEXT;
  END IF;
  IF NEW.priority IS DISTINCT FROM OLD.priority THEN
    changes := changes || CASE WHEN NEW.priority = 'bombe' THEN 'marked it as BOMBE' ELSE 'removed BOMBE' END;
  END IF;
  IF NEW.due_date IS DISTINCT FROM OLD.due_date THEN
    changes := changes || CASE WHEN NEW.due_date IS NULL THEN 'removed the due date'
      ELSE 'moved the due date to ' || to_char(NEW.due_date, 'Mon DD, YYYY') END;
  END IF;
  IF NEW.is_recurring IS DISTINCT FROM OLD.is_recurring
     OR NEW.recurrence_pattern IS DISTINCT FROM OLD.recurrence_pattern
     OR NEW.recurrence_start_date IS DISTINCT FROM OLD.recurrence_start_date
     OR NEW.recurrence_end_date IS DISTINCT FROM OLD.recurrence_end_date
     OR NEW.recurrence_day_of_week IS DISTINCT FROM OLD.recurrence_day_of_week THEN
    changes := changes || CASE WHEN NOT COALESCE(NEW.is_recurring, FALSE) THEN 'stopped it repeating'
      ELSE 'changed how it repeats' END;
  END IF;

  INSERT INTO notifications (user_id, title, message, type, task_id, actor_id)
  SELECT p.id, NEW.title,
    profile_display_name(NEW.edited_by) || ' edited a task they added: ' || array_to_string(changes, ', '),
    'task_updated', NEW.id, NEW.edited_by
  FROM profiles p WHERE p.role = 'manager';
  RETURN NEW;

EXCEPTION WHEN others THEN
  -- A notification must never block the edit itself
  RAISE WARNING 'notify_employee_task_edit failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_employee_task_edit ON tasks;
CREATE TRIGGER notify_employee_task_edit
  AFTER UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION public.notify_employee_task_edit();
