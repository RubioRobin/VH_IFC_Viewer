-- Add status column to projects table
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'status') THEN
        ALTER TABLE projects ADD COLUMN status text NOT NULL DEFAULT 'actief';
    END IF;
END $$;
