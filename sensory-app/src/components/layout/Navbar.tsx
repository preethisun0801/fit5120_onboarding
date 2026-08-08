import { Link, useLocation } from "react-router-dom";
import { Leaf, Settings } from "lucide-react";

const DESKTOP_LINKS = [
  { to: "/", label: "Plan Journey" },
  { to: "/Way", label: "Live Map" },
  { to: "/Options", label: "Quiet Spaces" },
  { to: "/Settings", label: "Settings" },
  { to: "/About", label: "About" },
];

export default function Navbar() {
  const { pathname } = useLocation();

  return (
    <header className="hidden md:flex fixed top-0 left-0 right-0 z-50 h-16 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-background)]/90 backdrop-blur-md px-6">
      <Link to="/" className="flex items-center gap-2 text-[var(--color-foreground)]">
        <Leaf className="w-5 h-5" />
        <span className="font-semibold leading-none">Sensory-Aware</span>
        <span className="text-xs text-[var(--color-muted)] leading-none">Navigation Platform</span>
      </Link>

      <nav className="flex items-center gap-1">
        {DESKTOP_LINKS.map((l) => {
          const active = pathname === l.to;
          return (
            <Link
              key={l.to}
              to={l.to}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                active
                  ? "bg-[var(--color-accent-bg)] text-[var(--color-accent)]"
                  : "text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>

      <Settings className="w-5 h-5 text-[var(--color-muted)]" />
    </header>
  );
}