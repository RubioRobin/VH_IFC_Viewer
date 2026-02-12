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
    Search,
    RotateCcw
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { ConfirmDialog } from '../components/ui/confirm-dialog';

interface DetailedStats {
    projects: { name: string; count: number }[];
    files: { name: string; count: number }[];
    timeline: { date: string; count: number }[];
}

export function Statistics() {
    const [stats, setStats] = useState<DetailedStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [resetDialogOpen, setResetDialogOpen] = useState(false);
    const [period, setPeriod] = useState(7); // Default to 7 days as requested

    useEffect(() => {
        const load = async () => {
            try {
                setLoading(true);
                const data = await fetchAPI(`/statistics/detailed?days=${period}`);
                setStats(data);
            } catch (err) {
                console.error("Detailed stats load failed", err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [period]);

    const handleResetStats = async () => {
        try {
            await fetchAPI('/statistics/reset', { method: 'POST' });
            // Refresh data
            const data = await fetchAPI('/statistics/detailed');
            setStats(data);
        } catch (error: any) {
            console.error('Fout bij resetten:', error);
        }
    };

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
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h2 className="text-4xl font-extrabold tracking-tight text-slate-900 flex items-center gap-3">
                        <BarChart3 className="w-10 h-10 text-primary" />
                        Statistieken Overzicht
                    </h2>
                    <p className="text-slate-500 mt-2 text-lg">Gedetailleerde inzichten in het gebruik van QR-codes en projectactiviteit.</p>
                </div>
                <Button
                    variant="outline"
                    className="flex items-center gap-2 border-slate-200 text-slate-600 hover:text-red-600 hover:border-red-100 hover:bg-red-50 transition-all duration-300 shadow-sm"
                    onClick={() => setResetDialogOpen(true)}
                >
                    <RotateCcw className="w-4 h-4" />
                    Reset Statistieken
                </Button>
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
                <div className="flex flex-col sm:flex-row items-center justify-between mb-8 gap-4">
                    <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-slate-400" />
                        Scan Activiteit ({period === 365 ? 'Laatste jaar' : period === 30 ? 'Laatste maand' : 'Deze week'})
                    </h3>
                    <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                        {[7, 30, 365].map((p) => (
                            <button
                                key={p}
                                onClick={() => setPeriod(p)}
                                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${period === p
                                    ? 'bg-white text-indigo-600 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'
                                    }`}
                            >
                                {p === 7 ? '7d' : p === 30 ? '1m' : '1j'}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="h-64 flex items-end justify-between px-2 sm:px-6 relative border-b border-slate-100">
                    {/* Background Grid Lines */}
                    <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-[0.03]">
                        {[0, 1, 2, 3, 4].map(i => <div key={i} className="border-t border-slate-900 w-full h-0" />)}
                    </div>

                    {(() => {
                        // Generate complete date range to ensure consistent chart width
                        const days = [];

                        if (period === 7) {
                            // Fixed week: Monday to Sunday
                            const today = new Date();
                            const dayOfWeek = today.getDay(); // 0 is Sunday, 1 is Monday...
                            const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
                            const monday = new Date(today);
                            monday.setDate(today.getDate() - diffToMonday);
                            monday.setHours(0, 0, 0, 0);

                            for (let i = 0; i < 7; i++) {
                                const d = new Date(monday);
                                d.setDate(monday.getDate() + i);
                                const dateStr = d.toISOString().split('T')[0];
                                const dataPoint = stats?.timeline.find(t => t.date === dateStr);
                                const dayName = d.toLocaleDateString('nl-NL', { weekday: 'short' }).replace('.', '');
                                const isToday = d.toDateString() === today.toDateString();

                                days.push({
                                    date: dateStr,
                                    count: dataPoint?.count || 0,
                                    dayName,
                                    isToday
                                });
                            }
                        } else {
                            // Rolling periods (30d, 1y)
                            for (let i = period - 1; i >= 0; i--) {
                                const d = new Date();
                                d.setDate(d.getDate() - i);
                                const dateStr = d.toISOString().split('T')[0];
                                const dataPoint = stats?.timeline.find(t => t.date === dateStr);
                                const dayName = d.toLocaleDateString('nl-NL', { weekday: 'short' }).replace('.', '');
                                const monthDay = d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });

                                days.push({
                                    date: dateStr,
                                    count: dataPoint?.count || 0,
                                    dayName,
                                    monthDay,
                                    isMonthStart: d.getDate() === 1,
                                    isToday: d.toDateString() === new Date().toDateString()
                                });
                            }
                        }

                        return days.map((t, i) => (
                            <div key={t.date} className="flex flex-col items-center flex-1 max-w-[60px] h-full relative group">
                                <motion.div
                                    className="w-full h-full flex flex-col justify-end"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: i * (0.2 / period) }}
                                >
                                    <motion.div
                                        className={`w-4 sm:w-8 transition-all rounded-t-[2px] mx-auto relative cursor-pointer ${t.isToday ? 'bg-indigo-600 shadow-[0_0_15px_rgba(79,70,229,0.3)]' : 'bg-indigo-500 hover:bg-indigo-600'
                                            }`}
                                        initial={{ height: 0 }}
                                        animate={{ height: `${(t.count / (maxTimelineCount || 1)) * 100}%` }}
                                        transition={{ delay: i * (0.3 / period), duration: 0.4, ease: "easeOut" }}
                                    >
                                        <div className="absolute -top-14 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] px-3 py-2 rounded-xl opacity-0 group-hover:opacity-100 transition-all shadow-2xl whitespace-nowrap z-20 pointer-events-none scale-90 group-hover:scale-100 mb-2">
                                            <div className="font-bold border-b border-white/10 pb-1 mb-1">{t.date}</div>
                                            <div className="text-indigo-200 flex items-center justify-between gap-4">
                                                <span>Scans:</span>
                                                <span className="font-black text-white">{t.count}</span>
                                            </div>
                                            <div className="absolute bottom-[-6px] left-1/2 -translate-x-1/2 border-[6px] border-transparent border-t-slate-900" />
                                        </div>
                                    </motion.div>
                                </motion.div>

                                {/* Label row directly under the bar */}
                                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap">
                                    {period === 7 && (
                                        <span className={`text-[10px] font-black uppercase tracking-widest ${t.isToday ? 'text-indigo-600' : 'text-slate-400'}`}>
                                            {t.isToday ? 'Vandaag' : t.dayName}
                                        </span>
                                    )}
                                    {period === 30 && (i === 0 || i === period - 1 || i === Math.floor(period / 2)) && (
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                                            {(t as any).monthDay}
                                        </span>
                                    )}
                                    {period === 365 && (t as any).isMonthStart && (
                                        <span className="text-[9px] font-bold text-slate-400 uppercase">
                                            {new Date(t.date).toLocaleDateString('nl-NL', { month: 'short' }).slice(0, 1)}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ));
                    })()}
                    {stats?.timeline.length === 0 && !loading && (
                        <div className="w-full h-full flex items-center justify-center text-slate-400 italic">
                            Geen activiteit geregistreerd in deze periode.
                        </div>
                    )}
                </div>
                <div className="h-8" /> {/* Spacer for labels */}
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

            <ConfirmDialog
                isOpen={resetDialogOpen}
                onClose={() => setResetDialogOpen(false)}
                onConfirm={handleResetStats}
                title="Statistieken Resetten"
                description="Weet je zeker dat je alle scan statistieken wilt resetten? Dit kan niet ongedaan worden gemaakt."
                variant="destructive"
                confirmText="Reset Alles"
            />
        </motion.div>
    );
}
