-- Migration: Create admin_notifications table
-- Description: Unifies admin alerts for messages and quiz submissions.

CREATE TABLE IF NOT EXISTS admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('message', 'quiz_submission', 'system')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  entity_id TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE admin_notifications ENABLE ROW LEVEL SECURITY;

-- Policy for ops users (admins) to see all notifications
DROP POLICY IF EXISTS "Enable read for ops users" ON admin_notifications;
CREATE POLICY "Enable read for ops users" ON admin_notifications
  FOR SELECT TO authenticated
  USING (public.is_ops_user());

-- Policy for service role to insert
DROP POLICY IF EXISTS "Service role can insert" ON admin_notifications;
CREATE POLICY "Service role can insert" ON admin_notifications
  FOR INSERT TO service_role
  WITH CHECK (true);
