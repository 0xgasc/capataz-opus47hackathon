"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const stored = localStorage.getItem("capataz-theme") as Theme | null;
    const initial: Theme = stored ?? "light";
    document.documentElement.setAttribute("data-theme", initial);
    setTheme(initial);
  }, []);

  function toggle() {
    const next: Theme = theme === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("capataz-theme", next);
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "light" ? "cambiar a tema oscuro" : "cambiar a tema claro"}
      title={theme === "light" ? "modo oscuro" : "modo claro"}
      className={`text-xs px-2 py-1 rounded-md border border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-zinc-100 hover:border-zinc-700 transition-colors ${className}`}
    >
      {theme === "light" ? "🌙" : "☀️"}
    </button>
  );
}
