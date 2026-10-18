-- Verify and fix task deletion notifications
-- Run this in Supabase SQL Editor

-- 1. Check if tasks table is in realtime publication
SELECT * FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' AND tablename = 'tasks';

-- 2. Add tasks to realtime publication if not present
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'tasks'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
        RAISE NOTICE 'Added tasks to supabase_realtime publication';
    ELSE
        RAISE NOTICE 'tasks already in supabase_realtime publication';
    END IF;
END $$;

-- 3. Verify RLS on tasks table allows SELECT for realtime
-- Check current policies
SELECT policyname, cmd, qual 
FROM pg_policies 
WHERE tablename = 'tasks';

-- 4. If no SELECT policy exists, create a permissive one for realtime
-- (Only run this if you confirmed tasks RLS is blocking)
-- CREATE POLICY "Tasks select for realtime" ON tasks FOR SELECT TO authenticated USING (true);
