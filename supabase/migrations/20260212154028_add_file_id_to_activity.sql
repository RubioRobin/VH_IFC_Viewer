ALTER TABLE activity ADD COLUMN file_id uuid;
COMMENT ON COLUMN activity.file_id IS 'Specific IFC file associated with this activity (e.g. for scans)';;
