import React, { useState, useEffect } from 'react';
import { fetchAPI } from '../lib/api';
import { Button } from '../components/ui/button';
import { Plus, Folder, FileText, MoreVertical } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Skeleton } from '../components/ui/skeleton';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '../components/ui/card';
import { formatDistanceToNow } from 'date-fns';
import { nl } from 'date-fns/locale';

interface Project {
    id: string;
    name: string;
    description: string;
    status: string;
    updated_at: string;
    file_count: number;
    total_size: number;
}

export function ProjectsPage() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        loadProjects();
    }, []);

    const loadProjects = async () => {
        try {
            const data = await fetchAPI('/projects');
            setProjects(data);
        } catch (error) {
            console.error('Failed to load projects', error);
        } finally {
            setLoading(false);
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
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Projecten</h2>
                    <p className="text-muted-foreground">Beheer je projecten en bijbehorende bestanden.</p>
                </div>
                <Button onClick={() => alert("Create Project functionality coming soon")}>
                    <Plus className="w-4 h-4 mr-2" /> Nieuw Project
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects.map((project) => (
                    <Card
                        key={project.id}
                        className="hover:shadow-md transition-shadow cursor-pointer group"
                        onClick={() => navigate(`/projects/${project.id}`)}
                    >
                        <CardHeader className="pb-3">
                            <div className="flex justify-between items-start">
                                <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                                    <Folder className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                                </div>
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${project.status === 'active'
                                        ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                                        : 'bg-gray-100 text-gray-700'
                                    }`}>
                                    {project.status}
                                </span>
                            </div>
                            <CardTitle className="mt-4 text-xl">{project.name}</CardTitle>
                        </CardHeader>
                        <CardContent className="pb-3 text-sm text-muted-foreground">
                            <p className="line-clamp-2">{project.description || "Geen beschrijving"}</p>
                        </CardContent>
                        <CardFooter className="pt-3 border-t text-xs text-muted-foreground flex justify-between items-center">
                            <div className="flex items-center gap-4">
                                <span className="flex items-center gap-1">
                                    <FileText className="w-3 h-3" /> {project.file_count} bestanden
                                </span>
                                <span>{formatBytes(project.total_size)}</span>
                            </div>
                            <span>
                                {formatDistanceToNow(new Date(project.updated_at), { addSuffix: true, locale: nl })}
                            </span>
                        </CardFooter>
                    </Card>
                ))}

                {projects.length === 0 && (
                    <div className="col-span-full text-center py-12 bg-white dark:bg-card border rounded-xl border-dashed">
                        <Folder className="w-12 h-12 mx-auto text-muted-foreground mb-4 opacity-50" />
                        <h3 className="text-lg font-medium">Geen projecten gevonden</h3>
                        <p className="text-sm text-muted-foreground mt-1 mb-4">Maak een nieuw project aan om te beginnen.</p>
                        <Button variant="outline" onClick={() => alert("Create Project functionality coming soon")}>
                            Project Aanmaken
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
