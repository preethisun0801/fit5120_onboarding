import {Link} from "react-router-dom";
import {Leaf} from "lucide-react";

export default function Navbar() {
    return (
        <header className="fixed top-0 left-0 right-0 z-50 border-b border-[var(--color-border)] bg-[var(--color-background)]/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2 text-[var(--color-foreground)]">
            <Leaf className="w-6 h-6 text-[var(color-foreground)]"></Leaf>
            <span className="font-semibold text-lg">Sensory-Aware</span>
            <span>Navigation Platform</span>
            </Link>
            <nav>
                <Link to="/">Plan your Journey</Link>
                <Link to="/pages/Way">Live Map</Link>
                <Link to="/pages/Routes">Quiet Spaces</Link>
                <Link to="/pages/Settings">Settings</Link>
                <Link to="/pages/About">About</Link>
            </nav>
        </div>
        </header>
    );
}