import React, { useState, useEffect } from 'react';
import { fetchAPI } from '../lib/api';
import { Button } from '../components/ui/button';
import { Plus, Folder, FileText, MoreVertical, Loader2, Trash2, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Skeleton } from '../components/ui/skeleton';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '../components/ui/card';
import { formatDistanceToNow } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Dialog } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { useToast } from '../components/ui/toast';
import { ConfirmDialog } from '../components/ui/confirm-dialog';

interface Project {
    id: string;
    name: string;
    description: string;
    status: string;
    updated_at: string;
    created_at: string;
    file_count: number;
    total_size: number;
}

export function ProjectsPage() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [createOpen, setCreateOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

    const navigate = useNavigate();
    const { toast } = useToast();

    useEffect(() => {
        loadProjects();
    }, []);

    const loadProjects = async () => {
        try {
            const data = await fetchAPI('/projects');
            setProjects(data);
        } catch (error) {
            console.error('Failed to load projects', error);
            toast({ type: 'error', title: 'Fout', message: 'Kon projecten niet laden' });
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName.trim()) return;

        setCreating(true);
        try {
            const res = await fetchAPI('/projects', {
                method: 'POST',
                body: JSON.stringify({
                    name: newName,
                    description: newDesc,
                    status: 'active'
                })
            });

            toast({ type: 'success', title: 'Succes', message: 'Project aangemaakt!' });
            setProjects([res, ...projects]);
            setCreateOpen(false);
            setNewName('');
            setNewDesc('');
        } catch (error) {
            console.error(error);
            toast({ type: 'error', title: 'Fout', message: 'Kon project niet aanmaken' });
        } finally {
            setCreating(false);
        }
    };

    const handleDeleteClick = (e: React.MouseEvent, project: Project) => {
        e.stopPropagation();
        setProjectToDelete(project);
        setDeleteDialogOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!projectToDelete) return;

        try {
            await fetchAPI(`/projects/${projectToDelete.id}`, { method: 'DELETE' });
            toast({ type: 'success', title: 'Verwijderd', message: 'Project verwijderd' });
            setProjects(projects.filter(p => p.id !== projectToDelete.id));
        } catch (error) {
            console.error('Delete failed', error);
            toast({ type: 'error', title: 'Fout', message: 'Kon project niet verwijderen' });
        }
    };

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    if (loading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-[200px] w-full rounded-xl" />
                ))}
            </div>
        );
    }

    return (
        <div className="space-y-8 pb-10">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 text-primary font-bold text-sm tracking-wider uppercase mb-1">
                        <Folder className="w-4 h-4" />
                        <span>Projecten</span>
                    </div>
                    <h2 className="text-4xl font-extrabold tracking-tight text-slate-900">Alle Projecten</h2>
                    <p className="text-slate-500 mt-1 max-w-2xl text-lg">Beheer je BIM-projecten en bijbehorende IFC-bestanden.</p>
                </div>
                <Button onClick={() => setCreateOpen(true)} className="bg-primary hover:bg-primary/90 rounded-full px-6">
                    <Plus className="w-4 h-4 mr-2" /> Nieuw Project
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects.map((project) => (
                    <Card
                        key={project.id}
                        className="hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-1 transition-all duration-300 cursor-pointer group border-slate-200/60 rounded-2xl overflow-hidden"
                        onClick={() => navigate(`/projects/${project.id}`)}
                    >
                        <CardHeader className="pb-4 bg-gradient-to-br from-slate-50 to-white">
                            <div className="flex justify-between items-start">
                                <div className="p-3 bg-primary/10 rounded-2xl group-hover:bg-primary/20 transition-colors">
                                    <Folder className="w-7 h-7 text-primary" />
                                </div>
                                <div className="flex gap-2 items-start">
                                    <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${project.status === 'active'
                                        ? 'bg-emerald-50 text-emerald-600'
                                        : 'bg-slate-100 text-slate-600'
                                        }`}>
                                        {project.status}
                                    </span>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50"
                                        onClick={(e) => handleDeleteClick(e, project)}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                            <CardTitle className="mt-4 text-xl font-bold text-slate-900 group-hover:text-primary transition-colors">{project.name}</CardTitle>
                        </CardHeader>
                        <CardContent className="pb-4 text-sm text-slate-600">
                            <p className="line-clamp-2 leading-relaxed">{project.description || "Geen beschrijving"}</p>
                        </CardContent>
                        <CardFooter className="pt-4 border-t border-slate-100 text-xs flex justify-between items-center bg-slate-50/50">
                            <div className="flex items-center gap-4 text-slate-500 font-semibold">
                                <span className="flex items-center gap-1.5">
                                    <FileText className="w-3.5 h-3.5" /> {project.file_count || 0}
                                </span>
                                <span className="text-slate-400">·</span>
                                <span>{formatBytes(project.total_size || 0)}</span>
                            </div>
                            <span className="flex items-center gap-1 text-slate-400">
                                <Calendar className="w-3 h-3" />
                                {project.updated_at || project.created_at
                                    ? formatDistanceToNow(new Date(project.updated_at || project.created_at), { addSuffix: true, locale: nl })
                                    : 'Onbekend'
                                }
                            </span>
                        </CardFooter>
                    </Card>
                ))}

                {projects.length === 0 && (
                    <div className="col-span-full text-center py-12 bg-white dark:bg-card border rounded-xl border-dashed">
                        <Folder className="w-12 h-12 mx-auto text-muted-foreground mb-4 opacity-50" />
                        <h3 className="text-lg font-medium">Geen projecten gevonden</h3>
                        <p className="text-sm text-muted-foreground mt-1 mb-4">Maak een nieuw project aan om te beginnen.</p>
                        <Button variant="outline" onClick={() => setCreateOpen(true)}>
                            Project Aanmaken
                        </Button>
                    </div>
                )}
            </div>

            <Dialog
                isOpen={createOpen}
                onClose={() => setCreateOpen(false)}
                title="Nieuw Project"
                footer={
                    <div className="flex gap-2">
                        <Button variant="ghost" onClick={() => setCreateOpen(false)}>Annuleren</Button>
                        <Button onClick={handleCreate} disabled={creating || !newName} className="bg-blue-600 hover:bg-blue-700">
                            {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Aanmaken
                        </Button>
                    </div>
                }
            >
                <form onSubmit={handleCreate} className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Projectnaam</label>
                        <Input
                            placeholder="Bijv. Woonwijk Zuid"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            autoFocus
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Beschrijving</label>
                        <textarea
                            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            placeholder="Optionele beschrijving..."
                            value={newDesc}
                            onChange={(e) => setNewDesc(e.target.value)}
                        />
                    </div>
                </form>
            </Dialog>

            <ConfirmDialog
                isOpen={deleteDialogOpen}
                onClose={() => setDeleteDialogOpen(false)}
                onConfirm={handleConfirmDelete}
                title="Project verwijderen"
                description={`Weet je zeker dat je "${projectToDelete?.name}" wilt verwijderen? Alle bestanden worden ook verwijderd.`}
                variant="destructive"
                confirmText="Verwijderen"
            />
        </div >
    );
}
