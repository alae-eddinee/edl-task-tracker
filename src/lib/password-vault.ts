// Server-only: encrypted storage of passwords set through the app, so admins can look them up.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

// Derived from the service role key (already a server-only secret), so no extra setting is needed.
// Note: rotating the service role key makes previously stored passwords unreadable.
function key(): Buffer {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return Buffer.from(hkdfSync('sha256', secret, 'edl-task-tracker', 'password-vault-v1', 32));
}

export function encryptPassword(password: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

export function decryptPassword(payload: string): string {
  const [version, iv, tag, data] = payload.split(':');
  if (version !== 'v1') throw new Error('Unknown vault format');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

/** Best effort: a vault failure must never block the password change itself. */
export async function rememberPassword(supabase: SupabaseClient, userId: string, password: string) {
  try {
    const { error } = await supabase
      .from('password_vault')
      .upsert({ user_id: userId, ciphertext: encryptPassword(password), updated_at: new Date().toISOString() });
    if (error) console.error('[password-vault] store failed:', error.message);
  } catch (err) {
    console.error('[password-vault] store failed:', err);
  }
}

export async function lookupPassword(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await supabase.from('password_vault').select('ciphertext').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? decryptPassword(data.ciphertext) : null;
}
