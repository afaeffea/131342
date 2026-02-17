-- Migration: Add conversations (chat threads) support
-- Run after 001_init_schema.sql
-- Usage: psql -U postgres -d lawyer_chatbot -f backend/src/migrations/002_conversations.sql

BEGIN;

-- 1. Create conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);

-- Indexes for conversations
CREATE INDEX IF NOT EXISTS idx_conversations_user_updated
  ON conversations(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_user_active
  ON conversations(user_id, updated_at DESC) WHERE archived_at IS NULL;

-- 2. Add conversation_id to messages (nullable for migration)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'conversation_id'
  ) THEN
    ALTER TABLE messages ADD COLUMN conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 3. Migrate existing data: create a default conversation per user and link messages
DO $$
DECLARE
  u RECORD;
  conv_id INTEGER;
BEGIN
  FOR u IN SELECT DISTINCT user_id FROM messages WHERE conversation_id IS NULL
  LOOP
    -- Create a default conversation for this user
    INSERT INTO conversations (user_id, title, created_at, updated_at)
    VALUES (
      u.user_id,
      NULL,
      COALESCE(
        (SELECT MIN(created_at) FROM messages WHERE user_id = u.user_id),
        NOW()
      ),
      COALESCE(
        (SELECT MAX(created_at) FROM messages WHERE user_id = u.user_id),
        NOW()
      )
    )
    RETURNING id INTO conv_id;

    -- Set title from first user message (first 60 chars)
    UPDATE conversations
    SET title = LEFT(
      (SELECT content FROM messages
       WHERE user_id = u.user_id AND role = 'user'
       ORDER BY id ASC LIMIT 1),
      60
    )
    WHERE id = conv_id;

    -- Link all messages of this user to the default conversation
    UPDATE messages
    SET conversation_id = conv_id
    WHERE user_id = u.user_id AND conversation_id IS NULL;
  END LOOP;
END $$;

-- 4. Make conversation_id NOT NULL now that all rows have a value
-- First set any remaining NULLs (edge case: messages inserted during migration)
-- Then add the constraint
DO $$
BEGIN
  -- Only alter if column is still nullable
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages'
      AND column_name = 'conversation_id'
      AND is_nullable = 'YES'
  ) THEN
    -- Ensure no NULLs remain
    DELETE FROM messages WHERE conversation_id IS NULL;
    ALTER TABLE messages ALTER COLUMN conversation_id SET NOT NULL;
  END IF;
END $$;

-- 5. Indexes for messages by conversation
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
  ON messages(conversation_id, id ASC);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON messages(conversation_id, created_at ASC);

COMMIT;
