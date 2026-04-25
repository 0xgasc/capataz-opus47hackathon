// Vertical templates: each vertical encodes its persona, prompt, anomaly taxonomy,
// and seed-data shape. The runner picks one based on business.vertical (or
// projects.mode for legacy/seeded paths).

export type Vertical = "construction" | "inventory" | "tiendita";

export type VerticalTemplate = {
  vertical: Vertical;
  label: string;
  scoreLabel: string;
  systemPrompt: string;
  defaultCategories: string[];
  anomalyKinds: string[];
};

import { CONSTRUCTION_TEMPLATE } from "./construction";
import { INVENTORY_TEMPLATE } from "./inventory";
import { TIENDITA_TEMPLATE } from "./tiendita";

const TEMPLATES: Record<Vertical, VerticalTemplate> = {
  construction: CONSTRUCTION_TEMPLATE,
  inventory: INVENTORY_TEMPLATE,
  tiendita: TIENDITA_TEMPLATE,
};

export function getVertical(name: string | null | undefined): VerticalTemplate {
  if (name && (name === "construction" || name === "inventory" || name === "tiendita")) {
    return TEMPLATES[name];
  }
  return TEMPLATES.construction;
}

export function listVerticals(): VerticalTemplate[] {
  return Object.values(TEMPLATES);
}
