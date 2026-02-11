import React, { createContext, useContext, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { cn } from '../../lib/utils';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
    id: string;
    type: ToastType;
    title: string;
    message?: string;
}

interface ToastContextValue {
    toast: (props: Omit<Toast, 'id'>) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) throw new Error('useToast must be used within a ToastProvider');
    return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const toast = useCallback(({ type, title, message }: Omit<Toast, 'id'>) => {
        const id = Math.random().toString(36).substring(7);
        setToasts((prev) => [...prev, { id, type, title, message }]);

        // Auto dismiss
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 5000);
    }, []);

    const removeToast = (id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    };

    return (
        <ToastContext.Provider value={{ toast }}>
            {children}
            <div className="fixed bottom-0 right-0 z-50 p-6 space-y-4 max-w-sm w-full pointer-events-none">
                <AnimatePresence>
                    {toasts.map((t) => (
                        <motion.div
                            key={t.id}
                            initial={{ opacity: 0, y: 20, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                            layout
                            className={cn(
                                "pointer-events-auto flex w-full items-start gap-4 rounded-2xl border p-4 pr-8 relative overflow-hidden",
                                "bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-white/20 dark:border-slate-800/50 shadow-[0_8px_32px_rgba(0,0,0,0.08)]",
                                "text-foreground"
                            )}
                        >
                            {/* Accent Glow */}
                            <div className={cn("absolute left-0 top-0 bottom-0 w-1.5",
                                t.type === 'success' && "bg-green-500/80",
                                t.type === 'error' && "bg-red-500/80",
                                t.type === 'info' && "bg-indigo-500/80",
                            )} />

                            <div className="shrink-0 p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                                {t.type === 'success' && <CheckCircle className="w-5 h-5 text-green-500" />}
                                {t.type === 'error' && <AlertCircle className="w-5 h-5 text-red-500" />}
                                {t.type === 'info' && <Info className="w-5 h-5 text-indigo-500" />}
                            </div>

                            <div className="flex-1 pt-1">
                                <h3 className="font-bold text-sm tracking-tight">{t.title}</h3>
                                {t.message && <p className="text-sm text-muted-foreground/80 mt-1 leading-relaxed">{t.message}</p>}
                            </div>

                            <button
                                onClick={() => removeToast(t.id)}
                                className="absolute right-3 top-3 rounded-full p-1 opacity-40 hover:opacity-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </ToastContext.Provider>
    );
}
