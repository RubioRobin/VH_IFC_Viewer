import React, { useState, useEffect } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { useToast } from '../components/ui/toast';
import { fetchAPI, api } from '../lib/api';
import { motion } from 'framer-motion';
import { Save, User, Lock, Mail, Image as ImageIcon, Loader2 } from 'lucide-react';

export function ProfilePage() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Form state
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [avatarUrl, setAvatarUrl] = useState('');

    // Password change
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    useEffect(() => {
        loadProfile();
    }, []);

    const loadProfile = async () => {
        try {
            const user = await api.checkAuth();
            setUsername(user.username);
            setEmail(user.email || '');
            setAvatarUrl(user.avatar_url || '');
        } catch (err) {
            console.error(err);
            toast({ type: 'error', title: 'Fout', message: 'Kon profiel niet laden.' });
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();

        if (newPassword && newPassword !== confirmPassword) {
            toast({ type: 'error', title: 'Fout', message: 'Wachtwoorden komen niet overeen.' });
            return;
        }

        setSaving(true);
        try {
            const data = await fetchAPI('/auth/profile', {
                method: 'PUT',
                body: JSON.stringify({
                    email,
                    avatar_url: avatarUrl,
                    password: newPassword || undefined
                })
            });

            toast({ type: 'success', title: 'Opgeslagen', message: 'Je profiel is bijgewerkt!' });
            setNewPassword('');
            setConfirmPassword('');
        } catch (err: any) {
            toast({ type: 'error', title: 'Fout', message: err.message || 'Opslaan mislukt.' });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex h-96 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <motion.div
            className="max-w-4xl mx-auto space-y-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
        >
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Mijn Profiel</h2>
                <p className="text-muted-foreground">Beheer je accountinstellingen.</p>
            </div>

            <div className="bg-card rounded-lg border shadow-sm p-6 md:p-8">
                <form onSubmit={handleSave} className="space-y-8">

                    {/* Public Profile Section */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-medium border-b pb-2 flex items-center">
                            <User className="w-5 h-5 mr-2" /> Algemene Gegevens
                        </h3>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Gebruikersnaam</label>
                                <Input
                                    value={username}
                                    disabled
                                    className="bg-muted text-muted-foreground"
                                />
                                <p className="text-xs text-muted-foreground">Gebruikersnaam kan niet gewijzigd worden.</p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium">E-mailadres</label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="pl-9"
                                        placeholder="naam@voorbeeld.nl"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2 md:col-span-2">
                                <label className="text-sm font-medium">Avatar URL</label>
                                <div className="relative">
                                    <ImageIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        value={avatarUrl}
                                        onChange={(e) => setAvatarUrl(e.target.value)}
                                        className="pl-9"
                                        placeholder="https://..."
                                    />
                                </div>
                                {avatarUrl && (
                                    <div className="mt-2">
                                        <img
                                            src={avatarUrl}
                                            alt="Preview"
                                            className="h-16 w-16 rounded-full object-cover border-2 border-border"
                                            onError={(e) => (e.currentTarget.style.display = 'none')}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Security Section */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-medium border-b pb-2 flex items-center">
                            <Lock className="w-5 h-5 mr-2" /> Beveiliging
                        </h3>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Nieuw Wachtwoord</label>
                                <Input
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder="Laat leeg om niet te wijzigen"
                                    autoComplete="new-password"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium">Bevestig Wachtwoord</label>
                                <Input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Herhaal nieuw wachtwoord"
                                    disabled={!newPassword}
                                    autoComplete="new-password"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end pt-4">
                        <Button type="submit" size="lg" disabled={saving}>
                            {saving ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Opslaan...
                                </>
                            ) : (
                                <>
                                    <Save className="w-4 h-4 mr-2" /> Wijzigingen Opslaan
                                </>
                            )}
                        </Button>
                    </div>
                </form>
            </div>
        </motion.div>
    );
}
