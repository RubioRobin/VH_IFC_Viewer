import React, { useState } from 'react';
import { Dialog } from './dialog';
import { Button } from './button';

interface ConfirmDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'default' | 'destructive';
}

export function ConfirmDialog({
    isOpen,
    onClose,
    onConfirm,
    title,
    description,
    confirmText = 'Bevestigen',
    cancelText = 'Annuleren',
    variant = 'default'
}: ConfirmDialogProps) {
    const [isLoading, setIsLoading] = useState(false);

    const handleConfirm = async () => {
        setIsLoading(true);
        await onConfirm();
        setIsLoading(false);
        onClose();
    };

    return (
        <Dialog
            isOpen={isOpen}
            onClose={onClose}
            title={title}
            footer={
                <>
                    <Button variant="outline" onClick={onClose} disabled={isLoading}>
                        {cancelText}
                    </Button>
                    <Button variant={variant} onClick={handleConfirm} disabled={isLoading}>
                        {isLoading ? 'Verwerken...' : confirmText}
                    </Button>
                </>
            }
        >
            <p className="text-muted-foreground">{description}</p>
        </Dialog>
    );
}
