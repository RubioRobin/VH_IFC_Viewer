import { Menu, Search, Bell, Settings } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

interface TopbarProps {
    toggleMobile: () => void;
}

export function Topbar({ toggleMobile }: TopbarProps) {
    return (
        <header className="sticky top-0 z-30 flex h-16 w-full items-center gap-4 border-b bg-background/80 px-4 md:px-6 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            {/* Mobile Toggle */}
            <Button
                variant="ghost"
                size="icon"
                className="lg:hidden shrink-0"
                onClick={toggleMobile}
            >
                <Menu className="w-5 h-5" />
                <span className="sr-only">Menu</span>
            </Button>

            {/* Page Title (could be dynamic based on route) */}
            <div className="flex-1 md:flex-none">
                <h1 className="text-lg font-semibold tracking-tight">Dashboard</h1>
            </div>

            {/* Search & Actions */}
            <div className="flex flex-1 items-center justify-end gap-2 md:gap-4">
                <div className="hidden md:flex relative w-full max-w-[300px]">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="search"
                        placeholder="Zoeken..."
                        className="w-full bg-background pl-8"
                    />
                </div>

                <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-foreground">
                    <Bell className="w-5 h-5" />
                </Button>
                <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-foreground">
                    <Settings className="w-5 h-5" />
                </Button>

                {/* Mobile Profile Avater (simplified) */}
                <div className="w-8 h-8 rounded-full bg-secondary overflow-hidden shrink-0 md:hidden">
                    <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Admin" alt="User" />
                </div>
            </div>
        </header>
    );
}
