import React, { useState, useEffect } from 'react';
import { DataTable, Column } from '../components/dashboard/DataTable';
import { Button } from '../components/ui/button';
import { Plus, Trash2 } from 'lucide-react';
import { useToast } from '../components/ui/toast';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { fetchAPI } from '../lib/api';
import { formatDistanceToNow } from 'date-fns';
import { nl } from 'date-fns/locale';

interface User {
    id: string;
    username: string;
    role: string;
    created_at: string;
}

export function UsersPage() {
    const [data, setData] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [userToDelete, setUserToDelete] = useState<User | null>(null);

    const loadUsers = async () => {
        try {
            const users = await fetchAPI('/users');
            setData(users);
        } catch (err) {
            toast({ type: 'error', title: 'Fout bij laden', message: 'Kon gebruikers niet ophalen.' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadUsers();
    }, []);

    const handleDeleteClick = (user: User) => {
        setUserToDelete(user);
        setDeleteDialogOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (userToDelete) {
            try {
                await fetchAPI(`/users/${userToDelete.id}`, { method: 'DELETE' });
                setData(prev => prev.filter(u => u.id !== userToDelete!.id));
                toast({
                    type: 'success',
                    title: 'Gebruiker verwijderd',
                    message: `${userToDelete.username} is succesvol verwijderd.`
                });
            } catch (err) {
                toast({ type: 'error', title: 'Niet verwijderd', message: 'Er is iets misgegaan.' });
            }
        }
    };

    const columns: Column<User>[] = [
        { key: 'username', label: 'Gebruikersnaam', sortable: true, render: (u) => <div className="font-medium">{u.username}</div> },
        {
            key: 'role',
            label: 'Rol',
            sortable: true,
            render: (u) => (
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold
                ${u.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                        'bg-blue-100 text-blue-800'}`}>
                    {u.role}
                </span>
            )
        },
        {
            key: 'created_at',
            label: 'Aangemaakt',
            sortable: true,
            render: (u) => u.created_at ? formatDistanceToNow(new Date(u.created_at), { addSuffix: true, locale: nl }) : '-'
        },
        {
            key: 'id',
            label: 'Acties',
            render: (u) => (
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                        onClick={() => handleDeleteClick(u)}
                    >
                        <Trash2 className="w-4 h-4" />
                    </Button>
                </div>
            )
        }
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Gebruikers</h2>
                    <p className="text-muted-foreground">Beheer accounts en permissies.</p>
                </div>
                <Button
                    onClick={() => toast({ type: 'info', title: 'Info', message: 'Nieuwe gebruikers moeten via de database worden toegevoegd voor nu.' })}
                    className="bg-primary hover:bg-primary/90 rounded-3xl px-8 py-6 text-base font-bold shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all"
                >
                    <Plus className="w-5 h-5 mr-2" />
                    Nieuwe Gebruiker
                </Button>
            </div>

            <DataTable
                data={data}
                columns={columns}
                searchKey="username"
            />

            <ConfirmDialog
                isOpen={deleteDialogOpen}
                onClose={() => setDeleteDialogOpen(false)}
                onConfirm={handleConfirmDelete}
                title="Gebruiker verwijderen"
                description={`Weet je zeker dat je ${userToDelete?.username} wilt verwijderen?`}
                variant="destructive"
                confirmText="Verwijderen"
            />
        </div>
    );
}
