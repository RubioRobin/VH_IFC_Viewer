
-- Enable RLS (required for policies)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity ENABLE ROW LEVEL SECURITY;

-- Create permissive policies for Anon key (Backend uses this for now)
CREATE POLICY "Public Users Access" ON users FOR ALL USING (true);
CREATE POLICY "Public Projects Access" ON projects FOR ALL USING (true);
CREATE POLICY "Public Files Access" ON files FOR ALL USING (true);
CREATE POLICY "Public Activity Access" ON activity FOR ALL USING (true);
;
