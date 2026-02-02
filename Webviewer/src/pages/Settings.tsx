import React from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { useToast } from '../components/ui/toast';

export function SettingsPage() {
    const { toast } = useToast();

    const handleSave = () => {
        toast({
            title: "Instellingen opgeslagen",
            message: "Je wijzigingen zijn succesvol opgeslagen.",
            type: "success"
        });
    }

    return (
        <div className="space-y-6 max-w-2xl">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Instellingen</h2>
                <p className="text-muted-foreground">Beheer systeem voorkeuren en administratie opties.</p>
            </div>

            <div className="space-y-4 bg-card p-6 rounded-xl border shadow-sm">
                <h3 className="font-semibold text-lg border-b pb-2">Algemeen</h3>

                <div className="space-y-2">
                    <label className="text-sm font-medium">Bedrijfsnaam</label>
                    <Input defaultValue="VH Engineering" />
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium">Admin E-mail</label>
                    <Input defaultValue="robin@vh-engineering.nl" />
                </div>
            </div>

            <div className="space-y-4 bg-card p-6 rounded-xl border shadow-sm">
                <h3 className="font-semibold text-lg border-b pb-2">Applicatie</h3>

                <div className="flex items-center justify-between">
                    <div>
                        <div className="font-medium">Onderhoudsmodus</div>
                        <div className="text-sm text-muted-foreground">Zet het systeem tijdelijk offline voor gebruikers.</div>
                    </div>
                    <Button variant="outline">Inschakelen</Button>
                </div>
            </div>

            <div className="flex justify-end">
                <Button onClick={handleSave}>Opslaan</Button>
            </div>
        </div>
    );
}
