import { useEffect, useRef, useState } from "react";

export type LatLon = { lat: number; lon: number; label: string };

export default function AddressAutocomplete({
  initialValue = "",
  onSelect,
  placeholder,
}: {
  initialValue?: string;
  onSelect: (loc: LatLon | null, rawText: string) => void;
  placeholder: string;
}) {
  const [query, setQuery] = useState(initialValue);
  const [results, setResults] = useState<LatLon[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    setQuery(initialValue);
  }, [initialValue]);

  useEffect(() => {
  if (debounceRef.current) window.clearTimeout(debounceRef.current);
  if (query.trim().length < 3) {
    setResults([]);
    return;
  }
  debounceRef.current = window.setTimeout(async () => {
    try {
      const base = import.meta.env.VITE_API_BASE_URL;
      if (!base) {
        console.error("VITE_API_BASE_URL is not set — check sensory-app/.env");
        return;
      }
      const res = await fetch(`${base}/geocode?text=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error(`Geocode request failed: ${res.status}`);
      const data = await res.json();
      setResults(data.results || []);
    } catch (err) {
      console.error("Geocode fetch failed:", err);
      setResults([]);
    }
  }, 300);
  return () => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
  };
}, [query]);

  return (
    <div className="relative flex-1">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onSelect(null, e.target.value); // clears any previously picked coords
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)} // let click land first
        placeholder={placeholder}
        className="bg-transparent outline-none w-full text-sm placeholder:text-[var(--color-muted)]"
      />
      {open && results.length > 0 && (
        <ul className="absolute z-20 top-full left-0 right-0 mt-1 bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {results.map((r, i) => (
            <li
              key={i}
              className="px-3 py-2 text-sm cursor-pointer hover:bg-[var(--color-muted-bg)]"
              onMouseDown={() => {
                setQuery(r.label);
                onSelect(r, r.label);
                setOpen(false);
              }}
            >
              {r.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}