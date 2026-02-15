const { v4: uuidv4 } = require('uuid');

module.exports = (supabase, logActivity) => {

    function mapFile(f) {
        if (!f) return null;
        return {
            ...f,
            filename: f.filename || f.original_name,
            upload_date: f.upload_date || f.created_at
        };
    }

    return {
        async getAllProjects() {
            if (!supabase) return [];
            try {
                const { data, error } = await supabase
                    .from('projects')
                    .select(`*, files (*)`)
                    .order('created_at', { ascending: false });

                if (error) throw error;

                return data.map(p => ({
                    ...p,
                    files: (p.files || []).map(mapFile),
                    file_count: (p.files || []).length,
                    total_size: (p.files || []).reduce((acc, f) => acc + (f.size || 0), 0)
                }));
            } catch (e) {
                console.error('getProjects error:', e);
                return [];
            }
        },

        async getProjectById(id) {
            if (!supabase) return null;
            try {
                const { data, error } = await supabase
                    .from('projects')
                    .select(`*, files (*)`)
                    .eq('id', id)
                    .single();

                if (error) return null;
                return {
                    ...data,
                    files: (data.files || []).map(mapFile)
                };
            } catch (e) { return null; }
        },

        async createProject(id, name, description, status, user = 'Admin') {
            if (!supabase) return null;
            const newProject = {
                id: id || uuidv4(),
                name,
                description,
                status: status || 'actief'
            };

            const { data: existing } = await supabase
                .from('projects')
                .select('id')
                .eq('name', name)
                .maybeSingle();

            if (existing) {
                throw new Error('Een project met deze naam bestaat al.');
            }

            const { data, error } = await supabase
                .from('projects')
                .insert([newProject])
                .select()
                .single();

            if (error) throw error;

            if (logActivity) {
                await logActivity(newProject.id, user || 'Admin', 'create_project', `Project "${name}" created`);
            }

            return { ...data, files: [] };
        },

        async updateProjectStatus(projectId, status, user = 'Admin') {
            if (!supabase) return null;

            const { data, error } = await supabase
                .from('projects')
                .update({ status })
                .eq('id', projectId)
                .select()
                .single();

            if (error) throw error;

            if (logActivity) {
                await logActivity(projectId, user || 'Admin', 'update_project_status', `Status changed to "${status}"`);
            }

            return data;
        },

        async updateProject(id, updates) {
            if (!supabase) return null;
            const safeUpdates = {};
            if (updates.name) safeUpdates.name = updates.name;
            if (updates.description) safeUpdates.description = updates.description;

            const { data, error } = await supabase
                .from('projects')
                .update(safeUpdates)
                .eq('id', id)
                .select()
                .single();

            if (error) return null;
            return data;
        },

        async deleteProject(id) {
            if (!supabase) return;
            await supabase.from('projects').delete().eq('id', id);
        },

        async getModelsByProjectId(projectId) {
            if (!supabase) return [];
            try {
                const { data, error } = await supabase
                    .from('models')
                    .select(`*, model_versions (*)`)
                    .eq('project_id', projectId)
                    .order('created_at', { ascending: false });

                if (error) throw error;
                return data || [];
            } catch (e) {
                console.error('getModelsByProjectId error:', e);
                return [];
            }
        },

        async createModel(projectId, name, createdBy = 'plugin') {
            if (!supabase) return null;

            const { data: existing } = await supabase
                .from('models')
                .select('id')
                .eq('project_id', projectId)
                .eq('name', name)
                .maybeSingle();

            if (existing) return existing;

            const { data, error } = await supabase
                .from('models')
                .insert([{ project_id: projectId, name, created_by: createdBy }])
                .select()
                .single();

            if (error) throw error;
            return data;
        }
    };
};
