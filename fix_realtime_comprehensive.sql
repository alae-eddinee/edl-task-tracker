-- Comprehensive fix for realtime notifications
-- Run this in your Supabase SQL Editor

-- 1. Check current realtime publication status
SELECT pubname, tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime';

-- 2. Enable realtime for comments table (if not already)
-- This is safe to run even if already enabled
DO $$
BEGIN
    -- Check if comments is already in the publication
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'comments'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE comments;
        RAISE NOTICE 'Added comments to supabase_realtime publication';
    ELSE
        RAISE NOTICE 'Comments already in supabase_realtime publication';
    END IF;
END $$;

-- 3. Create a permissive RLS policy for realtime to work
-- This allows authenticated users to receive realtime events on comments
DROP POLICY IF EXISTS "Realtime comments access" ON comments;

CREATE POLICY "Realtime comments access"
ON comments FOR SELECT
TO authenticated
USING (true);  -- Allow all authenticated users to receive realtime events

-- 4. Ensure comments table exists and has proper structure
-- (This will error if table doesn't exist, which is expected)
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'comments' AND table_schema = 'public';

-- 5. Verify realtime is working by checking publication again
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
