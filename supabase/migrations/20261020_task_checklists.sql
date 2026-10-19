-- Checklists inside tasks: small sub-steps that can be ticked off one by one.
--
-- Managers/admins can manage the checklist of any task; employees can manage the
-- checklist of tasks assigned to them. Items go away with their task, sync live
-- (realtime), and are unticked again when a recurring task rolls over to its next occurrence.

CREATE TABLE IF NOT EXISTS task_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (length(btrim(content)) BETWEEN 1 AND 500),
  done BOOLEAN NOT NULL DEFAULT FALSE,
  position INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  done_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  done_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_checklist_task ON task_checklist_items(task_id, position);

ALTER TABLE task_checklist_items ENABLE ROW LEVEL SECURITY;

-- Who may change a task's checklist
CREATE OR REPLACE FUNCTION public.can_edit_task_checklist(tid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('manager', 'admin'))
      OR EXISTS (SELECT 1 FROM tasks WHERE id = tid AND assigned_to = auth.uid());
$$;

DROP POLICY IF EXISTS "Checklist items are visible to signed-in users" ON task_checklist_items;
CREATE POLICY "Checklist items are visible to signed-in users" ON task_checklist_items
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Task workers can add checklist items" ON task_checklist_items;
CREATE POLICY "Task workers can add checklist items" ON task_checklist_items
  FOR INSERT TO authenticated WITH CHECK (public.can_edit_task_checklist(task_id));

DROP POLICY IF EXISTS "Task workers can update checklist items" ON task_checklist_items;
CREATE POLICY "Task workers can update checklist items" ON task_checklist_items
  FOR UPDATE TO authenticated
  USING (public.can_edit_task_checklist(task_id))
  WITH CHECK (public.can_edit_task_checklist(task_id));

DROP POLICY IF EXISTS "Task workers can delete checklist items" ON task_checklist_items;
CREATE POLICY "Task workers can delete checklist items" ON task_checklist_items
  FOR DELETE TO authenticated USING (public.can_edit_task_checklist(task_id));

-- Record who ticked an item and when; items can't be moved to another task
CREATE OR REPLACE FUNCTION public.stamp_checklist_item()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.task_id IS DISTINCT FROM OLD.task_id THEN
    RAISE EXCEPTION 'Checklist items cannot be moved to another task' USING ERRCODE = '42501';
  END IF;
  IF NEW.done AND (TG_OP = 'INSERT' OR NOT OLD.done) THEN
    NEW.done_by := auth.uid();
    NEW.done_at := now();
  ELSIF NOT NEW.done THEN
    NEW.done_by := NULL;
    NEW.done_at := NULL;
  ELSE
    NEW.done_by := OLD.done_by;
    NEW.done_at := OLD.done_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stamp_checklist_item ON task_checklist_items;
CREATE TRIGGER stamp_checklist_item
  BEFORE INSERT OR UPDATE ON task_checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.stamp_checklist_item();

-- A recurring task rolling over (created_at moves forward) starts with a fresh checklist
CREATE OR REPLACE FUNCTION public.reset_checklist_on_rollover()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.is_recurring AND NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    UPDATE task_checklist_items SET done = FALSE WHERE task_id = NEW.id AND done;
  END IF;
  RETURN NEW;
EXCEPTION WHEN others THEN
  RAISE WARNING 'reset_checklist_on_rollover failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reset_checklist_on_rollover ON tasks;
CREATE TRIGGER reset_checklist_on_rollover
  AFTER UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION public.reset_checklist_on_rollover();

-- Live updates in every open dashboard
ALTER TABLE task_checklist_items REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'task_checklist_items') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE task_checklist_items;
  END IF;
END $$;
