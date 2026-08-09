import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { loadPreferences, savePreferences, type Preferences } from "../lib/preferences";

type Ctx = {
  preferences: Preferences;
  update: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
};

const PreferencesContext = createContext<Ctx | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(loadPreferences());

  // Cross-tab sync — fires when another tab writes to localStorage.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === "sensory-app:preferences") setPreferences(loadPreferences());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function update<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setPreferences((prev) => {
      const next = { ...prev, [key]: value };
      savePreferences(next);
      return next;
    });
  }

  return (
    <PreferencesContext.Provider value={{ preferences, update }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error("usePreferences must be used within PreferencesProvider");
  return ctx;
}