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
        async getFilesByProjectId(projectId) {
            if (!supabase) return [];
            const { data } = await supabase.from('files').select('*').eq('project_id', projectId);
            return (data || []).map(mapFile);
        },

        async getAllFiles() {
            if (!supabase) return [];
            const { data } = await supabase.from('files').select('*');
            return (data || []).map(mapFile);
        },

        async getFileById(id) {
            if (!supabase) return null;
            const { data, error } = await supabase.from('files').select('*').eq('id', id).single();
            if (error) return null;
            return mapFile(data);
        },

        async getFileDownloadUrl(storagePath) {
            if (!supabase) return null;
            const { data, error } = await supabase.storage
                .from('ifc-private')
                .createSignedUrl(storagePath, 60 * 15);

            if (error) {
                console.error('Error generating signed URL:', error);
                return null;
            }
            return data.signedUrl;
        },

        async createSignedUploadUrl(storagePath) {
            if (!supabase) return null;
            try {
                const { data, error } = await supabase.storage
                    .from('ifc-private')
                    .createSignedUploadUrl(storagePath);

                if (error) throw error;
                return data;
            } catch (e) {
                console.error('Error creating upload URL:', e);
                return null;
            }
        },

        async deleteFile(id) {
            if (!supabase) return;
            const file = await this.getFileById(id);
            if (!file) return;

            if (file.path) {
                const { error } = await supabase.storage.from('ifc-private').remove([file.path]);
                if (error) console.error('Storage Delete Error:', error);
            }
            await supabase.from('files').delete().eq('id', id);
        },

        async createFile(id, projectId, filename, path, size, user = 'Admin') {
            if (!supabase) return null;
            const finalName = filename || 'unnamed_file_' + Date.now();
            const newFile = {
                id: id || uuidv4(),
                project_id: projectId,
                filename: finalName,
                original_name: finalName,
                path: path,
                size: size
            };

            const { data, error } = await supabase.from('files').insert([newFile]).select().single();
            if (error) throw error;

            if (logActivity) {
                await logActivity(projectId, user || 'Admin', 'upload_file', `File "${filename}" uploaded`);
            }
            return mapFile(data);
        },

        async updateFile(id, updates) {
            if (!supabase) return null;
            const cleanUpdates = { ...updates };
            delete cleanUpdates.upload_date;

            if (cleanUpdates.filename) {
                cleanUpdates.original_name = cleanUpdates.filename;
            } else if (cleanUpdates.original_name) {
                cleanUpdates.filename = cleanUpdates.original_name;
            }

            const { data, error } = await supabase
                .from('files')
                .update(cleanUpdates)
                .eq('id', id)
                .select()
                .single();

            if (error) return null;
            return mapFile(data);
        },

        async uploadRevisionFile(revisionId, fileData) {
            if (!supabase) return null;
            const { data, error } = await supabase
                .from('revisions')
                .update({
                    status: 'ready',
                    file_name: fileData.filename,
                    file_size: fileData.size,
                })
                .eq('id', revisionId)
                .select()
                .single();

            if (error) throw error;
            return data;
        }
    };
};
