-- Fix RLS policies for profiles table to prevent timeout issues
-- Run this in your Supabase SQL Editor

-- 1. Enable RLS on profiles table
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Allow select own profile" ON profiles;
DROP POLICY IF EXISTS "Allow select all profiles for authenticated" ON profiles;
DROP POLICY IF EXISTS "Allow update own profile" ON profiles;

-- 3. Policy: Allow authenticated users to select their own profile
CREATE POLICY "Allow select own profile"
ON profiles FOR SELECT
TO authenticated
USING (id = auth.uid());

-- 4. Policy: Allow managers to see all profiles (needed for employee list)
-- This assumes managers have role='manager' in their profile
CREATE POLICY "Allow managers to see all profiles"
ON profiles FOR SELECT
TO authenticated
USING (
  id = auth.uid() 
  OR EXISTS (
    SELECT 1 FROM profiles p 
    WHERE p.id = auth.uid() 
    AND p.role = 'manager'
  )
);

-- 5. Policy: Allow users to update their own profile
CREATE POLICY "Allow update own profile"
ON profiles FOR UPDATE
TO authenticated
USING (id = auth.uid());

-- 6. Verify policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'profiles';
