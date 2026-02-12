import React, { useEffect, useState } from 'react';
import { fetchAPI } from '../lib/api';
import { Skeleton } from '../components/ui/skeleton';
import { motion } from 'framer-motion';
import {
    BarChart3,
    TrendingUp,
    QrCode,
    FolderKanban,
    FileText,
    Calendar,
    ArrowUpRight,
    ArrowDownRight,
    Search
} from 'lucide-react';
import { Button } from '../components/ui/button';

interface DetailedStats {
    projects: { name: string; count: number }[];
    files: { name: string; count: number }[];
    timeline: { date: string; count: number }[];
}

export function Statistics() {
    const [stats, setStats] = useState<DetailedStats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            try {
                const data = await fetchAPI('/statistics/detailed');
                setStats(data);
            } catch (err) {
                console.error("Detailed stats load failed", err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    if (loading) {
        return (
            <div className="p-8 space-y-8 animate-pulse">
                <Skeleton className="h-10 w-64" />
                <div className="grid gap-6 md:grid-cols-3">
                    <Skeleton className="h-32 rounded-2xl" />
                    <Skeleton className="h-32 rounded-2xl" />
                    <Skeleton className="h-32 rounded-2xl" />
                </div>
                <Skeleton className="h-[400px] rounded-3xl" />
            </div>
        );
    }

    const maxTimelineCount = Math.max(...(stats?.timeline.map(t => t.count) || [1]));
    const totalScans = stats?.timeline.reduce((sum, t) => sum + t.count, 0) || 0;

    return (
        <motion.div
            className="space-y-10 pb-10"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
        >
            {/* Header */}
            <div>
                <h2 className="text-4xl font-extrabold tracking-tight text-slate-900 flex items-center gap-3">
                    <BarChart3 className="w-10 h-10 text-primary" />
                    Statistieken Overzicht
                </h2>
                <p className="text-slate-500 mt-2 text-lg">Gedetailleerde inzichten in het gebruik van QR-codes en projectactiviteit.</p>
            </div>

            {/* Quick Stats */}
            <div className="grid gap-6 md:grid-cols-3">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-2 bg-indigo-50 text-indigo-500 rounded-xl">
                            <TrendingUp className="w-5 h-5" />
                        </div>
                        <span className="text-xs font-bold text-green-500 bg-green-50 px-2 py-1 rounded-full">+12%</span>
                    </div>
                    <div className="text-sm font-bold text-slate-400 uppercase tracking-widest">Totaal Scans (30d)</div>
                    <div className="text-3xl font-black text-slate-900 mt-1">{totalScans}</div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-2 bg-blue-50 text-blue-500 rounded-xl">
                            <FolderKanban className="w-5 h-5" />
                        </div>
                    </div>
                    <div className="text-sm font-bold text-slate-400 uppercase tracking-widest">Meest Actieve Project</div>
                    <div className="text-xl font-bold text-slate-900 mt-1 truncate">
                        {stats?.projects[0]?.name || 'Geen data'}
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-2 bg-purple-50 text-purple-500 rounded-xl">
                            <FileText className="w-5 h-5" />
                        </div>
                    </div>
                    <div className="text-sm font-bold text-slate-400 uppercase tracking-widest">Populairste IFC</div>
                    <div className="text-xl font-bold text-slate-900 mt-1 truncate">
                        {stats?.files[0]?.name || 'Geen data'}
                    </div>
                </div>
            </div>

            {/* Timeline Chart (Simple CSS implementation) */}
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-8">
                    <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-slate-400" />
                        Scan Activiteit (Laatste 30 dagen)
                    </h3>
                </div>
                <div className="h-64 flex items-end gap-1 sm:gap-2">
                    {stats?.timeline.map((t, i) => (
                        <motion.div
                            key={t.date}
                            className="flex-1 bg-primary/20 hover:bg-primary transition-colors rounded-t-sm relative group"
                            initial={{ height: 0 }}
                            animate={{ height: `${(t.count / maxTimelineCount) * 100}%` }}
                            transition={{ delay: i * 0.02, duration: 0.5 }}
                        >
                            <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                                {t.date}: {t.count}
                            </div>
                        </motion.div>
                    ))}
                    {stats?.timeline.length === 0 && (
                        <div className="w-full h-full flex items-center justify-center text-slate-400 italic">
                            Nog geen activiteit geregistreerd in de afgelopen 30 dagen.
                        </div>
                    )}
                </div>
                <div className="flex justify-between mt-4 text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                    <span>30 dagen geleden</span>
                    <span>Vandaag</span>
                </div>
            </div>

            {/* Tables Row */}
            <div className="grid gap-8 md:grid-cols-2">
                {/* Projects Table */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                        <h3 className="font-bold text-slate-900 flex items-center gap-2">
                            <FolderKanban className="w-4 h-4 text-slate-400" />
                            Scans per Project
                        </h3>
                    </div>
                    <div className="p-2">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
                                    <th className="px-4 py-3">Project</th>
                                    <th className="px-4 py-3 text-right">Scans</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {stats?.projects.map((p, i) => (
                                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3 text-sm font-semibold text-slate-700">{p.name}</td>
                                        <td className="px-4 py-3 text-sm font-black text-slate-900 text-right">
                                            <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-lg">{p.count}</span>
                                        </td>
                                    </tr>
                                ))}
                                {stats?.projects.length === 0 && (
                                    <tr>
                                        <td colSpan={2} className="px-4 py-8 text-center text-slate-400 italic text-sm">Geen data beschikbaar</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Files Table */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                        <h3 className="font-bold text-slate-900 flex items-center gap-2">
                            <FileText className="w-4 h-4 text-slate-400" />
                            Scans per IFC Bestand
                        </h3>
                    </div>
                    <div className="p-2">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
                                    <th className="px-4 py-3">Bestand</th>
                                    <th className="px-4 py-3 text-right">Scans</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {stats?.files.map((f, i) => (
                                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3 text-sm font-semibold text-slate-700 truncate max-w-[200px]">{f.name}</td>
                                        <td className="px-4 py-3 text-sm font-black text-slate-900 text-right">
                                            <span className="bg-purple-50 text-purple-600 px-2 py-0.5 rounded-lg">{f.count}</span>
                                        </td>
                                    </tr>
                                ))}
                                {stats?.files.length === 0 && (
                                    <tr>
                                        <td colSpan={2} className="px-4 py-8 text-center text-slate-400 italic text-sm">Geen data beschikbaar</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
