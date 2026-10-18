-- Create magic_links table for secure one-time login tokens
CREATE TABLE IF NOT EXISTS magic_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used BOOLEAN DEFAULT false,
  created_by UUID REFERENCES auth.users(id)
);

-- Create login_nonces table for temporary auto-login tokens
CREATE TABLE IF NOT EXISTS login_nonces (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nonce TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used BOOLEAN DEFAULT false
);

-- Enable RLS on magic_links
ALTER TABLE magic_links ENABLE ROW LEVEL SECURITY;

-- Only admins/managers can create magic links
CREATE POLICY "Allow admins to create magic links" ON magic_links
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND (profiles.role = 'admin' OR profiles.role = 'manager')
    )
  );

-- Users can only see their own magic links
CREATE POLICY "Users can view own magic links" ON magic_links
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR created_by = auth.uid());

-- Enable RLS on login_nonces
ALTER TABLE login_nonces ENABLE ROW LEVEL SECURITY;

-- No direct access to login_nonces from client - only via server
CREATE POLICY "No client access to login_nonces" ON login_nonces
  FOR ALL TO authenticated
  USING (false);

-- Create index for faster token lookups
CREATE INDEX idx_magic_links_token ON magic_links(token);
CREATE INDEX idx_login_nonces_nonce ON login_nonces(nonce);
