// Derive 3 contextual chip-suggestions for the chat input. Mix of:
//   - one task action (mark done a specific overdue task)
//   - one item-flavored typical message (uses an actual product the business has)
//   - one ask-Capataz query (vertical-appropriate)
//
// Server-side, deterministic, no model call. Cheap and snappy.

type Vertical = "construction" | "inventory" | "tiendita";

export type SuggestionContext = {
  vertical: Vertical;
  pendingTasks: Array<{ title: string }>;
  recentItems: Array<{ description: string; unit: string }>;
};

const VERTICAL_QUERIES: Record<Vertical, string[]> = {
  construction: [
    "¿qué tengo pendiente esta semana?",
    "¿qué proveedores tengo que pagar?",
    "¿cómo va la obra hoy?",
  ],
  inventory: [
    "¿qué movimientos hubo hoy?",
    "¿qué pendientes me faltan esta semana?",
    "¿qué SKUs no se han movido?",
  ],
  tiendita: [
    "¿qué tengo pendiente hoy?",
    "¿qué se vendió hoy?",
    "¿qué tareas me toca cerrar?",
  ],
};

const VERTICAL_VERBS: Record<Vertical, { ingest: string; outflow?: string }> = {
  construction: { ingest: "llegaron" },
  inventory:    { ingest: "entró", outflow: "salió" },
  tiendita:     { ingest: "compré", outflow: "vendí" },
};

function pickFirst<T>(arr: T[]): T | undefined {
  return arr[0];
}

export function buildSuggestions(ctx: SuggestionContext): string[] {
  const out: string[] = [];

  // 1. Task action (most relevant pending task)
  const task = pickFirst(ctx.pendingTasks);
  if (task) {
    out.push(`marcá hecha: ${task.title.toLowerCase().slice(0, 60)}`);
  } else {
    out.push("agregá una tarea nueva");
  }

  // 2. Item-flavored typical action
  const verbs = VERTICAL_VERBS[ctx.vertical];
  const item = pickFirst(ctx.recentItems);
  if (item && verbs) {
    const desc = item.description.toLowerCase();
    if (verbs.outflow) {
      out.push(`${verbs.outflow} 2 ${desc}`);
    } else {
      out.push(`${verbs.ingest} 50 ${desc}`);
    }
  } else {
    out.push(`${verbs.ingest} algo nuevo`);
  }

  // 3. Ask query (rotated by hour so demos feel less static)
  const queries = VERTICAL_QUERIES[ctx.vertical];
  const idx = new Date().getHours() % queries.length;
  out.push(queries[idx]);

  return out;
}
