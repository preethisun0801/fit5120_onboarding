// sensory-app/src/components/layout/Navbar.tsx
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Leaf, Settings as SettingsIcon } from "lucide-react";

const DESKTOP_LINKS = [
  { to: "/", label: "Plan Journey" },
  { to: "/Way", label: "Live Map" },
  { to: "/Options", label: "Quiet Spaces" },
];

const MENU_LINKS = [
  { to: "/Settings", label: "Settings" },
  { to: "/About", label: "About" },
];

export default function Navbar() {
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, []);

  // Close automatically on navigation, so clicking Settings then coming back
  // via browser-back doesn't leave the menu stuck open.
  useEffect(() => setMenuOpen(false), [pathname]);

  const onMenuPage = MENU_LINKS.some((l) => l.to === pathname);

  return (
    <header className="hidden md:flex fixed top-0 left-0 right-0 z-50 h-16 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-background)]/90 backdrop-blur-md px-6">
      <Link to="/" className="flex items-center gap-2 text-[var(--color-foreground)]">
        <Leaf className="w-5 h-5" />
        <span className="font-semibold leading-none">Sensory-Aware</span>
        <span className="text-xs text-[var(--color-muted)] leading-none">Navigation Platform</span>
      </Link>

      <div className="ml-auto flex items-center gap-1">
        <nav className="flex items-center gap-0.5">
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

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Settings and about"
            className={`p-1.5 rounded-full transition-colors ${
              onMenuPage || menuOpen
                ? "bg-[var(--color-accent-bg)] text-[var(--color-accent)]"
                : "text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
            }`}
          >
            <SettingsIcon className="w-5 h-5" />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full mt-2 w-44 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] shadow-lg py-1"
            >
              {MENU_LINKS.map((l) => {
                const active = pathname === l.to;
                return (
                  <Link
                    key={l.to}
                    to={l.to}
                    role="menuitem"
                    className={`block px-3 py-2 text-sm ${
                      active
                        ? "text-[var(--color-accent)]"
                        : "text-[var(--color-foreground)] hover:bg-[var(--color-muted-bg)]"
                    }`}
                  >
                    {l.label}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}