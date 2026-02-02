import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useSidebarState } from '../../hooks/useSidebarState';

export function AdminLayout() {
    const { expanded, toggleExpanded, isMobileOpen, toggleMobile, closeMobile } = useSidebarState();

    return (
        <div className="min-h-screen flex bg-background">
            <Sidebar
                expanded={expanded}
                toggleExpanded={toggleExpanded}
                isMobileOpen={isMobileOpen}
                closeMobile={closeMobile}
            />

            <div className="flex-1 flex flex-col min-w-0">
                <Topbar toggleMobile={toggleMobile} />

                <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto">
                    <div className="mx-auto max-w-7xl animate-fade-in-up">
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
}
