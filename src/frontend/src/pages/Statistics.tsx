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
                const fetchDays = period > 7 ? 366 : 7; // Use 366 to cover leap years
                const data = await fetchAPI(`/statistics/detailed?days=${fetchDays}`);
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

    const getMonthName = (monthIndex: number) => {
        return new Intl.DateTimeFormat('nl-NL', { month: 'long' }).format(new Date(2026, monthIndex));
    };

    const rawMax = Math.max(...(stats?.timeline.map(t => t.count) || [0]), 1);
    const maxTimelineCount = Math.ceil(Math.max(rawMax, 5) / 5) * 5;
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
                        Scan Activiteit ({period === 365 ? new Date().getFullYear() : period === 30 ? getMonthName(new Date().getMonth()) : 'Deze week'})
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
                <div className="h-64 flex items-end justify-between px-2 sm:px-6 relative border-b border-slate-100 ml-8">
                    {(() => {
                        const yAxisSteps = [];
                        for (let i = maxTimelineCount; i >= 0; i -= 5) {
                            yAxisSteps.push(i);
                        }
                        return (
                            <>
                                {/* Y-axis Labels */}
                                <div className="absolute -left-10 inset-y-0 flex flex-col justify-between text-[10px] font-black text-slate-300 py-1 pointer-events-none text-right w-8">
                                    {yAxisSteps.map(step => (
                                        <span key={step}>{step}</span>
                                    ))}
                                </div>

                                {/* Background Grid Lines */}
                                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-[0.05]">
                                    {yAxisSteps.map(step => (
                                        <div key={step} className="border-t border-slate-900 w-full h-0" />
                                    ))}
                                </div>
                            </>
                        );
                    })()}

                    {(() => {
                        // Helper for local YYYY-MM-DD
                        const formatLocalDate = (date: Date) => {
                            const y = date.getFullYear();
                            const m = String(date.getMonth() + 1).padStart(2, '0');
                            const d = String(date.getDate()).padStart(2, '0');
                            return `${y}-${m}-${d}`;
                        };

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
                                const dateStr = formatLocalDate(d);
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
                        } else if (period === 30) {
                            // Calendar Month: 1st to End
                            const now = new Date();
                            const year = now.getFullYear();
                            const month = now.getMonth();
                            const daysInMonth = new Date(year, month + 1, 0).getDate();

                            for (let i = 1; i <= daysInMonth; i++) {
                                const d = new Date(year, month, i);
                                const dateStr = formatLocalDate(d);
                                const dataPoint = stats?.timeline.find(t => t.date === dateStr);

                                days.push({
                                    date: dateStr,
                                    count: dataPoint?.count || 0,
                                    dayNum: i,
                                    isToday: d.toDateString() === now.toDateString(),
                                    isStart: i === 1,
                                    isMid: i === Math.floor(daysInMonth / 2),
                                    isEnd: i === daysInMonth
                                });
                            }
                        } else {
                            // Calendar Year: Jan to Dec (as 12 monthly bars)
                            const year = new Date().getFullYear();
                            for (let m = 0; m < 12; m++) {
                                const daysInMonth = new Date(year, m + 1, 0).getDate();
                                let monthCount = 0;
                                let monthDateStr = "";

                                for (let d = 1; d <= daysInMonth; d++) {
                                    const dateStr = formatLocalDate(new Date(year, m, d));
                                    if (d === 1) monthDateStr = dateStr;
                                    const dataPoint = stats?.timeline.find(t => t.date === dateStr);
                                    monthCount += dataPoint?.count || 0;
                                }

                                days.push({
                                    date: monthDateStr,
                                    count: monthCount,
                                    monthName: new Intl.DateTimeFormat('nl-NL', { month: 'short' }).format(new Date(year, m, 1)).replace('.', ''),
                                    isToday: new Date().getMonth() === m,
                                    isMonth: true
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
                                    {period === 30 && ((t as any).isStart || (t as any).isMid || (t as any).isEnd) && (
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                                            {(t as any).dayNum} {getMonthName(new Date().getMonth()).slice(0, 3)}
                                        </span>
                                    )}
                                    {period === 365 && (
                                        <span className={`text-[10px] font-bold uppercase ${t.isToday ? 'text-indigo-600' : 'text-slate-400'}`}>
                                            {(t as any).monthName}
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
