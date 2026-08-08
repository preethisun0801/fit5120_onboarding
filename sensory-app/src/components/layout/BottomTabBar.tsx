import { Link, useLocation } from "react-router-dom";
import { MapPin, Map, TreePine, SlidersHorizontal } from "lucide-react";

const TABS = [
  { to: "/", label: "Plan", icon: MapPin },
  { to: "/Way", label: "Map", icon: Map },
  { to: "/Options", label: "Quiet", icon: TreePine },
  { to: "/Settings", label: "Preferences", icon: SlidersHorizontal },
];

export default function BottomTabBar() {
  const { pathname } = useLocation();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex border-t border-[var(--color-border)] bg-[var(--color-card)]">
      {TABS.map(({ to, label, icon: Icon }) => {
        const active = pathname === to;
        return (
          <Link
            key={to}
            to={to}
            className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-xs font-medium ${
              active ? "text-[var(--color-accent)]" : "text-[var(--color-muted)]"
            }`}
          >
            <Icon className="w-5 h-5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}