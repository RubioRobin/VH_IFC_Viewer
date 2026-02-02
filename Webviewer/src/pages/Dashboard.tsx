import React, { useEffect, useState } from 'react';
import { fetchAPI } from '../lib/api';
import { Skeleton } from '../components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';
import { nl } from 'date-fns/locale';

interface Stats {
    total_projects: number;
    active_projects: number;
    total_files: number;
    total_storage: number;
    total_qr_codes: number;
}

interface Activity {
    id: number;
    username: string;
    action: string;
    details: string;
    timestamp: string;
}

export function Dashboard() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [activity, setActivity] = useState<Activity[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            try {
                const [statsData, activityData] = await Promise.all([
                    fetchAPI('/statistics'),
                    fetchAPI('/activity?limit=10')
                ]);
                setStats(statsData);
                setActivity(activityData);
            } catch (err) {
                console.error("Dashboard load failed", err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    if (loading) {
        return <div className="p-8 space-y-4"><Skeleton className="h-40 w-full" /><Skeleton className="h-40 w-full" /></div>;
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Overzicht</h2>
                <p className="text-muted-foreground">Systeem status en recente activiteit.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="p-6 bg-card rounded-xl border shadow-sm">
                    <div className="text-sm font-medium text-muted-foreground">Projecten</div>
                    <div className="text-2xl font-bold">{stats?.total_projects || 0}</div>
                    <div className="text-xs text-muted-foreground">{stats?.active_projects || 0} actief</div>
                </div>
                <div className="p-6 bg-card rounded-xl border shadow-sm">
                    <div className="text-sm font-medium text-muted-foreground">Bestanden</div>
                    <div className="text-2xl font-bold">{stats?.total_files || 0}</div>
                    <div className="text-xs text-muted-foreground">{formatBytes(stats?.total_storage || 0)} opslag</div>
                </div>
                <div className="p-6 bg-card rounded-xl border shadow-sm">
                    <div className="text-sm font-medium text-muted-foreground">QR Codes</div>
                    <div className="text-2xl font-bold">{stats?.total_qr_codes || 0}</div>
                    <div className="text-xs text-muted-foreground">Gegenereerd</div>
                </div>
                <div className="p-6 bg-card rounded-xl border shadow-sm">
                    <div className="text-sm font-medium text-muted-foreground">Server Status</div>
                    <div className="text-2xl font-bold text-green-500">Online</div>
                    <div className="text-xs text-muted-foreground">Backend connection OK</div>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-1">
                <div className="p-6 bg-card rounded-xl border shadow-sm h-[400px] overflow-y-auto">
                    <h3 className="font-semibold mb-4">Activiteit Logboek</h3>
                    <div className="space-y-4">
                        {activity.map((act) => (
                            <div key={act.id} className="flex gap-4 items-start pb-4 border-b last:border-0 relative">
                                <div className="w-2 h-2 mt-2 rounded-full bg-blue-500 shrink-0" />
                                <div>
                                    <p className="text-sm font-medium">{act.username} <span className="text-muted-foreground font-normal">heeft</span> {act.action}</p>
                                    <p className="text-xs text-muted-foreground mb-1">{act.details}</p>
                                    <p className="text-[10px] text-gray-400">
                                        {formatDistanceToNow(new Date(act.timestamp), { addSuffix: true, locale: nl })}
                                    </p>
                                </div>
                            </div>
                        ))}
                        {activity.length === 0 && <p className="text-muted-foreground text-sm">Geen recente activiteit.</p>}
                    </div>
                </div>
            </div>
        </div>
    );
}
