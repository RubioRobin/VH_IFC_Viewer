-- Add email and avatar_url columns to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS email VARCHAR(255),
ADD COLUMN IF NOT EXISTS avatar_url TEXT;
