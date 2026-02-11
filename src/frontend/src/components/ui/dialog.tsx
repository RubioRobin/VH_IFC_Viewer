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
                    {/* Content */}
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pointer-events-none">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="w-full max-w-lg bg-background rounded-lg shadow-lg border pointer-events-auto"
                        >
                            <div className="flex items-center justify-between p-6 border-b">
                                <h2 className="text-lg font-semibold">{title}</h2>
                                <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
                                    <X className="w-4 h-4" />
                                </Button>
                            </div>

                            <div className="p-6">
                                {children}
                            </div>

                            {footer && (
                                <div className="flex items-center justify-end gap-2 p-6 border-t bg-muted/20">
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
