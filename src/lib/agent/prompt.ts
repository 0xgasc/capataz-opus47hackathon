// Capataz prompt selector — delegates to per-vertical templates.
// Verticals live in ./verticals/ as one file each. Adding a new vertical = one
// new file + one entry in verticals/index.ts.

import { getVertical, type Vertical } from "./verticals";

export type Mode = Vertical;

export function promptForMode(mode: Mode | string | null | undefined): string {
  return getVertical(mode).systemPrompt;
}

// Legacy export — older imports may still reference this name.
export const CAPATAZ_SYSTEM_PROMPT = getVertical("construction").systemPrompt;
