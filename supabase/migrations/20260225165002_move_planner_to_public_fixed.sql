-- Create tables in public schema with pl_ prefix

-- 1. pl_concrete_factories
CREATE TABLE IF NOT EXISTS public.pl_concrete_factories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    contact text,
    email text,
    phone text,
    notes text,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
);

-- 2. pl_external_constructors
CREATE TABLE IF NOT EXISTS public.pl_external_constructors (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    contact text,
    email text,
    phone text,
    notes text,
    capacity_hours_per_week numeric DEFAULT 40,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
);

-- 3. pl_internal_engineers
CREATE TABLE IF NOT EXISTS public.pl_internal_engineers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id uuid REFERENCES auth.users(id),
    full_name text NOT NULL,
    email text UNIQUE NOT NULL,
    initials text,
    role text NOT NULL DEFAULT 'engineer' CHECK (role IN ('planner', 'engineer', 'admin')),
    capacity_hours_per_week numeric DEFAULT 40,
    color text DEFAULT '#3B82F6',
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 4. pl_projects
CREATE TABLE IF NOT EXISTS public.pl_projects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_number text UNIQUE NOT NULL,
    name text NOT NULL,
    client_name text,
    factory_id uuid REFERENCES public.pl_concrete_factories(id),
    coordinator_id uuid REFERENCES public.pl_internal_engineers(id),
    external_constructor_id uuid REFERENCES public.pl_external_constructors(id),
    status text NOT NULL DEFAULT 'intake' CHECK (status IN ('intake', 'lopend', 'on_hold', 'afgerond', 'gearchiveerd')),
    priority integer DEFAULT 2 CHECK (priority >= 1 AND priority <= 5),
    start_date date,
    description text,
    notes text,
    hour_distribution_override jsonb,
    created_by uuid REFERENCES public.pl_internal_engineers(id),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 5. pl_trajectory_templates
CREATE TABLE IF NOT EXISTS public.pl_trajectory_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    code text UNIQUE NOT NULL,
    description text,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
);

-- 6. pl_template_tasks
CREATE TABLE IF NOT EXISTS public.pl_template_tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id uuid REFERENCES public.pl_trajectory_templates(id) ON DELETE CASCADE,
    order_index integer NOT NULL,
    name text NOT NULL,
    responsible_role text NOT NULL CHECK (responsible_role IN ('vh_intern', 'opdrachtgever', 'extern_constructeur', 'extern_wapening', 'leverancier')),
    default_duration_days integer DEFAULT 5,
    hours_pct numeric DEFAULT 0,
    is_milestone boolean DEFAULT false,
    color text DEFAULT '#3B82F6'
);

-- 7. pl_drawing_streams
CREATE TABLE IF NOT EXISTS public.pl_drawing_streams (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid REFERENCES public.pl_projects(id) ON DELETE CASCADE,
    template_id uuid REFERENCES public.pl_trajectory_templates(id),
    name text NOT NULL,
    description text,
    start_date date,
    order_index integer DEFAULT 0,
    color text DEFAULT '#6366F1',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 8. pl_stream_tasks
CREATE TABLE IF NOT EXISTS public.pl_stream_tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    stream_id uuid REFERENCES public.pl_drawing_streams(id) ON DELETE CASCADE,
    template_task_id uuid REFERENCES public.pl_template_tasks(id),
    order_index integer NOT NULL,
    name text NOT NULL,
    responsible_role text NOT NULL CHECK (responsible_role IN ('vh_intern', 'opdrachtgever', 'extern_constructeur', 'extern_wapening', 'leverancier')),
    status text NOT NULL DEFAULT 'niet_gestart' CHECK (status IN ('niet_gestart', 'bezig', 'ter_controle', 'wachten_input', 'gereed', 'definitief')),
    start_date date,
    end_date date,
    duration_days integer DEFAULT 5,
    planned_hours numeric DEFAULT 0,
    hours_pct numeric DEFAULT 0,
    assigned_engineer_id uuid REFERENCES public.pl_internal_engineers(id),
    assigned_constructor_id uuid REFERENCES public.pl_external_constructors(id),
    is_milestone boolean DEFAULT false,
    color text,
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 9. pl_task_dependencies
CREATE TABLE IF NOT EXISTS public.pl_task_dependencies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id uuid REFERENCES public.pl_stream_tasks(id) ON DELETE CASCADE,
    depends_on_id uuid REFERENCES public.pl_stream_tasks(id) ON DELETE CASCADE,
    dep_type text NOT NULL DEFAULT 'finish_to_start' CHECK (dep_type IN ('finish_to_start', 'start_to_start')),
    is_linked boolean DEFAULT true,
    lag_days integer DEFAULT 0
);

-- 10. pl_component_types
CREATE TABLE IF NOT EXISTS public.pl_component_types (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    description text,
    default_hours numeric DEFAULT 0,
    hour_distribution jsonb DEFAULT '{"vh_opzetten": 20, "vh_uitwerken": 40, "vh_verwerken": 20, "extern_wapening": 20}'::jsonb,
    created_at timestamptz DEFAULT now()
);

-- 11. pl_project_components
CREATE TABLE IF NOT EXISTS public.pl_project_components (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid REFERENCES public.pl_projects(id) ON DELETE CASCADE,
    component_type_id uuid REFERENCES public.pl_component_types(id),
    name text NOT NULL,
    quantity integer DEFAULT 1,
    total_hours numeric DEFAULT 0,
    hour_distribution jsonb,
    notes text,
    created_at timestamptz DEFAULT now()
);

-- 12. pl_stream_component_links
CREATE TABLE IF NOT EXISTS public.pl_stream_component_links (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    stream_id uuid REFERENCES public.pl_drawing_streams(id) ON DELETE CASCADE,
    component_id uuid REFERENCES public.pl_project_components(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now()
);

-- 13. pl_calendar_exceptions
CREATE TABLE IF NOT EXISTS public.pl_calendar_exceptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    date date UNIQUE NOT NULL,
    name text NOT NULL,
    type text NOT NULL DEFAULT 'feestdag' CHECK (type IN ('feestdag', 'vakantie', 'overig')),
    created_at timestamptz DEFAULT now()
);

-- 14. pl_task_comments
CREATE TABLE IF NOT EXISTS public.pl_task_comments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id uuid REFERENCES public.pl_stream_tasks(id) ON DELETE CASCADE,
    author_id uuid REFERENCES public.pl_internal_engineers(id),
    author_name text,
    content text NOT NULL,
    created_at timestamptz DEFAULT now()
);

-- 15. pl_audit_log
CREATE TABLE IF NOT EXISTS public.pl_audit_log (
    id bigserial PRIMARY KEY,
    user_id uuid REFERENCES public.pl_internal_engineers(id),
    action text NOT NULL,
    table_name text NOT NULL,
    record_id text NOT NULL,
    old_data jsonb,
    new_data jsonb,
    created_at timestamptz DEFAULT now()
);

-- 16. pl_project_engineers
CREATE TABLE IF NOT EXISTS public.pl_project_engineers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid REFERENCES public.pl_projects(id) ON DELETE CASCADE,
    engineer_id uuid REFERENCES public.pl_internal_engineers(id) ON DELETE CASCADE,
    added_at timestamptz DEFAULT now()
);

-- Seed basic data from planner schema if it exists

INSERT INTO public.pl_trajectory_templates (id, name, code, description, is_active, created_at)
SELECT id, name, code, description, is_active, created_at FROM planner.trajectory_templates
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.pl_template_tasks (id, template_id, order_index, name, responsible_role, default_duration_days, hours_pct, is_milestone, color)
SELECT id, template_id, order_index, name, responsible_role, default_duration_days, hours_pct, is_milestone, color FROM planner.template_tasks
ON CONFLICT DO NOTHING;

INSERT INTO public.pl_component_types (id, name, description, default_hours, hour_distribution, created_at)
SELECT id, name, description, default_hours, hour_distribution, created_at FROM planner.component_types
ON CONFLICT DO NOTHING;

INSERT INTO public.pl_calendar_exceptions (id, date, name, type, created_at)
SELECT id, date, name, type, created_at FROM planner.calendar_exceptions
ON CONFLICT (date) DO NOTHING;

INSERT INTO public.pl_internal_engineers (id, auth_user_id, full_name, email, initials, role, capacity_hours_per_week, color, is_active, created_at, updated_at)
SELECT id, auth_user_id, full_name, email, initials, role, capacity_hours_per_week, color, is_active, created_at, updated_at FROM planner.internal_engineers
ON CONFLICT (email) DO NOTHING;
;
