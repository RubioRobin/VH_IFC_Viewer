import React, { useState, useEffect } from 'react';
import { DataTable, Column } from '../components/dashboard/DataTable';
import { Button } from '../components/ui/button';
import { Plus, Trash2, Loader2, KeyRound, UserX, UserCheck, ChevronDown } from 'lucide-react';
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
    disabled: boolean;
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
    const [resetPasswordDialogOpen, setResetPasswordDialogOpen] = useState(false);
    const [userToReset, setUserToReset] = useState<User | null>(null);
    const [newResetPassword, setNewResetPassword] = useState('');
    const [resetting, setResetting] = useState(false);
    const [roleDropdownOpen, setRoleDropdownOpen] = useState<string | null>(null);

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
        const handleClickOutside = () => { if (roleDropdownOpen) setRoleDropdownOpen(null); };
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, [roleDropdownOpen]);

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

    const handleRoleChange = async (user: User, newRole: string) => {
        try {
            await fetchAPI(`/users/${user.id}/role`, { method: 'PATCH', body: JSON.stringify({ role: newRole }) });
            setData(prev => prev.map(u => u.id === user.id ? { ...u, role: newRole } : u));
            toast({ type: 'success', title: 'Rol gewijzigd', message: `${user.username} is nu ${newRole}.` });
        } catch {
            toast({ type: 'error', title: 'Fout', message: 'Kon rol niet wijzigen.' });
        }
    };

    const handleToggleDisabled = async (user: User) => {
        const newDisabled = !user.disabled;
        try {
            await fetchAPI(`/users/${user.id}/disabled`, { method: 'PATCH', body: JSON.stringify({ disabled: newDisabled }) });
            setData(prev => prev.map(u => u.id === user.id ? { ...u, disabled: newDisabled } : u));
            toast({ type: 'success', title: newDisabled ? 'Uitgeschakeld' : 'Ingeschakeld', message: `${user.username} is ${newDisabled ? 'uitgeschakeld' : 'ingeschakeld'}.` });
        } catch {
            toast({ type: 'error', title: 'Fout', message: 'Kon status niet wijzigen.' });
        }
    };

    const handleResetPassword = async () => {
        if (!userToReset || !newResetPassword.trim()) return;
        setResetting(true);
        try {
            await fetchAPI(`/users/${userToReset.id}/reset-password`, { method: 'PATCH', body: JSON.stringify({ newPassword: newResetPassword }) });
            toast({ type: 'success', title: 'Wachtwoord gereset', message: `Wachtwoord van ${userToReset.username} is gewijzigd.` });
            setResetPasswordDialogOpen(false);
            setNewResetPassword('');
            setUserToReset(null);
        } catch {
            toast({ type: 'error', title: 'Fout', message: 'Kon wachtwoord niet resetten.' });
        } finally {
            setResetting(false);
        }
    };

    const columns: Column<User>[] = [
        {
            key: 'username',
            label: 'Gebruikersnaam',
            sortable: true,
            render: (u) => (
                <div className="flex items-center gap-2">
                    <span className={`font-medium ${u.disabled ? 'text-muted-foreground line-through' : ''}`}>{u.username}</span>
                    {u.disabled && <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-semibold">Uitgeschakeld</span>}
                </div>
            )
        },
        {
            key: 'role',
            label: 'Rol',
            sortable: true,
            render: (u) => {
                const isAdmin = u.role === 'admin';
                return (
                    <div className="relative" onClick={(e) => e.stopPropagation()}>
                        <button
                            onClick={() => setRoleDropdownOpen(roleDropdownOpen === u.id ? null : u.id)}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all hover:shadow-md ${isAdmin
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                        >
                            {u.role}
                            <ChevronDown className="w-3 h-3" />
                        </button>
                        {roleDropdownOpen === u.id && (
                            <div className="absolute top-full left-0 mt-2 bg-white rounded-2xl shadow-2xl border border-slate-200 py-1.5 z-[100] min-w-[130px]">
                                {['admin', 'user'].map((role) => (
                                    <button
                                        key={role}
                                        onClick={() => { handleRoleChange(u, role); setRoleDropdownOpen(null); }}
                                        className={`w-full px-4 py-2 text-left text-sm font-semibold transition-colors ${u.role === role ? 'bg-slate-50' : 'hover:bg-slate-50'}`}
                                    >
                                        {role}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                );
            }
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
                    <div className="flex items-center justify-start gap-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-indigo-500 hover:bg-indigo-50"
                            title="Wachtwoord resetten"
                            onClick={() => { setUserToReset(u); setNewResetPassword(''); setResetPasswordDialogOpen(true); }}
                        >
                            <KeyRound className="w-4 h-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className={`h-8 w-8 ${u.disabled ? 'text-green-500 hover:bg-green-50 hover:text-green-600' : 'text-amber-500 hover:bg-amber-50 hover:text-amber-600'}`}
                            title={u.disabled ? 'Inschakelen' : 'Uitschakelen'}
                            onClick={() => handleToggleDisabled(u)}
                        >
                            {u.disabled ? <UserCheck className="w-4 h-4" /> : <UserX className="w-4 h-4" />}
                        </Button>
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
                    <h2 className="text-4xl font-extrabold tracking-tight text-slate-900">Gebruikers</h2>
                    <p className="text-slate-500 mt-1 max-w-2xl text-lg">Beheer accounts en permissies.</p>
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

            <Dialog
                isOpen={resetPasswordDialogOpen}
                onClose={() => setResetPasswordDialogOpen(false)}
                onOpenChange={(open) => { if (!open) { setResetPasswordDialogOpen(false); setNewResetPassword(''); } }}
                title={`Wachtwoord resetten — ${userToReset?.username}`}
                footer={
                    <>
                        <Button variant="outline" onClick={() => setResetPasswordDialogOpen(false)}>Annuleren</Button>
                        <Button onClick={handleResetPassword} disabled={resetting || !newResetPassword} className="bg-primary hover:bg-primary/90 min-w-[100px]">
                            {resetting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Opslaan
                        </Button>
                    </>
                }
            >
                <div className="space-y-2">
                    <label className="text-sm font-medium">Nieuw wachtwoord</label>
                    <Input
                        type="password"
                        placeholder="••••••••"
                        value={newResetPassword}
                        onChange={(e) => setNewResetPassword(e.target.value)}
                        autoFocus
                    />
                </div>
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
