
-- QR Codes Table
CREATE TABLE IF NOT EXISTS qr_codes (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  file_id TEXT REFERENCES files(id) ON DELETE CASCADE,
  element_id TEXT,
  path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE qr_codes ENABLE ROW LEVEL SECURITY;

-- Permissive Policy
CREATE POLICY "Public QR Access" ON qr_codes FOR ALL USING (true);
;
