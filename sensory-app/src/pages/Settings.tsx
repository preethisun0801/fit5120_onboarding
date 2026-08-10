// sensory-app/src/pages/Settings.tsx
import { useEffect, useState } from "react";
import { loadPreferences, savePreferences, type Preferences } from "../lib/preferences";
import Card from "../components/ui/Card";

const LEVELS: Preferences["crowdSensitivity"][] = ["low", "medium", "high"];
const LEVEL_LABEL: Record<string, string> = { low: "A little", medium: "Some", high: "A lot" };

export default function Settings() {
  const [prefs, setPrefs] = useState<Preferences>(loadPreferences());
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 1500);
    return () => clearTimeout(t);
  }, [saved]);

  function update<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    savePreferences(next);
    setSaved(true);
  }

  return (
    <div className="max-w-xl mx-auto px-6 pt-6 md:pt-24 pb-24 md:pb-6">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-semibold">Preferences</h1>
        {saved && <span className="text-xs text-[var(--color-accent)]">Saved</span>}
      </div>
      <p className="text-sm text-[var(--color-muted)] mb-6">
        These shape how routes are ranked and which quiet spaces get suggested.
      </p>

      <Card className="mb-4">
        <p className="font-medium mb-1">Avoid crowds</p>
        <p className="text-xs text-[var(--color-muted)] mb-3">
          How much crowd levels should influence route ranking.
        </p>
        <div className="flex gap-2">
          {LEVELS.map((level) => (
            <button
              key={level}
              onClick={() => update("crowdSensitivity", level)}
              className={`flex-1 py-2 rounded-lg text-sm border ${
                prefs.crowdSensitivity === level
                  ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] border-[var(--color-primary)]"
                  : "border-[var(--color-border)] text-[var(--color-muted)]"
              }`}
            >
              {LEVEL_LABEL[level]}
            </button>
          ))}
        </div>
      </Card>

      <Card className="mb-4">
        <p className="font-medium mb-1">Avoid noise</p>
        <p className="text-xs text-[var(--color-muted)] mb-3">
          How much noise levels should influence route ranking.
        </p>
        <div className="flex gap-2">
          {LEVELS.map((level) => (
            <button
              key={level}
              onClick={() => update("noiseSensitivity", level)}
              className={`flex-1 py-2 rounded-lg text-sm border ${
                prefs.noiseSensitivity === level
                  ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] border-[var(--color-primary)]"
                  : "border-[var(--color-border)] text-[var(--color-muted)]"
              }`}
            >
              {LEVEL_LABEL[level]}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <label className="flex items-center justify-between cursor-pointer">
          <div>
            <p className="font-medium">Indoor spaces only</p>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">
              Only suggest indoor quiet spaces, not parks or gardens.
            </p>
          </div>
          <input
            type="checkbox"
            checked={prefs.indoorOnly}
            onChange={(e) => update("indoorOnly", e.target.checked)}
            className="w-5 h-5 shrink-0 ml-4"
          />
        </label>
      </Card>
    </div>
  );
}