-- Migration: Add file attachments support
-- Run after 002_conversations.sql
-- Usage: psql -U postgres -d lawyer_chatbot -f backend/src/migrations/003_attachments.sql

BEGIN;

-- 1. Attachments table
CREATE TABLE IF NOT EXISTS attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT NOT NULL,
  ext TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attachments_user_created
  ON attachments(user_id, created_at DESC);

-- 2. Join table: message <-> attachment (many-to-many)
CREATE TABLE IF NOT EXISTS message_attachments (
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  attachment_id UUID NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
  PRIMARY KEY (message_id, attachment_id)
);

CREATE INDEX IF NOT EXISTS idx_message_attachments_message
  ON message_attachments(message_id);

CREATE INDEX IF NOT EXISTS idx_message_attachments_attachment
  ON message_attachments(attachment_id);

COMMIT;
