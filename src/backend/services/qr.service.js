const { v4: uuidv4 } = require('uuid');

module.exports = (supabase, logActivity) => {
    return {
        async getAllQRCodes() {
            if (!supabase) return [];
            const { data } = await supabase.from('qr_codes').select('*');
            return data || [];
        },

        async createQRCode(id, projectId, fileId, elementId, path) {
            if (!supabase) return null;
            const newQR = {
                id: id || uuidv4(),
                project_id: projectId,
                file_id: fileId,
                element_id: elementId,
                path: path
            };

            const { data, error } = await supabase.from('qr_codes').insert([newQR]).select().single();
            if (error) throw error;
            return data;
        },

        async deleteQRCode(id) {
            if (!supabase) return;
            await supabase.from('qr_codes').delete().eq('id', id);
        },

        async createPublicLink(projectId, fileId, user = 'Admin') {
            if (!supabase) return null;
            const newLink = {
                public_id: uuidv4(),
                project_id: projectId,
                ifc_file_id: fileId,
                is_active: true
            };

            const { data, error } = await supabase.from('public_links').insert([newLink]).select().single();
            if (error) throw error;

            if (logActivity) {
                await logActivity(projectId, user || 'Admin', 'create_link', `Public link created for file ${fileId}`);
            }
            return data;
        },

        async getPublicLink(publicId) {
            if (!supabase) return null;
            const { data, error } = await supabase
                .from('public_links')
                .select(`*, files (*)`)
                .eq('public_id', publicId)
                .eq('is_active', true)
                .single();

            if (error) return null;
            return data;
        },

        async createModelVersion(modelId, storagePath, size, checksum) {
            if (!supabase) return null;
            const { data, error } = await supabase.from('model_versions').insert([{ model_id: modelId, storage_path_ifc: storagePath, file_size: size, checksum_sha256: checksum }]).select().single();
            if (error) throw error;
            return data;
        },

        async createShare(versionId, token) {
            if (!supabase) return null;
            const { data, error } = await supabase.from('shares').insert([{ model_version_id: versionId, token }]).select().single();
            if (error) throw error;
            return data;
        },

        async getShareByToken(token) {
            if (!supabase) return null;
            const { data, error } = await supabase.from('shares').select('*, model_versions(*, models(*, projects(*)))').eq('token', token).eq('is_active', true).single();
            if (error) return null;
            return data;
        },

        async createQRAsset(projectId, versionId, storagePath) {
            if (!supabase) return null;
            const { data, error } = await supabase.from('qr_assets').insert([{ project_id: projectId, model_version_id: versionId, storage_path_png: storagePath }]).select().single();
            if (error) throw error;
            return data;
        },

        async getQRAssetByVersion(versionId) {
            if (!supabase) return null;
            const { data, error } = await supabase.from('qr_assets').select('*').eq('model_version_id', versionId).single();
            if (error) return null;
            return data;
        },

        async linkSheet(versionId, sheetId, viewId, placementInfo) {
            if (!supabase) return null;
            const { data, error } = await supabase.from('sheets_link').insert([{ model_version_id: versionId, revit_sheet_unique_id: sheetId, revit_view_unique_id: viewId, placement_info_json: placementInfo }]).select().single();
            if (error) throw error;
            return data;
        }
    };
};
