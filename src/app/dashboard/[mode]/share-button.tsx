"use client";

import { useState } from "react";

export function ShareButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = `${window.location.origin}/join/${token}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={copy}
      title="Compartir este espacio"
      className="text-[11px] uppercase tracking-wider px-2.5 py-1.5 rounded-lg border border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:border-zinc-600 transition-colors"
    >
      {copied ? "¡Copiado!" : "Compartir"}
    </button>
  );
}
