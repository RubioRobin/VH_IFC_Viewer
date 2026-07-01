const { v4: uuidv4 } = require('uuid');

module.exports = (supabase, logActivity) => {
    const naturalCollator = new Intl.Collator('nl-NL', {
        numeric: true,
        sensitivity: 'base'
    });

    function extractProjectCode(value) {
        if (!value || typeof value !== 'string') return null;
        const match = value.match(/P\d+[A-Z0-9]*/i);
        return match ? match[0].toUpperCase() : null;
    }

    function cleanProjectName(value, code) {
        if (!value || typeof value !== 'string') return null;
        let name = value.trim();

        if (code) {
            const codeIndex = name.toLowerCase().indexOf(code.toLowerCase());
            if (codeIndex >= 0) {
                name = name.slice(codeIndex + code.length);
            }
        }

        name = name.replace(/^[\s\-_:.,]+/, '').replace(/\s+/g, ' ').trim();
        return name || null;
    }

    function normalizeProject(project) {
        if (!project) return project;

        const code = extractProjectCode(project.code) || extractProjectCode(project.name);
        const cleanedName = cleanProjectName(project.name, code);

        if (!code || !cleanedName) return project;

        return {
            ...project,
            code,
            name: `${code} - ${cleanedName}`
        };
    }

    function buildProjectFields(projectNumber, projectName) {
        const code = extractProjectCode(projectNumber) || extractProjectCode(projectName);
        const rawName = cleanProjectName(projectName, code) || cleanProjectName(projectNumber, code);
        const name = code && rawName
            ? `${code} - ${rawName}`
            : [code, rawName].filter(Boolean).join(' ').trim();

        return { code, name };
    }

    function mapFile(f) {
        if (!f) return null;
        return {
            ...f,
            filename: f.filename || f.original_name,
            upload_date: f.upload_date || f.created_at || f.updated_at
        };
    }

    function sortFiles(files) {
        return (files || [])
            .map(mapFile)
            .filter(Boolean)
            .sort((a, b) => naturalCollator.compare(a.filename || '', b.filename || ''));
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
                    ...normalizeProject(p),
                    files: sortFiles(p.files),
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
                    ...normalizeProject(data),
                    files: sortFiles(data.files)
                };
            } catch (e) { return null; }
        },

        async createProject(id, name, description, status, user = 'Admin', code = null) {
            if (!supabase) return null;
            const newProject = {
                id: id || uuidv4(),
                name,
                description,
                status: status || 'actief',
                code: code || null
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
                await logActivity(newProject.id, user || 'Admin', 'create_project', `Project "${name}" aangemaakt`);
            }

            return { ...data, files: [] };
        },

        async ensureProject(projectNumber, projectName, user = 'Plugin') {
            if (!supabase) return null;

            const rawCode = (projectNumber || '').trim();
            const { code, name } = buildProjectFields(projectNumber, projectName);

            if (!name) {
                throw new Error('Projectnummer of projectnaam is verplicht.');
            }

            if (code) {
                const { data: byCode } = await supabase
                    .from('projects')
                    .select('*')
                    .eq('code', code)
                    .maybeSingle();

                if (byCode) return { ...normalizeProject(byCode), files: [] };
            }

            if (rawCode && rawCode !== code) {
                const { data: byRawCode } = await supabase
                    .from('projects')
                    .select('*')
                    .eq('code', rawCode)
                    .maybeSingle();

                if (byRawCode) {
                    const { data: updated } = await supabase
                        .from('projects')
                        .update({ code: code || rawCode, name })
                        .eq('id', byRawCode.id)
                        .select()
                        .single();

                    return { ...normalizeProject(updated || byRawCode), files: [] };
                }
            }

            const { data: byName } = await supabase
                .from('projects')
                .select('*')
                .eq('name', name)
                .maybeSingle();

            if (byName) return { ...normalizeProject(byName), files: [] };

            if (rawCode) {
                const legacyName = [rawCode, (projectName || '').trim()].filter(Boolean).join(' ').trim();
                if (legacyName && legacyName !== name) {
                    const { data: byLegacyName } = await supabase
                        .from('projects')
                        .select('*')
                        .eq('name', legacyName)
                        .maybeSingle();

                    if (byLegacyName) {
                        const { data: updated } = await supabase
                            .from('projects')
                            .update({ code: code || rawCode, name })
                            .eq('id', byLegacyName.id)
                            .select()
                            .single();

                        return { ...normalizeProject(updated || byLegacyName), files: [] };
                    }
                }
            }

            return this.createProject(uuidv4(), name, '', 'actief', user, code || null);
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
                await logActivity(projectId, user || 'Admin', 'update_project_status', `Status gewijzigd naar "${status}"`);
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
