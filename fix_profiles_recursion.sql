-- Fix the infinite recursion in profiles RLS
-- Run this in Supabase SQL Editor

-- 1. Drop the problematic policies
DROP POLICY IF EXISTS "Allow select own profile" ON profiles;
DROP POLICY IF EXISTS "Allow managers to see all profiles" ON profiles;
DROP POLICY IF EXISTS "Allow update own profile" ON profiles;

-- 2. Create a simple non-recursive policy
-- Allow users to see their own profile
CREATE POLICY "Users see own profile"
ON profiles FOR SELECT
TO authenticated
USING (id = auth.uid());

-- 3. Create a separate policy for role-based access using a subquery that doesn't recurse
-- This uses auth.jwt() to get the role from the JWT token instead of querying profiles
CREATE POLICY "Managers see all profiles"
ON profiles FOR SELECT
TO authenticated
USING (
  id = auth.uid() 
  OR (auth.jwt() ->> 'role') = 'manager'
  OR EXISTS (
    SELECT 1 FROM auth.users 
    WHERE auth.users.id = auth.uid() 
    AND auth.users.raw_user_meta_data->>'role' = 'manager'
  )
);

-- 4. Update policy
CREATE POLICY "Users update own profile"
ON profiles FOR UPDATE
TO authenticated
USING (id = auth.uid());

-- 5. Verify
SELECT policyname, permissive, cmd, qual 
FROM pg_policies 
WHERE tablename = 'profiles';
