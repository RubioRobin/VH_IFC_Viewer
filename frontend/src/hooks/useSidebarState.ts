import { useState, useEffect } from 'react';

const SIDEBAR_STATE_KEY = 'admin-sidebar-expanded';

export function useSidebarState() {
    const [expanded, setExpanded] = useState<boolean>(true);
    const [isMobileOpen, setIsMobileOpen] = useState(false);

    useEffect(() => {
        const stored = localStorage.getItem(SIDEBAR_STATE_KEY);
        if (stored !== null) {
            setExpanded(JSON.parse(stored));
        } else {
            // Default to collapsed on smaller screens if we had window access, 
            // but for now default expanded on desktop
            if (window.innerWidth < 1024) {
                setExpanded(false);
            }
        }
    }, []);

    const toggleExpanded = () => {
        const newState = !expanded;
        setExpanded(newState);
        localStorage.setItem(SIDEBAR_STATE_KEY, JSON.stringify(newState));
    };

    const toggleMobile = () => setIsMobileOpen(!isMobileOpen);
    const closeMobile = () => setIsMobileOpen(false);

    return { expanded, toggleExpanded, isMobileOpen, toggleMobile, closeMobile };
}
