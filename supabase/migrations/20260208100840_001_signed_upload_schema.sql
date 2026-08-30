-- Migration 001: Signed Upload Flow Schema
-- Purpose: Create multi-tenant model/revision tracking and public shares
-- Author: VH Engineering
-- Date: 2026-02-08

-- ============================================================================
-- EXTENSIONS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- TABLES
-- ============================================================================

-- Organizations (Multi-tenant support)
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Models (Logical grouping of IFC models per project)
CREATE TABLE IF NOT EXISTS models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Revisions (Individual IFC file versions)
CREATE TABLE IF NOT EXISTS revisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
    revision_number INTEGER NOT NULL DEFAULT 1,

    -- Upload tracking
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'uploaded', 'processing', 'ready', 'failed')),

    -- File metadata
    storage_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size BIGINT,
    sha256 TEXT,

    -- Revit metadata (optional)
    revit_doc_guid TEXT,
    revit_view_id TEXT,
    element_ids JSONB,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    uploaded_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    -- Ensure unique revision numbers per model
    UNIQUE(model_id, revision_number)
);

-- Shares (Public viewer links)
CREATE TABLE IF NOT EXISTS shares (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    revision_id UUID NOT NULL REFERENCES revisions(id) ON DELETE CASCADE,

    -- Public share identifier (random, URL-safe)
    share_id TEXT UNIQUE NOT NULL,

    -- Viewer state (camera, section box, isolated elements, etc.)
    view_state JSONB,

    -- QR code storage path
    qr_storage_path TEXT,

    -- Expiration (optional)
    expires_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_accessed_at TIMESTAMPTZ
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Organizations
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);

-- Models
CREATE INDEX IF NOT EXISTS idx_models_project_id ON models(project_id);
CREATE INDEX IF NOT EXISTS idx_models_created_at ON models(created_at DESC);

-- Revisions
CREATE INDEX IF NOT EXISTS idx_revisions_model_id ON revisions(model_id);
CREATE INDEX IF NOT EXISTS idx_revisions_status ON revisions(status);
CREATE INDEX IF NOT EXISTS idx_revisions_sha256 ON revisions(sha256) WHERE sha256 IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_revisions_created_at ON revisions(created_at DESC);

-- Shares
CREATE INDEX IF NOT EXISTS idx_shares_share_id ON shares(share_id);
CREATE INDEX IF NOT EXISTS idx_shares_revision_id ON shares(revision_id);
CREATE INDEX IF NOT EXISTS idx_shares_expires_at ON shares(expires_at) WHERE expires_at IS NOT NULL;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all new tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE models ENABLE ROW LEVEL SECURITY;
ALTER TABLE revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE shares ENABLE ROW LEVEL SECURITY;

-- Organizations: Only service role can access (admin operations)
CREATE POLICY "Service role full access on organizations"
    ON organizations
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Models: Only service role can access (admin operations)
CREATE POLICY "Service role full access on models"
    ON models
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Revisions: Only service role can access (admin operations)
CREATE POLICY "Service role full access on revisions"
    ON revisions
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Shares: Public read access via share_id, service role full access
CREATE POLICY "Public read access on shares via share_id"
    ON shares
    FOR SELECT
    TO anon, authenticated
    USING (
        -- Allow access if not expired
        (expires_at IS NULL OR expires_at > NOW())
    );

CREATE POLICY "Service role full access on shares"
    ON shares
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Auto-increment revision number
CREATE OR REPLACE FUNCTION auto_increment_revision_number()
RETURNS TRIGGER AS $$
BEGIN
    -- Get the max revision number for this model and increment
    SELECT COALESCE(MAX(revision_number), 0) + 1
    INTO NEW.revision_number
    FROM revisions
    WHERE model_id = NEW.model_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_increment_revision_number
    BEFORE INSERT ON revisions
    FOR EACH ROW
    WHEN (NEW.revision_number IS NULL OR NEW.revision_number = 1)
    EXECUTE FUNCTION auto_increment_revision_number();

-- Update timestamps on update
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_models_updated_at
    BEFORE UPDATE ON models
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SEED DATA
-- ============================================================================

-- Insert default organization (VH Engineering)
INSERT INTO organizations (id, name, slug)
VALUES (
    'e7f8a9b0-1c2d-3e4f-5a6b-7c8d9e0f1a2b',
    'VH Engineering',
    'vh-engineering'
)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

COMMENT ON TABLE organizations IS 'Multi-tenant organizations';
COMMENT ON TABLE models IS 'Logical grouping of IFC models per project';
COMMENT ON TABLE revisions IS 'Individual IFC file versions with upload tracking';
COMMENT ON TABLE shares IS 'Public viewer links with shareId and viewState';;
