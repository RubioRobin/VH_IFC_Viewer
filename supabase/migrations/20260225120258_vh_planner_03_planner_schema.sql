
-- Create separate schema for VH Planner (avoid conflicts with IFC viewer tables)
CREATE SCHEMA IF NOT EXISTS planner;

-- Base entities
CREATE TABLE IF NOT EXISTS planner.concrete_factories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  contact     TEXT,
  email       TEXT,
  phone       TEXT,
  notes       TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS planner.external_constructors (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  contact     TEXT,
  email       TEXT,
  phone       TEXT,
  notes       TEXT,
  capacity_hours_per_week NUMERIC(6,2) DEFAULT 40,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS planner.internal_engineers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name   TEXT NOT NULL,
  email       TEXT UNIQUE NOT NULL,
  initials    TEXT,
  role        TEXT NOT NULL DEFAULT 'engineer' CHECK (role IN ('planner','engineer','admin')),
  capacity_hours_per_week NUMERIC(5,2) NOT NULL DEFAULT 40,
  color       TEXT DEFAULT '#3B82F6',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS planner.trajectory_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  code        TEXT UNIQUE NOT NULL,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS planner.template_tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     UUID NOT NULL REFERENCES planner.trajectory_templates(id) ON DELETE CASCADE,
  order_index     INTEGER NOT NULL,
  name            TEXT NOT NULL,
  responsible_role TEXT NOT NULL
                  CHECK (responsible_role IN ('vh_intern','opdrachtgever','extern_constructeur','extern_wapening','leverancier')),
  default_duration_days INTEGER NOT NULL DEFAULT 5,
  hours_pct       NUMERIC(5,2) DEFAULT 0,
  is_milestone    BOOLEAN NOT NULL DEFAULT false,
  color           TEXT DEFAULT '#3B82F6'
);

CREATE TABLE IF NOT EXISTS planner.component_types (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  description     TEXT,
  default_hours   NUMERIC(8,2) DEFAULT 0,
  hour_distribution JSONB DEFAULT '{"vh_opzetten":20,"vh_uitwerken":40,"vh_verwerken":20,"extern_wapening":20}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS planner.calendar_exceptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date        DATE NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'feestdag' CHECK (type IN ('feestdag','vakantie','overig')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Projects
CREATE TABLE IF NOT EXISTS planner.projects (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_number          TEXT UNIQUE NOT NULL,
  name                    TEXT NOT NULL,
  client_name             TEXT,
  factory_id              UUID REFERENCES planner.concrete_factories(id),
  coordinator_id          UUID REFERENCES planner.internal_engineers(id),
  external_constructor_id UUID REFERENCES planner.external_constructors(id),
  status                  TEXT NOT NULL DEFAULT 'intake'
                          CHECK (status IN ('intake','lopend','on_hold','afgerond','gearchiveerd')),
  priority                INTEGER NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 5),
  start_date              DATE,
  description             TEXT,
  notes                   TEXT,
  hour_distribution_override JSONB,
  created_by              UUID REFERENCES planner.internal_engineers(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS planner.project_engineers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES planner.projects(id) ON DELETE CASCADE,
  engineer_id UUID NOT NULL REFERENCES planner.internal_engineers(id) ON DELETE CASCADE,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, engineer_id)
);

CREATE TABLE IF NOT EXISTS planner.project_components (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES planner.projects(id) ON DELETE CASCADE,
  component_type_id UUID REFERENCES planner.component_types(id),
  name            TEXT NOT NULL,
  quantity        INTEGER DEFAULT 1,
  total_hours     NUMERIC(8,2) NOT NULL DEFAULT 0,
  hour_distribution JSONB,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Drawing streams (tekenstromingen)
CREATE TABLE IF NOT EXISTS planner.drawing_streams (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES planner.projects(id) ON DELETE CASCADE,
  template_id     UUID REFERENCES planner.trajectory_templates(id),
  name            TEXT NOT NULL,
  description     TEXT,
  start_date      DATE,
  order_index     INTEGER NOT NULL DEFAULT 0,
  color           TEXT DEFAULT '#6366F1',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS planner.stream_component_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id   UUID NOT NULL REFERENCES planner.drawing_streams(id) ON DELETE CASCADE,
  component_id UUID NOT NULL REFERENCES planner.project_components(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(stream_id, component_id)
);

-- Stream tasks
CREATE TABLE IF NOT EXISTS planner.stream_tasks (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id               UUID NOT NULL REFERENCES planner.drawing_streams(id) ON DELETE CASCADE,
  template_task_id        UUID REFERENCES planner.template_tasks(id),
  order_index             INTEGER NOT NULL,
  name                    TEXT NOT NULL,
  responsible_role        TEXT NOT NULL
                          CHECK (responsible_role IN ('vh_intern','opdrachtgever','extern_constructeur','extern_wapening','leverancier')),
  status                  TEXT NOT NULL DEFAULT 'niet_gestart'
                          CHECK (status IN ('niet_gestart','bezig','ter_controle','wachten_input','gereed','definitief')),
  start_date              DATE,
  end_date                DATE,
  duration_days           INTEGER NOT NULL DEFAULT 5,
  planned_hours           NUMERIC(8,2) DEFAULT 0,
  hours_pct               NUMERIC(5,2) DEFAULT 0,
  assigned_engineer_id    UUID REFERENCES planner.internal_engineers(id),
  assigned_constructor_id UUID REFERENCES planner.external_constructors(id),
  is_milestone            BOOLEAN NOT NULL DEFAULT false,
  color                   TEXT,
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Task dependencies
CREATE TABLE IF NOT EXISTS planner.task_dependencies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id       UUID NOT NULL REFERENCES planner.stream_tasks(id) ON DELETE CASCADE,
  depends_on_id UUID NOT NULL REFERENCES planner.stream_tasks(id) ON DELETE CASCADE,
  dep_type      TEXT NOT NULL DEFAULT 'finish_to_start'
                CHECK (dep_type IN ('finish_to_start','start_to_start')),
  is_linked     BOOLEAN NOT NULL DEFAULT true,
  lag_days      INTEGER NOT NULL DEFAULT 0,
  UNIQUE(task_id, depends_on_id),
  CHECK (task_id != depends_on_id)
);

-- Task comments
CREATE TABLE IF NOT EXISTS planner.task_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES planner.stream_tasks(id) ON DELETE CASCADE,
  author_id   UUID REFERENCES planner.internal_engineers(id),
  author_name TEXT,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit log
CREATE TABLE IF NOT EXISTS planner.audit_log (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES planner.internal_engineers(id),
  action      TEXT NOT NULL,
  table_name  TEXT NOT NULL,
  record_id   TEXT NOT NULL,
  old_data    JSONB,
  new_data    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Triggers voor updated_at
CREATE OR REPLACE FUNCTION planner.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_projects_updated
  BEFORE UPDATE ON planner.projects FOR EACH ROW EXECUTE FUNCTION planner.update_updated_at();
CREATE OR REPLACE TRIGGER trg_streams_updated
  BEFORE UPDATE ON planner.drawing_streams FOR EACH ROW EXECUTE FUNCTION planner.update_updated_at();
CREATE OR REPLACE TRIGGER trg_tasks_updated
  BEFORE UPDATE ON planner.stream_tasks FOR EACH ROW EXECUTE FUNCTION planner.update_updated_at();
CREATE OR REPLACE TRIGGER trg_engineers_updated
  BEFORE UPDATE ON planner.internal_engineers FOR EACH ROW EXECUTE FUNCTION planner.update_updated_at();
;
