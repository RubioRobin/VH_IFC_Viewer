import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { fetchAPI } from '../lib/api';
import { useToast } from '../components/ui/toast';
import { Loader2 } from 'lucide-react';
import { prepareLegacyAdminLogin, supabase } from '../lib/supabase';

export function LoginPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();
    const { toast } = useToast();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const login = username.trim();
            const email = login.includes('@')
                ? login.toLowerCase()
                : await prepareLegacyAdminLogin(login);
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;

            // Verifieer ook de server-side adminrol voordat het dashboard opent.
            await fetchAPI('/auth/me');

            toast({ type: 'success', title: 'Welkom terug!', message: 'Je bent succesvol ingelogd.' });
            navigate('/');
        } catch (err: any) {
            console.error(err);
            await supabase.auth.signOut();
            toast({
                type: 'error',
                title: 'Inloggen mislukt',
                message: err instanceof Error ? err.message : 'Controleer je gegevens en probeer opnieuw.'
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="w-full max-w-md p-8 bg-white rounded-2xl shadow-lg border">
                <div className="text-center mb-8">
                    <div className="w-12 h-12 bg-primary text-primary-foreground rounded-2xl flex items-center justify-center mx-auto mb-4 text-xl font-bold">VH</div>
                    <h1 className="text-2xl font-bold">Admin Login</h1>
                    <p className="text-muted-foreground">Log in om het dashboard te openen.</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Gebruikersnaam of e-mailadres</label>
                        <Input
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="admin"
                            autoComplete="username"
                            disabled={isLoading}
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Wachtwoord</label>
                        <Input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            autoComplete="current-password"
                            disabled={isLoading}
                        />
                    </div>
                    <Button type="submit" className="w-full" disabled={isLoading}>
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Inloggen'}
                    </Button>
                </form>
            </div>
        </div>
    );
}
