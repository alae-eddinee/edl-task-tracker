-- Lets admins look up the password a user currently has, for passwords set through the app
-- (admin create/reset, or the user's own "Change password").
--
-- Passwords are stored encrypted (AES-256-GCM) by the server; the key never reaches the
-- database. RLS is enabled with NO policies, so only server code using the service role
-- can read or write this table - not even signed-in admins can query it directly.

CREATE TABLE IF NOT EXISTS public.password_vault (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  ciphertext TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.password_vault ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.password_vault FROM anon, authenticated;
