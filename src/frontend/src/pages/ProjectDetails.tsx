import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchAPI } from '../lib/api';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
import { Button } from '../components/ui/button';
import { ArrowLeft, Upload, FileText, Download, Trash2, Loader2, HardDrive, Eye, Calendar, Database } from 'lucide-react';
import { useToast } from '../components/ui/toast';
import { formatDistanceToNow } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Input } from '../components/ui/input';

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

interface Revision {
    id: string;
    status: 'pending' | 'uploaded' | 'processing' | 'ready' | 'failed';
    created_at: string;
    file_name: string;
    file_size?: number;
}

interface Model {
    id: string;
    name: string;
    revisions: Revision[];
}

export function ProjectDetailsPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [project, setProject] = useState<Project | null>(null);
    const [files, setFiles] = useState<FileData[]>([]);
    const [models, setModels] = useState<Model[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (id) loadData();
    }, [id]);

    const loadData = async () => {
        try {
            setLoading(true);
            const [projectData, filesData, modelsData] = await Promise.all([
                fetchAPI(`/projects/${id}`),
                fetchAPI(`/projects/${id}/files`),
                fetchAPI(`/projects/${id}/models`)
            ]);
            setProject(projectData);
            setFiles(filesData);
            setModels(modelsData);
        } catch (error) {
            console.error(error);
            toast({ type: 'error', title: 'Error', message: 'Kon projectgegevens niet laden.' });
            navigate('/projects');
        } finally {
            setLoading(false);
        }
    };

    const handleManualUpload = async (event: React.ChangeEvent<HTMLInputElement>, model: Model, revision: Revision) => {
        const file = event.target.files?.[0];
        if (!file || !id) return;

        // Reset input
        event.target.value = '';

        try {
            setUploading(true);
            toast({ type: 'info', title: 'Upload gestart', message: `Bezig met uploaden naar ${model.name}...` });

            const formData = new FormData();
            formData.append('file', file);

            const res = await fetch(`${BASE_URL}/api/projects/${id}/models/${model.id}/revisions/${revision.id}/upload`, {
                method: 'POST',
                credentials: 'include',
                body: formData,
            });

            if (!res.ok) throw new Error('Upload failed');

            await res.json();
            toast({ type: 'success', title: 'Upload voltooid', message: 'Bestand is gekoppeld en QR code is actief.' });
            loadData();

        } catch (error) {
            console.error(error);
            toast({ type: 'error', title: 'Upload fout', message: 'Kon bestand niet uploaden naar deze revisie.' });
        } finally {
            setUploading(false);
        }
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const filesToUpload = event.target.files;
        if (!filesToUpload || filesToUpload.length === 0 || !id) return;

        const fileList = Array.from(filesToUpload);
        // Reset input
        event.target.value = '';

        setUploading(true);
        let successCount = 0;
        let failCount = 0;

        try {
            toast({ type: 'info', title: 'Upload gestart', message: `${fileList.length} bestand(en) aan het uploaden...` });

            await Promise.all(fileList.map(async (file) => {
                try {
                    // 1. Get Ticket
                    const ticketRes = await fetchAPI('/upload/ticket', {
                        method: 'POST',
                        body: JSON.stringify({
                            projectId: id,
                            fileName: file.name
                        })
                    });

                    const { fileId, uploadUrl, storagePath } = ticketRes;

                    // 2. Direct Upload to Supabase Storage
                    const uploadRes = await fetch(uploadUrl, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': file.type || 'application/octet-stream'
                        },
                        body: file
                    });

                    if (!uploadRes.ok) throw new Error('Upload to storage failed');

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
                } catch (err) {
                    console.error(`Failed to upload ${file.name}`, err);
                    failCount++;
                }
            }));

            if (successCount > 0) {
                toast({ type: 'success', title: 'Upload voltooid', message: `${successCount} bestand(en) succesvol toegevoegd.` });
                loadData();
            }
            if (failCount > 0) {
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
        if (!confirm('Weet je zeker dat je dit bestand wilt verwijderen?')) return;
        try {
            await fetchAPI(`/files/${fileId}`, { method: 'DELETE' });
            toast({ type: 'success', title: 'Verwijderd', message: 'Bestand is verwijderd.' });
            setFiles(files.filter(f => f.id !== fileId));
        } catch (error) {
            toast({ type: 'error', title: 'Fout', message: 'Kon bestand niet verwijderen.' });
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

    const getDiskFilename = (file: FileData) => {
        return file.filepath ? file.filepath.split(/[\\/]/).pop() : file.filename;
    };

    if (loading) return <div className="h-full flex items-center justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            {/* ... (Header and Stats omitted for brevity, logic remains same) ... */}
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
                            <h2 className="text-3xl font-bold tracking-tight">{project?.name}</h2>
                            <p className="text-muted-foreground">{project?.description}</p>
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

            {/* Validated/Reserved Models Section */}
            {models.length > 0 && (
                <div className="bg-white dark:bg-card rounded-xl border shadow-sm overflow-hidden mb-8">
                    <div className="p-6 border-b bg-blue-50/50 dark:bg-blue-900/10">
                        <h3 className="font-bold text-lg flex items-center gap-2">
                            <Database className="w-5 h-5 text-blue-600" />
                            Gereserveerde Modellen (Revit Plugin)
                        </h3>
                        <p className="text-sm text-muted-foreground">Hier staan modellen waarvoor al een QR code is gegenereerd.</p>
                    </div>
                    <div className="divide-y">
                        {models.map(model => (
                            <React.Fragment key={model.id}>
                                {model.revisions.map(rev => (
                                    <div key={rev.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-gray-50 dark:hover:bg-muted/50 transition-colors gap-4">
                                        <div className="flex items-center gap-4">
                                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${rev.status === 'ready' ? 'bg-green-100 text-green-600' :
                                                rev.status === 'pending' ? 'bg-orange-100 text-orange-600' : 'bg-gray-100'
                                                }`}>
                                                {rev.status === 'ready' ? <Eye className="w-5 h-5" /> : <Upload className="w-5 h-5" />}
                                            </div>
                                            <div>
                                                <h4 className="font-semibold text-base">{model.name}</h4>
                                                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                                                    <span className="bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">{rev.status}</span>
                                                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {formatDistanceToNow(new Date(rev.created_at), { addSuffix: true, locale: nl })}</span>
                                                    {rev.file_name && <span>{rev.file_name}</span>}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            {rev.status === 'pending' || rev.status === 'failed' ? (
                                                <div className="relative">
                                                    <input
                                                        type="file"
                                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                        accept=".ifc"
                                                        onChange={(e) => handleManualUpload(e, model, rev)}
                                                        disabled={uploading}
                                                    />
                                                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700 gap-2">
                                                        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                                        Upload Bestand
                                                    </Button>
                                                </div>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-9 gap-2 hover:bg-green-50 hover:text-green-600 hover:border-green-200"
                                                    onClick={() => window.open(`${window.location.origin}/?modelId=${model.id}&shareId=${rev.id}`, '_blank')} // Note: shareId likely different, usage depends on viewer routing
                                                >
                                                    <Eye className="w-4 h-4" /> Bekijk Model
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </React.Fragment>
                        ))}
                    </div>
                </div>
            )}

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
                                        <h4 className="font-semibold text-base group-hover:text-blue-600 transition-colors">{f.filename}</h4>
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
                                        className="h-9 w-9 text-muted-foreground hover:text-green-600"
                                        title="Downloaden"
                                        onClick={() => window.open(`${BASE_URL}/api/files/${f.id}/download`, '_blank')}
                                    >
                                        <Download className="w-4 h-4" />
                                    </Button>
                                    <div className="w-px h-6 bg-border mx-1"></div>
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
        </div>
    );
}
