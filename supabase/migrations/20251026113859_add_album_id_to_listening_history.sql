-- Add album_id column to listening_history table
ALTER TABLE public.listening_history
ADD COLUMN IF NOT EXISTS album_id TEXT;