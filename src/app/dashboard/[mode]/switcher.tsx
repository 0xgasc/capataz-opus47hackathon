import Link from "next/link";

type Mode = "construction" | "inventory" | "tiendita" | "general" | "delegacion";

const ITEMS: Array<{ mode: Mode; label: string; sub: string }> = [
  { mode: "construction", label: "Construcción", sub: "Ops" },
  { mode: "inventory",    label: "Inventario",   sub: "Valuation" },
  { mode: "tiendita",     label: "Tiendita",     sub: "SMB" },
];

// 'general' isn't shown in the switcher (each general business is unique to its
// owner — no "first general project" pivot makes sense). Users reach general
// dashboards via their slug or from the landing list.

export function ModeSwitcher({ current }: { current: Mode }) {
  return (
    <nav className="inline-flex rounded-full border border-zinc-800 bg-zinc-900/60 p-1">
      {ITEMS.map((item) => {
        const active = item.mode === current;
        return (
          <Link
            key={item.mode}
            href={`/dashboard/${item.mode}`}
            className={`px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-full text-[10px] sm:text-xs leading-tight ${
              active
                ? "bg-emerald-900/40 text-emerald-200 border border-emerald-800"
                : "text-zinc-400 hover:text-zinc-200 active:text-zinc-200"
            }`}
          >
            <span className="block font-medium">{item.label}</span>
            <span className="hidden sm:block text-[9px] uppercase tracking-wider opacity-70">
              {item.sub}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
