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

        async createShare(versionId, token, expiresAt = null) {
            if (!supabase) return null;
            const record = { model_version_id: versionId, token, is_active: true };
            if (expiresAt) record.expires_at = expiresAt;
            const { data, error } = await supabase.from('shares').insert([record]).select().single();
            if (error) throw error;
            return data;
        },

        async deactivateShare(token) {
            if (!supabase) return;
            await supabase.from('shares').update({ is_active: false }).eq('token', token);
        },

        async getShareByToken(token) {
            if (!supabase) return null;
            const { data, error } = await supabase
                .from('shares')
                .select('*, model_versions(*, models(*, projects(*)))')
                .eq('token', token)
                .or('is_active.eq.true,is_active.is.null')
                .maybeSingle();

            if (!error && data) return data;

            if (error) {
                console.warn('[Share] Geneste share-query mislukt, fallback wordt geprobeerd:', error.message);
            }

            const { data: share, error: shareError } = await supabase
                .from('shares')
                .select('*')
                .eq('token', token)
                .or('is_active.eq.true,is_active.is.null')
                .maybeSingle();

            if (shareError || !share) {
                if (shareError) console.warn('[Share] Share-token niet gevonden:', shareError.message);
                return null;
            }

            const { data: version, error: versionError } = await supabase
                .from('model_versions')
                .select('*')
                .eq('id', share.model_version_id)
                .maybeSingle();

            if (versionError || !version) return null;

            const { data: model, error: modelError } = await supabase
                .from('models')
                .select('*')
                .eq('id', version.model_id)
                .maybeSingle();

            if (modelError || !model) return null;

            const { data: project } = await supabase
                .from('projects')
                .select('*')
                .eq('id', model.project_id)
                .maybeSingle();

            return {
                ...share,
                model_versions: {
                    ...version,
                    models: {
                        ...model,
                        projects: project || { id: model.project_id, name: 'Project' }
                    }
                }
            };
        },

        async getShareByVersionId(versionId) {
            if (!supabase) return null;
            const { data, error } = await supabase
                .from('shares')
                .select('*')
                .eq('model_version_id', versionId)
                .or('is_active.eq.true,is_active.is.null')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

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
