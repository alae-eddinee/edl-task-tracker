-- Fix tasks RLS for realtime notifications
-- Run this in Supabase SQL Editor

-- 1. Check current tasks RLS policies
SELECT policyname, cmd, qual 
FROM pg_policies 
WHERE tablename = 'tasks';

-- 2. Create a permissive SELECT policy for realtime to work
-- This allows authenticated users to receive realtime events on tasks
DROP POLICY IF EXISTS "Tasks select for realtime" ON tasks;

CREATE POLICY "Tasks select for realtime"
ON tasks FOR SELECT
TO authenticated
USING (true);

-- 3. Verify the policy was created
SELECT policyname, permissive, cmd, qual 
FROM pg_policies 
WHERE tablename = 'tasks';
