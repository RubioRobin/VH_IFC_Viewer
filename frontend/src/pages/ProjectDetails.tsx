import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchAPI } from '../lib/api';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
import { Button } from '../components/ui/button';
import { Upload, FileText, Download, Trash2, Loader2, HardDrive, Eye, Calendar, Database } from 'lucide-react';
import { useToast } from '../components/ui/toast';
import { formatDistanceToNow } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Input } from '../components/ui/input';
import { ConfirmDialog } from '../components/ui/confirm-dialog';

interface FileData {
    id: string;
    filename: string;
    filepath?: string;
    size: number;
    upload_date: string;
}

interface Project {
    id: string;
    name: string;
    description: string;
}

export function ProjectDetailsPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [project, setProject] = useState<Project | null>(null);
    const [files, setFiles] = useState<FileData[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [fileToDelete, setFileToDelete] = useState<string | null>(null);

    useEffect(() => {
        if (id) loadData();
    }, [id]);

    const loadData = async () => {
        try {
            setLoading(true);
            const [projectData, filesData] = await Promise.all([
                fetchAPI(`/projects/${id}`),
                fetchAPI(`/projects/${id}/files`)
            ]);
            setProject(projectData);
            setFiles(filesData);
        } catch (error) {
            console.error(error);
            toast({ type: 'error', title: 'Fout', message: 'Kon projectgegevens niet laden.' });
            navigate('/projects');
        } finally {
            setLoading(false);
        }
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = Array.from(event.target.files || []);
        if (selectedFiles.length === 0 || !id) return;

        // Reset input
        if (fileInputRef.current) fileInputRef.current.value = '';

        try {
            setUploading(true);
            toast({ type: 'info', title: 'Upload gestart', message: `Bezig met uploaden van ${selectedFiles.length} bestand(en)...` });

            let successCount = 0;
            let failCount = 0;
            let hasAuthError = false;

            await Promise.all(selectedFiles.map(async (file) => {
                try {
                    // 1. Get Ticket
                    const ticket = await fetchAPI('/upload/ticket', {
                        method: 'POST',
                        body: JSON.stringify({
                            projectId: id,
                            fileName: file.name
                        })
                    });

                    const { fileId, uploadUrl, storagePath } = ticket;

                    // 2. Upload to Storage
                    await fetch(uploadUrl, {
                        method: 'PUT',
                        body: file,
                        headers: { 'Content-Type': 'application/octet-stream' }
                    });

                    // 3. Confirm
                    await fetchAPI('/upload/confirm', {
                        method: 'POST',
                        body: JSON.stringify({
                            fileId,
                            projectId: id,
                            fileName: file.name,
                            fileSize: file.size,
                            storagePath
                        })
                    });

                    successCount++;
                } catch (err: any) {
                    console.error(`Upload van ${file.name} mislukt`, err);
                    failCount++;
                    if (err.message === 'Unauthorized') {
                        hasAuthError = true;
                    }
                }
            }));

            if (successCount > 0) {
                toast({ type: 'success', title: 'Upload voltooid', message: `${successCount} bestand(en) succesvol toegevoegd.` });
                loadData();
            }
            if (failCount > 0 && !hasAuthError) {
                toast({ type: 'error', title: 'Waarschuwing', message: `${failCount} bestand(en) konden niet worden geupload.` });
            }

        } catch (error) {
            console.error(error);
            toast({ type: 'error', title: 'Upload fout', message: 'Er ging iets mis tijdens het uploaden.' });
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (fileId: string) => {
        setFileToDelete(fileId);
        setIsConfirmOpen(true);
    };

    const handleDownload = async (file: FileData) => {
        try {
            const { url, filename } = await fetchAPI(`/files/${file.id}/signed-url`);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.target = '_blank';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } catch {
            toast({ type: 'error', title: 'Fout', message: 'Kon bestand niet downloaden.' });
        }
    };

    const confirmDelete = async () => {
        if (!fileToDelete) return;
        try {
            await fetchAPI(`/files/${fileToDelete}`, { method: 'DELETE' });
            toast({ type: 'success', title: 'Verwijderd', message: 'Bestand is verwijderd.' });
            setFiles(files.filter(f => f.id !== fileToDelete));
        } catch (error) {
            toast({ type: 'error', title: 'Fout', message: 'Kon bestand niet verwijderen.' });
        } finally {
            setFileToDelete(null);
        }
    };

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const indexes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + indexes[i];
    };

    const filteredFiles = files.filter(f =>
        f.filename.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) return <div className="h-full flex items-center justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                        <span
                            className="cursor-pointer hover:underline"
                            onClick={() => navigate('/projects')}
                        >
                            Projecten
                        </span>
                        <span>/</span>
                        <span className="font-medium text-foreground">{project?.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-blue-600 rounded-lg shadow-sm">
                            <FileText className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h2 className="text-4xl font-extrabold tracking-tight text-slate-900">{project?.name}</h2>
                            <p className="text-slate-500 mt-1 max-w-2xl text-lg">{project?.description}</p>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept=".ifc"
                        multiple
                        onChange={handleFileUpload}
                    />
                    <Button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="bg-blue-600 hover:bg-blue-700">
                        {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                        Upload Bestand
                    </Button>
                </div>
            </div>

            {/* Quick Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-card p-4 rounded-xl border shadow-sm flex items-center gap-4">
                    <div className="p-2 bg-blue-50 dark:bg-blue-900/10 rounded-lg text-blue-600">
                        <Database className="w-5 h-5" />
                    </div>
                    <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Aantal Bestanden</p>
                        <p className="text-2xl font-bold">{files.length}</p>
                    </div>
                </div>
                <div className="bg-white dark:bg-card p-4 rounded-xl border shadow-sm flex items-center gap-4">
                    <div className="p-2 bg-green-50 dark:bg-green-900/10 rounded-lg text-green-600">
                        <HardDrive className="w-5 h-5" />
                    </div>
                    <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Totale Opslag</p>
                        <p className="text-2xl font-bold">{formatBytes(files.reduce((a, b) => a + (b.size || 0), 0))}</p>
                    </div>
                </div>
            </div>

            {/* Content Area - Custom List View */}
            <div className="bg-white dark:bg-card rounded-xl border shadow-sm overflow-hidden">
                <div className="p-6 border-b flex flex-col sm:flex-row items-center justify-between gap-4 bg-gray-50/50 dark:bg-muted/10">
                    <div>
                        <h3 className="font-bold text-lg">Project Bestanden</h3>
                        <p className="text-sm text-muted-foreground">Beheer alle bestanden in dit project</p>
                    </div>
                    <div className="relative w-full sm:w-72">
                        <Input
                            placeholder="Zoek bestand..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-white dark:bg-background/50"
                        />
                    </div>
                </div>

                <div className="divide-y">
                    {filteredFiles.length > 0 ? (
                        filteredFiles.map((f) => (
                            <div key={f.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-gray-50 dark:hover:bg-muted/50 transition-colors group gap-4">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 shrink-0">
                                        <FileText className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-base group-hover:text-blue-600 transition-colors">
                                            {(() => {
                                                // Clean filename: Remove UUIDs and clean up artifacts
                                                // Pattern: "Name_UUID.ext" or "Name_UUID.Name.ext"
                                                let name = f.filename || '';

                                                // 1. Remove UUIDs (case insensitive)
                                                name = name.replace(/_?[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}_?/g, '');

                                                // 2. Remove double dots
                                                name = name.replace(/\.\.+/g, '.');

                                                // 3. Fix "Name.Name.ext" pattern (e.g. "Test.Test.ifc" -> "Test.ifc")
                                                // Split by dot
                                                const parts = name.split('.');
                                                if (parts.length >= 3) {
                                                    const ext = parts.pop(); // ifc
                                                    const lastPart = parts[parts.length - 1]; // Test
                                                    const secondLastPart = parts[parts.length - 2]; // Test

                                                    if (lastPart === secondLastPart) {
                                                        parts.pop(); // Remove duplicate
                                                    }
                                                    name = [...parts, ext].join('.');
                                                }

                                                return name;
                                            })()}
                                        </h4>
                                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                                            <span className="flex items-center gap-1"><HardDrive className="w-3 h-3" /> {formatBytes(f.size)}</span>
                                            <span className="hidden sm:inline">•</span>
                                            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {f.upload_date ? formatDistanceToNow(new Date(f.upload_date), { addSuffix: true, locale: nl }) : 'Onbekend'}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 self-end sm:self-center">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-9 gap-2 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200"
                                        onClick={() => window.open(`${window.location.origin}/?fileId=${f.id}`, '_blank')}
                                    >
                                        <Eye className="w-4 h-4" /> Openen
                                    </Button>

                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-9 w-9 text-muted-foreground hover:text-blue-500 hover:bg-blue-50"
                                        title="Download IFC"
                                        onClick={() => handleDownload(f)}
                                    >
                                        <Download className="w-4 h-4" />
                                    </Button>

                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-9 w-9 text-muted-foreground hover:text-red-500 hover:bg-red-50"
                                        title="Verwijderen"
                                        onClick={() => handleDelete(f.id)}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="p-12 text-center">
                            <div className="w-16 h-16 bg-gray-100 dark:bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                                <FileText className="w-8 h-8 text-muted-foreground opacity-50" />
                            </div>
                            <h3 className="text-lg font-medium">Geen bestanden gevonden</h3>
                            <p className="text-muted-foreground text-sm mt-1">Upload een nieuw IFC bestand om te beginnen.</p>
                        </div>
                    )}
                </div>
            </div>

            <ConfirmDialog
                isOpen={isConfirmOpen}
                onClose={() => setIsConfirmOpen(false)}
                onConfirm={confirmDelete}
                title="Bestand Verwijderen"
                description="Weet je zeker dat je dit bestand wilt verwijderen? Dit kan niet ongedaan worden gemaakt."
                variant="destructive"
                confirmText="Verwijderen"
            />
        </div>
    );
}
