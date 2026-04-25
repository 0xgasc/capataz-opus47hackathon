// Module catalog + helpers. A "module" is a capability bundle a business can
// install. Default = chat + protocolo. Optional = valuacion (score, market drift,
// admin prices) and lender_view (audit trail + collateral readiness pitch).
//
// New modules go here AND in the catalog below; the agent can read the catalog
// to know what to suggest.

import { sql } from "@/lib/db";

export type ModuleKey = "chat" | "protocolo" | "valuacion" | "lender_view";

export type ModuleStatus = "enabled" | "suggested" | "disabled";

export type ModuleEntry = {
  key: ModuleKey;
  name: string;
  one_liner: string;
  pitch: string; // what the agent says when suggesting it
  baseline: boolean; // true = always-on, can't be disabled
};

export const MODULE_CATALOG: ModuleEntry[] = [
  {
    key: "chat",
    name: "Conversación",
    one_liner: "Hablale a Capataz, mandá voz, foto, texto.",
    pitch: "",
    baseline: true,
  },
  {
    key: "protocolo",
    name: "Protocolo del negocio",
    one_liner: "Tareas recurrentes, marcá hechas, agregá nuevas.",
    pitch: "",
    baseline: true,
  },
  {
    key: "valuacion",
    name: "Valuación",
    one_liner: "Score 0-100 con presupuesto, costos, mercado y portafolio.",
    pitch:
      "Si querés que también te ayude con costos y valor de tu inventario o presupuesto, te puedo activar el módulo de Valuación. Eso me deja calcular qué tan bien va el negocio en plata, no solo en tareas.",
    baseline: false,
  },
  {
    key: "lender_view",
    name: "Vista para prestamistas",
    one_liner: "Reporte exportable de evidencia auditable.",
    pitch:
      "Si en algún momento un banco o un proveedor te pregunta 'cómo sé que tu inventario vale lo que decís', te puedo activar la Vista para prestamistas — un reporte con la traza completa de mis decisiones que pueden auditar.",
    baseline: false,
  },
];

export function moduleByKey(key: string): ModuleEntry | null {
  return MODULE_CATALOG.find((m) => m.key === key) ?? null;
}

export type BusinessModuleRow = {
  module_key: string;
  status: ModuleStatus;
};

export async function modulesForBusiness(businessId: string): Promise<Map<string, ModuleStatus>> {
  const rows = await sql<BusinessModuleRow[]>`
    select module_key, status from business_modules where business_id = ${businessId}
  `;
  const m = new Map<string, ModuleStatus>();
  for (const r of rows) m.set(r.module_key, r.status);
  return m;
}

export async function setModuleStatus(
  businessId: string,
  key: string,
  status: ModuleStatus,
  enabledBy: string,
): Promise<void> {
  if (status === "enabled") {
    await sql`
      insert into business_modules (business_id, module_key, status, enabled_at, enabled_by)
      values (${businessId}, ${key}, 'enabled', now(), ${enabledBy})
      on conflict (business_id, module_key)
      do update set status = 'enabled', enabled_at = now(), enabled_by = ${enabledBy}
    `;
  } else {
    await sql`
      insert into business_modules (business_id, module_key, status, enabled_at, enabled_by)
      values (${businessId}, ${key}, ${status}, null, ${enabledBy})
      on conflict (business_id, module_key)
      do update set status = ${status}
    `;
  }
}

export function isEnabled(map: Map<string, ModuleStatus>, key: string): boolean {
  return map.get(key) === "enabled";
}

export function isSuggested(map: Map<string, ModuleStatus>, key: string): boolean {
  return map.get(key) === "suggested";
}
