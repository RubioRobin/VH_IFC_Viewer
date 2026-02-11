import React, { useState, useEffect } from 'react';
import { fetchAPI, API_URL } from '../lib/api'; // Use API_URL from lib
import { Button } from '../components/ui/button';
import { QrCode, Plus, Trash2, Download, Copy, ExternalLink, Calendar, FileText } from 'lucide-react';
import { Dialog } from '../components/ui/dialog';
import { useToast } from '../components/ui/toast';
import { Input } from '../components/ui/input';
import { formatDistanceToNow } from 'date-fns';
import { nl } from 'date-fns/locale';

interface QRCode {
    id: string;
    project_id: string;
    file_id: string;
    element_id: string;
    qr_code_url: string; // The URL *in* the QR
    qr_image_path: string; // Local path
    created_at: string;
    filename?: string;
    project_name?: string;
}

interface Project {
    id: string;
    name: string;
}

export function QRCodesPage() {
    const [qrs, setQrs] = useState<QRCode[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [reserveOpen, setReserveOpen] = useState(false);

    // Reserve Form State
    const [selectedProject, setSelectedProject] = useState('');
    const [fileName, setFileName] = useState('');
    const [reservedResult, setReservedResult] = useState<{
        webUrl: string;
        fileId: string;
        storagePath: string;
    } | null>(null);

    const { toast } = useToast();

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const [qrData, projectData] = await Promise.all([
                fetchAPI('/qr'),
                fetchAPI('/projects')
            ]);
            setQrs(qrData);
            setProjects(projectData);
        } catch (error) {
            console.error(error);
            toast({ type: 'error', title: 'Fout', message: 'Kon gegevens niet laden.' });
        } finally {
            setLoading(false);
        }
    };

    const handleReserve = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedProject || !fileName) return;

        try {
            const res = await fetchAPI('/upload/reserve', {
                method: 'POST',
                body: JSON.stringify({
                    projectId: selectedProject,
                    fileName: fileName
                })
            });

            setReservedResult(res);
            toast({ type: 'success', title: 'Gereserveerd!', message: 'QR Code is aangemaakt.' });

            // Refresh list
            loadData();

        } catch (error) {
            toast({ type: 'error', title: 'Fout', message: 'Reserveren mislukt.' });
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Weet je zeker dat je deze QR code wilt verwijderen?')) return;
        try {
            await fetchAPI(`/qr/${id}`, { method: 'DELETE' });
            toast({ type: 'success', title: 'Verwijderd', message: 'QR code verwijderd.' });
            setQrs(qrs.filter(q => q.id !== id));
        } catch (error) {
            toast({ type: 'error', title: 'Fout', message: 'Kon niet verwijderen.' });
        }
    };

    const getBarcodeUrl = (data: string) => `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(data)}`;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">QR Codes</h2>
                    <p className="text-muted-foreground">Beheer en reserveer QR codes voor modellen.</p>
                </div>
                <Button onClick={() => { setReserveOpen(true); setReservedResult(null); }} className="bg-blue-600 hover:bg-blue-700">
                    <Plus className="w-4 h-4 mr-2" /> Nieuwe Reservering
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {qrs.map((qr) => (
                    <div key={qr.id} className="bg-white dark:bg-card rounded-xl border shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                        <div className="p-4 flex gap-4">
                            <div className="w-24 h-24 bg-gray-100 rounded-lg shrink-0 overflow-hidden flex items-center justify-center border">
                                <img
                                    src={`${API_URL}/qr-codes/${qr.id}.png`}
                                    alt="QR"
                                    className="w-full h-full object-contain"
                                    onError={(e) => {
                                        // Fallback if local image missing, generate on fly 
                                        (e.target as HTMLImageElement).src = getBarcodeUrl(qr.qr_code_url);
                                    }}
                                />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-sm truncate" title={qr.filename}>{qr.filename || 'Naamloos bestand'}</h3>
                                <p className="text-xs text-muted-foreground mb-2">{qr.project_name || 'Project onbekend'}</p>

                                <div className="space-y-1 text-xs text-muted-foreground">
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                                        <span>Element ID: {qr.element_id}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <Calendar className="w-3 h-3" />
                                        <span>{formatDistanceToNow(new Date(qr.created_at), { addSuffix: true, locale: nl })}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="bg-gray-50 dark:bg-muted/50 p-2 flex justify-between items-center border-t">
                            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => window.open(qr.qr_code_url, '_blank')}>
                                <ExternalLink className="w-3 h-3 mr-2" /> Test Link
                            </Button>
                            <div className="flex gap-1">
                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => {
                                    const link = document.createElement('a');
                                    link.href = `${API_URL}/qr-codes/${qr.id}.png`;
                                    link.download = `QR_${qr.filename || 'code'}.png`;
                                    link.click();
                                }}>
                                    <Download className="w-3 h-3" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => handleDelete(qr.id)}>
                                    <Trash2 className="w-3 h-3" />
                                </Button>
                            </div>
                        </div>
                    </div>
                ))}

                {qrs.length === 0 && !loading && (
                    <div className="col-span-full py-12 text-center border-2 border-dashed rounded-xl">
                        <div className="w-12 h-12 bg-gray-100 dark:bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                            <QrCode className="w-6 h-6 text-muted-foreground" />
                        </div>
                        <h3 className="text-lg font-medium">Geen QR codes gevonden</h3>
                        <p className="text-muted-foreground text-sm mt-1">Maak een reservering om een QR code te genereren.</p>
                    </div>
                )}
            </div>

            <Dialog
                isOpen={reserveOpen}
                onClose={() => setReserveOpen(false)}
                title="QR Code Reserveren"
                footer={!reservedResult && (
                    <div className="flex gap-2">
                        <Button variant="ghost" onClick={() => setReserveOpen(false)}>Annuleren</Button>
                        <Button onClick={handleReserve} className="bg-blue-600 hover:bg-blue-700">Genereer</Button>
                    </div>
                )}
            >
                {!reservedResult ? (
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Project</label>
                            <select
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                value={selectedProject}
                                onChange={(e) => setSelectedProject(e.target.value)}
                            >
                                <option value="">Selecteer een project...</option>
                                {projects.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Toekomstige bestandsnaam</label>
                            <Input
                                placeholder="Bijv. Constructie_V1.ifc"
                                value={fileName}
                                onChange={(e) => setFileName(e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">
                                Je krijgt een unieke ID die je moet toevoegen aan deze bestandsnaam.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg flex gap-4 items-start">
                            <img
                                src={getBarcodeUrl(reservedResult.webUrl)}
                                alt="QR"
                                className="w-32 h-32 bg-white p-2 rounded border"
                            />
                            <div className="flex-1 space-y-2">
                                <h4 className="font-semibold text-green-700 dark:text-green-400">Succesvol gereserveerd!</h4>
                                <p className="text-sm">Je bestand moet exact zo heten voordat je het uploadt, anders werkt de QR code niet:</p>

                                <div className="p-2 bg-black/5 dark:bg-white/10 rounded flex items-center justify-between group cursor-pointer"
                                    onClick={() => {
                                        // Construct filename logic simulation
                                        const ext = fileName.split('.').pop() || 'ifc';
                                        const base = fileName.replace('.' + ext, '');
                                        const safeBase = base.replace(/[^a-zA-Z0-9_\-]/g, '_');
                                        const targetName = `${safeBase}_${reservedResult.fileId}.${ext}`;
                                        navigator.clipboard.writeText(targetName);
                                        toast({ type: 'info', title: 'Gekopieerd', message: 'Bestandsnaam gekopieerd' });
                                    }}>
                                    <code className="text-xs break-all font-mono">
                                        {(() => {
                                            const ext = fileName.split('.').pop() || 'ifc';
                                            const base = fileName.replace('.' + ext, '');
                                            const safeBase = base.replace(/[^a-zA-Z0-9_\-]/g, '_');
                                            return `${safeBase}_${reservedResult.fileId}.${ext}`;
                                        })()}
                                    </code>
                                    <Copy className="w-4 h-4 opacity-50 group-hover:opacity-100" />
                                </div>

                                <Button size="sm" variant="outline" className="w-full mt-2" onClick={() => {
                                    const link = document.createElement('a');
                                    link.href = getBarcodeUrl(reservedResult.webUrl);
                                    link.download = "reserved_qr.png";
                                    link.click();
                                }}>
                                    <Download className="w-4 h-4 mr-2" /> Download QR
                                </Button>
                            </div>
                        </div>
                        <Button className="w-full" onClick={() => setReserveOpen(false)}>Sluiten</Button>
                    </div>
                )}
            </Dialog>
        </div>
    );
}
