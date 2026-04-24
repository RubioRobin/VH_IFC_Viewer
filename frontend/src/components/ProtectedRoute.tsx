import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { api } from '../lib/api';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const [status, setStatus] = useState<'loading' | 'ok' | 'unauth'>('loading');

    useEffect(() => {
        api.checkAuth()
            .then(() => setStatus('ok'))
            .catch(() => setStatus('unauth'));
    }, []);

    if (status === 'loading') {
        return (
            <div className="h-screen flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (status === 'unauth') {
        return <Navigate to="/login" replace />;
    }

    return <>{children}</>;
}
