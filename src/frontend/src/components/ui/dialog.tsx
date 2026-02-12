import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { Button } from './button';

interface DialogProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
}

export function Dialog({ isOpen, onClose, title, children, footer }: DialogProps) {
    return (
        <AnimatePresence>
            {isOpen && (
                <>



                    {/* Content Container */}
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="relative w-full max-w-md bg-white rounded-2xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] border border-slate-200 flex flex-col overflow-hidden pointer-events-auto"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-white">
                                <h2 className="text-xl font-bold tracking-tight text-slate-900 text-center w-full">{title}</h2>
                                <Button variant="ghost" size="icon" onClick={onClose} className="absolute right-4 top-4 h-8 w-8 rounded-full hover:bg-slate-100">
                                    <X className="w-4 h-4 text-slate-400" />
                                </Button>
                            </div>

                            <div className="p-6 space-y-4">
                                {children}
                            </div>

                            {footer && (
                                <div className="flex flex-col-reverse sm:flex-row sm:justify-center gap-3 p-6 border-t border-slate-100 bg-white">
                                    {footer}
                                </div>
                            )}
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    );
}
