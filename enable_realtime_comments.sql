-- Enable Realtime for the comments table
-- Run this in your Supabase SQL Editor

-- 1. First, check if the comments table is already in the realtime publication
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'comments';

-- 2. If not enabled, add the comments table to the realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE comments;

-- 3. Verify it was added
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';

-- Alternative: If you need to create the publication from scratch (rarely needed)
-- CREATE PUBLICATION supabase_realtime FOR TABLE comments, tasks;
