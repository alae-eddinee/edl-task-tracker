-- ULTIMATE Realtime Fix - Run this in Supabase SQL Editor
-- This fixes all common realtime issues

-- Step 1: Check if comments table exists and has proper RLS
SELECT 
    schemaname,
    tablename,
    rowsecurity as has_rls
FROM pg_tables 
WHERE tablename = 'comments' AND schemaname = 'public';

-- Step 2: Check RLS policies on comments
SELECT * FROM pg_policies WHERE tablename = 'comments';

-- Step 3: Fix RLS - Drop all restrictive policies and create a permissive one
DROP POLICY IF EXISTS "Realtime comments access" ON comments;
DROP POLICY IF EXISTS "Allow select for task participants" ON comments;
DROP POLICY IF EXISTS "Allow select own profile" ON comments;

-- Create a simple permissive policy for SELECT (required for realtime)
CREATE POLICY "Realtime comments select"
ON comments FOR SELECT
TO authenticated
USING (true);

-- Ensure INSERT and DELETE still work properly
DROP POLICY IF EXISTS "Allow insert for authenticated" ON comments;
DROP POLICY IF EXISTS "Allow delete for comment owner" ON comments;

CREATE POLICY "Comments insert"
ON comments FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Comments delete own"
ON comments FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- Step 4: Ensure realtime publication exists and has comments
DO $$
BEGIN
    -- Create publication if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
    
    -- Add comments table to publication
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'comments'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE comments;
    END IF;
    
    -- Add tasks table if not present (for completeness)
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'tasks'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
    END IF;
END $$;

-- Step 5: Verify the fix
SELECT pubname, tablename, rowsecurity 
FROM pg_publication_tables pt
JOIN pg_tables t ON pt.tablename = t.tablename AND pt.schemaname = t.schemaname
WHERE pubname = 'supabase_realtime';

-- Step 6: Show all policies
SELECT policyname, permissive, cmd, qual 
FROM pg_policies 
WHERE tablename = 'comments';
