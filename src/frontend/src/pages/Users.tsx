import React, { useState, useEffect } from 'react';
import { DataTable, Column } from '../components/dashboard/DataTable';
import { Button } from '../components/ui/button';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { useToast } from '../components/ui/toast';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { Dialog } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { fetchAPI } from '../lib/api';
import { formatDistanceToNow } from 'date-fns';
import { nl } from 'date-fns/locale';
import { motion } from 'framer-motion';

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
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newRole, setNewRole] = useState('user');

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

    useEffect(() => {
        if (createDialogOpen) {
            setNewUsername('');
            setNewPassword('');
            setNewRole('admin');
        }
    }, [createDialogOpen]);

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

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newUsername.trim() || !newPassword.trim()) return;

        setCreating(true);
        try {
            const newUser = await fetchAPI('/users', {
                method: 'POST',
                body: JSON.stringify({
                    username: newUsername,
                    password: newPassword,
                    role: newRole
                })
            });

            toast({ type: 'success', title: 'Succes', message: 'Gebruiker aangemaakt!' });
            setData([newUser, ...data]);
            setCreateDialogOpen(false);
            setNewUsername('');
            setNewPassword('');
            setNewRole('user');
        } catch (error: any) {
            console.error(error);
            toast({ type: 'error', title: 'Fout', message: error.message || 'Kon gebruiker niet aanmaken' });
        } finally {
            setCreating(false);
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
            render: (u) => {
                const isLastUser = data.length <= 1;
                return (
                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="icon"
                            disabled={isLastUser}
                            className={`h-8 w-8 ${isLastUser ? 'text-muted-foreground opacity-50 cursor-not-allowed' : 'text-red-500 hover:text-red-600 hover:bg-red-50'}`}
                            onClick={() => !isLastUser && handleDeleteClick(u)}
                            title={isLastUser ? "Laatste gebruiker kan niet worden verwijderd" : "Verwijderen"}
                        >
                            <Trash2 className="w-4 h-4" />
                        </Button>
                    </div>
                );
            }
        }
    ];

    return (
        <motion.div
            className="space-y-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
        >
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Gebruikers</h2>
                    <p className="text-muted-foreground">Beheer accounts en permissies.</p>
                </div>
                <Button
                    onClick={() => setCreateDialogOpen(true)}
                    className="bg-primary hover:bg-primary/90 px-8 py-6 text-base font-bold shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all"
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

            <Dialog
                isOpen={createDialogOpen}
                onClose={() => setCreateDialogOpen(false)}
                onOpenChange={(open) => {
                    if (open) {
                        setNewUsername('');
                        setNewPassword('');
                        setNewRole('user');
                    }
                    setCreateDialogOpen(open);
                }}
                title="Nieuwe Gebruiker"
                footer={
                    <>
                        <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Annuleren</Button>
                        <Button onClick={handleCreateUser} disabled={creating || !newUsername || !newPassword} className="bg-primary hover:bg-primary/90 min-w-[100px]">
                            {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Aanmaken
                        </Button>
                    </>
                }
            >
                <form onSubmit={handleCreateUser} className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Gebruikersnaam</label>
                        <Input
                            placeholder="Bijv. jan.jansen"
                            value={newUsername}
                            onChange={(e) => setNewUsername(e.target.value)}
                            autoFocus
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Wachtwoord</label>
                        <Input
                            type="password"
                            placeholder="••••••••"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                        />
                    </div>
                </form>
            </Dialog>

            <ConfirmDialog
                isOpen={deleteDialogOpen}
                onClose={() => setDeleteDialogOpen(false)}
                onConfirm={handleConfirmDelete}
                title="Gebruiker verwijderen"
                description={`Weet je zeker dat je ${userToDelete?.username} wilt verwijderen?`}
                variant="destructive"
                confirmText="Verwijderen"
            />
        </motion.div>
    );
}
