import React, { useEffect, useState } from 'react';
import { fetchAPI } from '../lib/api';
import { Skeleton } from '../components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';
import { nl } from 'date-fns/locale';
import { motion } from 'framer-motion';

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

import { useNavigate } from 'react-router-dom';
import {
    LayoutDashboard,
    FolderKanban,
    FileUp,
    QrCode,
    Activity as ActivityIcon,
    Globe,
    Clock,
    User,
    ChevronRight,
    Search
} from 'lucide-react';
import { Button } from '../components/ui/button';

export function Dashboard() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [activity, setActivity] = useState<Activity[]>([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

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
        return (
            <div className="p-8 space-y-8 animate-pulse">
                <div className="flex justify-between items-center">
                    <Skeleton className="h-10 w-48" />
                    <Skeleton className="h-10 w-32" />
                </div>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                    {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)}
                </div>
                <Skeleton className="h-96 w-full rounded-2xl" />
            </div>
        );
    }

    return (
        <motion.div
            className="space-y-10 pb-10"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
        >
            {/* Header section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>

                    <h2 className="text-4xl font-extrabold tracking-tight text-slate-900">Overzicht</h2>
                    <p className="text-slate-500 mt-1 max-w-2xl text-lg">Beheer je BIM-modellen, projecten en live activiteit vanaf één plek.</p>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <div className="group relative p-6 bg-white rounded-2xl border border-slate-200/60 shadow-sm hover:shadow-xl hover:shadow-indigo-500/10 hover:-translate-y-1 transition-all duration-300">
                    <div className="absolute top-6 right-6 p-2 rounded-xl bg-indigo-50 text-indigo-500 group-hover:scale-110 transition-transform">
                        <FolderKanban className="w-5 h-5" />
                    </div>
                    <div className="text-sm font-bold text-slate-400 uppercase tracking-widest">Projecten</div>
                    <div className="text-4xl font-black text-slate-900 mt-2">{stats?.total_projects || 0}</div>
                    <div className="flex items-center gap-1.5 mt-3 text-xs font-semibold px-2.5 py-1 bg-green-50 text-green-600 rounded-full w-fit">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        {stats?.active_projects || 0} actief
                    </div>
                </div>

                <div className="group relative p-6 bg-white rounded-2xl border border-slate-200/60 shadow-sm hover:shadow-xl hover:shadow-blue-500/10 hover:-translate-y-1 transition-all duration-300">
                    <div className="absolute top-6 right-6 p-2 rounded-xl bg-blue-50 text-blue-500 group-hover:scale-110 transition-transform">
                        <FileUp className="w-5 h-5" />
                    </div>
                    <div className="text-sm font-bold text-slate-400 uppercase tracking-widest">Bestanden</div>
                    <div className="text-4xl font-black text-slate-900 mt-2">{stats?.total_files || 0}</div>
                    <div className="text-xs font-semibold text-slate-500 mt-3 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {formatBytes(stats?.total_storage || 0)} opslag
                    </div>
                </div>

                <div className="group relative p-6 bg-white rounded-2xl border border-slate-200/60 shadow-sm hover:shadow-xl hover:shadow-purple-500/10 hover:-translate-y-1 transition-all duration-300">
                    <div className="absolute top-6 right-6 p-2 rounded-xl bg-purple-50 text-purple-500 group-hover:scale-110 transition-transform">
                        <QrCode className="w-5 h-5" />
                    </div>
                    <div className="text-sm font-bold text-slate-400 uppercase tracking-widest">QR Codes</div>
                    <div className="text-4xl font-black text-slate-900 mt-2">{stats?.total_qr_codes || 0}</div>
                    <div className="text-xs font-semibold text-slate-500 mt-3">Keer gebruikt</div>
                </div>

                <div className="group relative p-6 bg-white rounded-2xl border border-slate-200/60 shadow-sm hover:shadow-xl hover:shadow-emerald-500/10 hover:-translate-y-1 transition-all duration-300">
                    <div className="absolute top-6 right-6 p-2 rounded-xl bg-emerald-50 text-emerald-500 group-hover:scale-110 transition-transform">
                        <Globe className="w-5 h-5" />
                    </div>
                    <div className="text-sm font-bold text-slate-400 uppercase tracking-widest">Server Status</div>
                    <div className="text-4xl font-black text-emerald-500 mt-2">ONLINE</div>
                    <div className="text-xs font-semibold text-slate-500 mt-3 italic shrink-0 truncate">Backend connection OK</div>
                </div>
            </div>

            {/* Bottom Row - Activity Log */}
            <div className="grid gap-6 md:grid-cols-3">
                <div className="md:col-span-3 bg-white rounded-3xl border border-slate-200/60 shadow-sm overflow-hidden flex flex-col">
                    <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-slate-50 rounded-xl text-slate-600">
                                <ActivityIcon className="w-5 h-5" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900">Recent Activiteit Logboek</h3>
                        </div>
                    </div>

                    <div className="divide-y divide-slate-50 max-h-[500px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                        {activity.map((act) => (
                            <div key={act.id} className="p-6 flex items-start gap-5 hover:bg-slate-50 transition-colors group">
                                <div className="p-2.5 rounded-2xl bg-slate-50 text-slate-400 group-hover:bg-primary/5 group-hover:text-primary transition-all shadow-sm">
                                    <User className="w-5 h-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1">
                                        <p className="text-sm font-bold text-slate-900">
                                            {act.username}
                                            <span className="text-slate-500 font-medium ml-2">heeft {act.action}</span>
                                        </p>
                                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest bg-slate-100 px-2 py-0.5 rounded-full shrink-0 h-fit">
                                            {act.timestamp ? formatDistanceToNow(new Date(act.timestamp), { addSuffix: true, locale: nl }) : '-'}
                                        </span>
                                    </div>
                                    <p className="text-sm text-slate-500 leading-relaxed font-medium line-clamp-2">{act.details}</p>
                                </div>
                                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-primary group-hover:translate-x-1 transition-all shrink-0 self-center" />
                            </div>
                        ))}

                        {activity.length === 0 && (
                            <div className="p-20 text-center">
                                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                                    <Search className="w-10 h-10" />
                                </div>
                                <h4 className="text-lg font-bold text-slate-900">Geen activiteit gevonden</h4>
                                <p className="text-slate-500">Er is momenteel geen recente activiteit om weer te geven.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
