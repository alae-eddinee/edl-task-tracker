-- Enable full row data for DELETE events in realtime
-- Run this in Supabase SQL Editor

-- This makes DELETE events include all column values, not just the primary key
ALTER TABLE tasks REPLICA IDENTITY FULL;

-- Also enable for comments if needed
ALTER TABLE comments REPLICA IDENTITY FULL;

-- Verify the change
SELECT relname, relreplident 
FROM pg_class 
WHERE relname IN ('tasks', 'comments');
-- Should show 'f' (full) for relreplident
