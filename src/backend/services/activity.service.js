module.exports = (supabase) => {
    const scanGuard = new Map();

    return {
        async logActivity(projectId, user, type, details, fileId = null) {
            if (!supabase) return;

            if (type === 'scan') {
                const key = `${projectId}-${details}`;
                const now = Date.now();
                const lastScan = scanGuard.get(key);
                if (lastScan && (now - lastScan < 10000)) {
                    return;
                }
                scanGuard.set(key, now);

                if (scanGuard.size > 100) {
                    for (const [k, v] of scanGuard.entries()) {
                        if (now - v > 30000) scanGuard.delete(k);
                    }
                }
            }

            const logEntry = {
                project_id: projectId,
                user_name: user || 'System',
                type: type || 'info',
                details: details || '',
                file_id: fileId,
                timestamp: new Date().toISOString()
            };

            const { error } = await supabase.from('activity').insert([logEntry]);
            if (error) console.error('Activity Log Error:', error);
        },

        async resetScanActivity() {
            if (!supabase) return;
            const { error } = await supabase.from('activity').delete().eq('type', 'scan');
            if (error) throw error;
        },

        async getRecentActivity(limit = 20) {
            if (!supabase) return [];
            const { data } = await supabase
                .from('activity')
                .select('*')
                .order('timestamp', { ascending: false })
                .limit(limit);
            return data || [];
        },

        async getStatistics() {
            if (!supabase) return { total_projects: 0, active_projects: 0, total_files: 0, total_storage: 0, total_qr_codes: 0 };

            const [
                { count: totalProjects },
                { count: activeProjects },
                { count: totalFiles },
                { data: filesData },
                { count: qrCodeUsage }
            ] = await Promise.all([
                supabase.from('projects').select('*', { count: 'exact', head: true }),
                supabase.from('projects').select('*', { count: 'exact', head: true }).eq('status', 'actief'),
                supabase.from('files').select('*', { count: 'exact', head: true }),
                supabase.from('files').select('size'),
                supabase.from('activity').select('*', { count: 'exact', head: true }).eq('type', 'scan')
            ]);

            const totalStorage = filesData?.reduce((sum, file) => sum + (file.size || 0), 0) || 0;

            return {
                total_projects: totalProjects || 0,
                active_projects: activeProjects || 0,
                total_files: totalFiles || 0,
                total_storage: totalStorage,
                total_qr_codes: qrCodeUsage || 0
            };
        },

        async getDetailedStatistics(days = 30) {
            if (!supabase) return { projects: [], files: [], timeline: [] };
            try {
                const { data: projectData } = await supabase.from('activity').select('project_id, projects(name)').eq('type', 'scan').not('project_id', 'is', null);
                const projectCounts = {};
                projectData?.forEach(item => {
                    const name = item.projects?.name || 'Onbekend Project';
                    projectCounts[name] = (projectCounts[name] || 0) + 1;
                });

                const { data: fileData } = await supabase.from('activity').select('file_id, files(filename)').eq('type', 'scan').not('file_id', 'is', null);
                const fileCounts = {};
                fileData?.forEach(item => {
                    const name = item.files?.filename || 'Onbekend Bestand';
                    fileCounts[name] = (fileCounts[name] || 0) + 1;
                });

                const startDate = new Date();
                startDate.setDate(startDate.getDate() - days);
                const { data: timelineData } = await supabase.from('activity').select('timestamp').eq('type', 'scan').gte('timestamp', startDate.toISOString());

                const timeline = {};
                timelineData?.forEach(item => {
                    const d = new Date(item.timestamp);
                    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                    timeline[date] = (timeline[date] || 0) + 1;
                });

                return {
                    projects: Object.entries(projectCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
                    files: Object.entries(fileCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
                    timeline: Object.entries(timeline).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date))
                };
            } catch (e) {
                console.error('getDetailedStatistics error:', e);
                return { projects: [], files: [], timeline: [] };
            }
        }
    };
};
