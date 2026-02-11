import { motion, AnimatePresence } from 'framer-motion';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, FileText, ChevronLeft, ChevronRight, LogOut, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { Tooltip } from '../ui/tooltip';

interface SidebarProps {
    expanded: boolean;
    isMobileOpen: boolean;
    toggleExpanded: () => void;
    closeMobile: () => void;
}

const NAV_ITEMS = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
    { icon: Users, label: 'Gebruikers', path: '/users' },
    { icon: FileText, label: 'Projecten', path: '/projects' },
];

export function Sidebar({ expanded, isMobileOpen, toggleExpanded, closeMobile }: SidebarProps) {
    const sidebarVariants = {
        expanded: {
            width: 280,
            transition: {
                type: "spring",
                stiffness: 300,
                damping: 30,
                mass: 0.8
            }
        },
        collapsed: {
            width: 80,
            transition: {
                type: "spring",
                stiffness: 300,
                damping: 30,
                mass: 0.8
            }
        },
    };

    const navItemVariants = {
        open: {
            opacity: 1,
            x: 0,
            display: 'block',
            transition: {
                opacity: { duration: 0.2, delay: 0.1 },
                x: { type: "spring", stiffness: 300, damping: 25 }
            }
        },
        closed: {
            opacity: 0,
            x: -10,
            transitionEnd: { display: 'none' },
            transition: {
                opacity: { duration: 0.15 },
                x: { type: "spring", stiffness: 300, damping: 25 }
            }
        },
    };

    return (
        <>
            {/* Mobile Overlay */}
            <AnimatePresence>
                {isMobileOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.5 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={closeMobile}
                        className="fixed inset-0 z-40 bg-black/80 lg:hidden"
                    />
                )}
            </AnimatePresence>

            {/* Sidebar Container */}
            <motion.aside
                initial={false}
                animate={
                    // On mobile, we use specific translate/width. On desktop, we use width.
                    window.innerWidth < 1024
                        ? { x: isMobileOpen ? 0 : '-100%', width: 280 }
                        : expanded ? 'expanded' : 'collapsed'
                }
                variants={sidebarVariants}
                transition={{
                    type: "spring",
                    stiffness: 300,
                    damping: 30,
                    mass: 0.8
                }}
                // Force fixed on mobile, relative sticky on desktop
                className={cn(
                    "fixed top-0 left-0 z-50 h-screen border-r bg-sidebar text-sidebar-foreground shadow-xl lg:sticky lg:shadow-none will-change-transform",
                    // Mobile classes handled by motion/fixed
                )}
                style={{ transform: 'translateZ(0)' }} // Force hardware acceleration
            >
                <div className="flex flex-col h-full">
                    {/* Header */}
                    <div className="flex items-center justify-between h-16 px-4 md:px-6 border-b border-sidebar-border">
                        <div className="flex items-center gap-2 overflow-hidden whitespace-nowrap">
                            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-foreground shrink-0">
                                <span className="font-bold">VH</span>
                            </div>
                            <motion.span
                                variants={navItemVariants}
                                initial={false}
                                animate={expanded ? 'open' : 'closed'}
                                className="font-bold text-lg tracking-tight"
                            >
                                VH Admin
                            </motion.span>
                        </div>

                        {/* Desktop Toggle */}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="hidden lg:flex shrink-0 ml-auto"
                            onClick={toggleExpanded}
                        >
                            {expanded ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </Button>

                        {/* Mobile Close */}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="lg:hidden shrink-0 ml-auto"
                            onClick={closeMobile}
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </Button>
                    </div>

                    {/* Navigation */}
                    <div className="flex-1 py-4 overflow-y-auto overflow-x-hidden">
                        <nav className="space-y-1 px-2">
                            {NAV_ITEMS.map((item) => (
                                <NavLink
                                    key={item.path}
                                    to={item.path}
                                    onClick={() => window.innerWidth < 1024 && closeMobile()}
                                    className={({ isActive }) =>
                                        cn(
                                            "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors relative group",
                                            !expanded && "justify-center",
                                            isActive
                                                ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                                                : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                                        )
                                    }
                                >
                                    {({ isActive }) => (

                                        expanded ? (
                                            <>
                                                <item.icon className={cn("w-5 h-5 shrink-0", isActive ? "text-primary" : "")} />
                                                <motion.span
                                                    variants={navItemVariants}
                                                    initial={false}
                                                    animate={expanded ? 'open' : 'closed'}
                                                    className="whitespace-nowrap"
                                                >
                                                    {item.label}
                                                </motion.span>
                                                {isActive && (
                                                    <motion.div
                                                        layoutId="activeNav"
                                                        className="absolute left-0 w-1 h-6 bg-primary rounded-r-full"
                                                        initial={{ opacity: 0 }}
                                                        animate={{ opacity: 1 }}
                                                        exit={{ opacity: 0 }}
                                                    />
                                                )}
                                            </>
                                        ) : (
                                            <Tooltip content={item.label} side="right">
                                                <div className="flex items-center justify-center w-full">
                                                    <item.icon className={cn("w-5 h-5 shrink-0", isActive ? "text-primary" : "")} />
                                                </div>
                                            </Tooltip>
                                        )
                                    )}
                                </NavLink>
                            ))}
                        </nav>
                    </div>

                    {/* Footer */}
                    <div className="p-4 border-t border-sidebar-border">
                        <div className={cn("flex items-center gap-3", expanded ? "" : "justify-center")}>
                            <div className="w-8 h-8 rounded-full bg-secondary overflow-hidden shrink-0">
                                <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Admin" alt="User" />
                            </div>
                            {expanded && (
                                <div className="flex-1 overflow-hidden">
                                    <p className="text-sm font-medium truncate">Robin (Admin)</p>
                                    <p className="text-xs text-muted-foreground truncate">robin@vh-engineering.nl</p>
                                </div>
                            )}
                            {expanded && (
                                <Button variant="ghost" size="icon" className="shrink-0">
                                    <LogOut className="w-4 h-4 text-muted-foreground" />
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </motion.aside>
        </>
    );
}
