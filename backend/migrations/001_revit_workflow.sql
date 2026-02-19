-- Migration: 001_revit_workflow.sql
-- Description: Sets up the data model for Revit IFC export, sharing, and QR code placement.

-- 1. Clean up existing tables if they exist (to handle schema changes during development)
DROP TABLE IF EXISTS sheets_link CASCADE;
DROP TABLE IF EXISTS qr_assets CASCADE;
DROP TABLE IF EXISTS shares CASCADE;
DROP TABLE IF EXISTS model_versions CASCADE;
DROP TABLE IF EXISTS models CASCADE;

-- 2. Ensure projects table has code/slug
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='code') THEN
        ALTER TABLE projects ADD COLUMN code TEXT;
    END IF;
END $$;

-- 2. Models table
CREATE TABLE IF NOT EXISTS models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by TEXT DEFAULT 'plugin'
);

-- 3. Model Versions table
CREATE TABLE IF NOT EXISTS model_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id UUID REFERENCES models(id) ON DELETE CASCADE,
    storage_path_ifc TEXT NOT NULL,
    file_size BIGINT,
    checksum_sha256 TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Shares table
CREATE TABLE IF NOT EXISTS shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_version_id UUID REFERENCES model_versions(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    last_accessed_at TIMESTAMPTZ
);

-- 5. QR Assets table
CREATE TABLE IF NOT EXISTS qr_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    model_version_id UUID REFERENCES model_versions(id) ON DELETE CASCADE,
    storage_path_png TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Sheets Link (Optional but recommended)
CREATE TABLE IF NOT EXISTS sheets_link (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_version_id UUID REFERENCES model_versions(id) ON DELETE CASCADE,
    revit_sheet_unique_id TEXT,
    revit_view_unique_id TEXT,
    placed_at TIMESTAMPTZ DEFAULT now(),
    placement_info_json JSONB
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_models_project_id ON models(project_id);
CREATE INDEX IF NOT EXISTS idx_model_versions_model_id ON model_versions(model_id);
CREATE INDEX IF NOT EXISTS idx_shares_token ON shares(token);
CREATE INDEX IF NOT EXISTS idx_shares_model_version_id ON shares(model_version_id);
CREATE INDEX IF NOT EXISTS idx_qr_assets_version_id ON qr_assets(model_version_id);

-- RLS Notes (Manual enable required in Supabase UI or via SQL if needed)
-- ALTER TABLE models ENABLE ROW LEVEL SECURITY;
-- ... etc
