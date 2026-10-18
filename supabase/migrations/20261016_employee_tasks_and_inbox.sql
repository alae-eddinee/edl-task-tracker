-- Employee self-created tasks + server-side notifications (inbox)
--
-- Notifications used to be built in the browser from realtime events, so anything
-- that happened while someone was offline was lost. These triggers write a row into
-- `notifications` for the task's assignee and creator whenever someone else touches it.
-- Managers are also told when an employee adds a task for themselves.

-- ============================================
-- Notifications: link to the task and the person who triggered it
-- ============================================
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS task_id UUID; -- no FK: must survive task deletion
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'task_assigned', 'status_updated', 'comment_added', 'task_completed', 'task_deleted',
  'task_updated', 'comment_deleted', 'task_added'
));

CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);

DROP POLICY IF EXISTS "Users can delete own notifications" ON notifications;
CREATE POLICY "Users can delete own notifications" ON notifications FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- Tasks: employees can add (and remove) tasks for themselves
-- ============================================
DROP POLICY IF EXISTS "Users can create tasks for themselves" ON tasks;
CREATE POLICY "Users can create tasks for themselves" ON tasks FOR INSERT TO authenticated
  WITH CHECK (assigned_to = auth.uid() AND created_by = auth.uid());

DROP POLICY IF EXISTS "Users can delete tasks they created for themselves" ON tasks;
CREATE POLICY "Users can delete tasks they created for themselves" ON tasks FOR DELETE TO authenticated
  USING (assigned_to = auth.uid() AND created_by = auth.uid());

-- ============================================
-- Notification triggers
-- ============================================
CREATE OR REPLACE FUNCTION public.profile_display_name(uid UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((SELECT full_name FROM profiles WHERE id = uid), 'Someone');
$$;

CREATE OR REPLACE FUNCTION public.notify_task_change()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  actor UUID := auth.uid();
  changes TEXT[] := '{}';
  ntype TEXT := 'task_updated';
BEGIN
  IF TG_OP = 'INSERT' THEN
    actor := COALESCE(actor, NEW.created_by);
    IF NEW.assigned_to IS DISTINCT FROM actor THEN
      INSERT INTO notifications (user_id, title, message, type, task_id, actor_id)
      VALUES (NEW.assigned_to, NEW.title, profile_display_name(actor) || ' assigned you a new task', 'task_assigned', NEW.id, actor);
    ELSIF EXISTS (SELECT 1 FROM profiles WHERE id = actor AND role = 'employee') THEN
      -- Employee added a task for themselves: let the managers know
      INSERT INTO notifications (user_id, title, message, type, task_id, actor_id)
      SELECT p.id, NEW.title, profile_display_name(actor) || ' added a task for themselves', 'task_added', NEW.id, actor
      FROM profiles p WHERE p.role = 'manager';
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Skip system updates and recurring-task rollovers (they bump created_at)
    IF actor IS NULL OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RETURN NEW;
    END IF;

    IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
      IF NEW.assigned_to IS DISTINCT FROM actor THEN
        INSERT INTO notifications (user_id, title, message, type, task_id, actor_id)
        VALUES (NEW.assigned_to, NEW.title, profile_display_name(actor) || ' assigned you a task', 'task_assigned', NEW.id, actor);
      END IF;
      IF OLD.assigned_to IS DISTINCT FROM actor THEN
        INSERT INTO notifications (user_id, title, message, type, task_id, actor_id)
        VALUES (OLD.assigned_to, OLD.title, profile_display_name(actor) || ' reassigned this task to someone else', 'task_updated', NEW.id, actor);
      END IF;
      RETURN NEW;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      changes := changes || ('changed the status to ' || CASE NEW.status
        WHEN 'todo' THEN 'To Do' WHEN 'in_progress' THEN 'In Progress' WHEN 'done' THEN 'Done' ELSE NEW.status END);
    END IF;
    IF NEW.priority IS DISTINCT FROM OLD.priority THEN
      changes := changes || CASE WHEN NEW.priority = 'bombe' THEN 'marked it as BOMBE' ELSE 'set the priority to normal' END;
    END IF;
    IF NEW.title IS DISTINCT FROM OLD.title THEN
      changes := changes || 'renamed the task'::TEXT;
    END IF;
    IF NEW.description IS DISTINCT FROM OLD.description THEN
      changes := changes || 'updated the description'::TEXT;
    END IF;
    IF NEW.due_date IS DISTINCT FROM OLD.due_date THEN
      changes := changes || CASE WHEN NEW.due_date IS NULL THEN 'removed the due date'
        ELSE 'set the due date to ' || to_char(NEW.due_date, 'Mon DD, YYYY') END;
    END IF;

    IF array_length(changes, 1) IS NULL THEN
      RETURN NEW;
    END IF;

    IF array_length(changes, 1) = 1 AND NEW.status IS DISTINCT FROM OLD.status THEN
      ntype := CASE WHEN NEW.status = 'done' THEN 'task_completed' ELSE 'status_updated' END;
    END IF;

    -- Tell the assignee and the creator, but never the person who made the change
    INSERT INTO notifications (user_id, title, message, type, task_id, actor_id)
    SELECT DISTINCT r, NEW.title, profile_display_name(actor) || ' ' || array_to_string(changes, ', '), ntype, NEW.id, actor
    FROM unnest(ARRAY[NEW.assigned_to, NEW.created_by]) AS r
    WHERE r IS NOT NULL AND r IS DISTINCT FROM actor;
    RETURN NEW;

  ELSE -- DELETE
    IF actor IS NOT NULL THEN
      INSERT INTO notifications (user_id, title, message, type, task_id, actor_id)
      SELECT DISTINCT r, OLD.title, profile_display_name(actor) || ' deleted this task', 'task_deleted', OLD.id, actor
      FROM unnest(ARRAY[OLD.assigned_to, OLD.created_by]) AS r
      WHERE r IS DISTINCT FROM actor
        AND EXISTS (SELECT 1 FROM profiles WHERE id = r); -- skip users being deleted themselves
    END IF;
    RETURN OLD;
  END IF;

EXCEPTION WHEN others THEN
  -- A notification must never block the task change itself
  RAISE WARNING 'notify_task_change failed: %', SQLERRM;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_comment_change()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  t RECORD;
  actor UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT id, title, assigned_to, created_by INTO t FROM tasks WHERE id = NEW.task_id;
    IF FOUND THEN
      INSERT INTO notifications (user_id, title, message, type, task_id, actor_id)
      SELECT DISTINCT r, t.title,
        profile_display_name(NEW.user_id) || ' commented: "' || left(NEW.content, 120) || CASE WHEN length(NEW.content) > 120 THEN '…"' ELSE '"' END,
        'comment_added', t.id, NEW.user_id
      FROM unnest(ARRAY[t.assigned_to, t.created_by]) AS r
      WHERE r IS NOT NULL AND r IS DISTINCT FROM NEW.user_id;
    END IF;
    RETURN NEW;
  ELSE -- DELETE
    actor := COALESCE(auth.uid(), OLD.user_id);
    -- When the whole task is being deleted the task row is already gone, so this is skipped
    SELECT id, title, assigned_to INTO t FROM tasks WHERE id = OLD.task_id;
    IF FOUND AND t.assigned_to IS DISTINCT FROM actor THEN
      INSERT INTO notifications (user_id, title, message, type, task_id, actor_id)
      VALUES (t.assigned_to, t.title, profile_display_name(actor) || ' deleted a comment', 'comment_deleted', t.id, actor);
    END IF;
    RETURN OLD;
  END IF;

EXCEPTION WHEN others THEN
  RAISE WARNING 'notify_comment_change failed: %', SQLERRM;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS notify_task_change ON tasks;
CREATE TRIGGER notify_task_change
  AFTER INSERT OR UPDATE OR DELETE ON tasks
  FOR EACH ROW EXECUTE FUNCTION public.notify_task_change();

DROP TRIGGER IF EXISTS notify_comment_change ON comments;
CREATE TRIGGER notify_comment_change
  AFTER INSERT OR DELETE ON comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_comment_change();

-- Old rows were never surfaced anywhere; don't dump them into everyone's unread inbox
UPDATE notifications SET read = TRUE WHERE read = FALSE AND task_id IS NULL;
