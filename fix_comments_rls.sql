-- Fix RLS policies for comments table to allow realtime notifications
-- Run this in your Supabase SQL Editor

-- 1. Enable RLS on comments table (if not already enabled)
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies to avoid conflicts (safe to run multiple times)
DROP POLICY IF EXISTS "Allow realtime read for all authenticated" ON comments;
DROP POLICY IF EXISTS "Allow insert for authenticated" ON comments;
DROP POLICY IF EXISTS "Allow delete for comment owner" ON comments;
DROP POLICY IF EXISTS "Allow select for task participants" ON comments;

-- 3. Policy: Allow authenticated users to INSERT comments
CREATE POLICY "Allow insert for authenticated" 
ON comments FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- 4. Policy: Allow users to SELECT comments (needed for realtime)
-- This allows employees to see comments on their tasks and managers to see all
CREATE POLICY "Allow select for task participants" 
ON comments FOR SELECT 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM tasks 
    WHERE tasks.id = comments.task_id 
    AND (
      -- Employee can see comments on tasks assigned to them
      tasks.assigned_to = auth.uid() 
      -- Manager can see comments on tasks they created
      OR tasks.created_by = auth.uid()
    )
  )
  -- OR the user is the comment author (can always see their own)
  OR comments.user_id = auth.uid()
);

-- 5. Policy: Allow users to DELETE their own comments
CREATE POLICY "Allow delete for comment owner" 
ON comments FOR DELETE 
TO authenticated 
USING (user_id = auth.uid());

-- 6. Verify policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'comments';
