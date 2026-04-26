import { sql } from "@/lib/db";
import { formatGTQ, formatDateTime } from "@/lib/format";

type CreditRow = {
  customer_name: string;
  balance_gtq: string;
  last_event_at: Date | string | null;
};

export async function CobrosWidget({ businessId }: { businessId: string }) {
  const rows = await sql<CreditRow[]>`
    select customer_name, balance_gtq, last_event_at
    from credit_accounts
    where business_id = ${businessId} and balance_gtq > 0
    order by balance_gtq desc
    limit 10
  `;

  const total = rows.reduce((acc, r) => acc + Number(r.balance_gtq), 0);

  return (
    <section className="px-4 sm:px-5 pt-4">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="flex items-baseline justify-between gap-2 mb-3 flex-wrap">
          <h3 className="text-sm font-semibold text-zinc-100">Fiados pendientes</h3>
          <p className="text-xs text-zinc-500 tabular-nums">
            {rows.length === 0
              ? "ninguno"
              : `${rows.length} ${rows.length === 1 ? "cliente" : "clientes"} · ${formatGTQ(total)}`}
          </p>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-zinc-500 leading-relaxed">
            Nadie te debe nada todavía. Cuando alguien se lleve algo a crédito,
            decílo en el chat ("vendí 2 cervezas a Don Chepe que paga viernes")
            y CAPA lo anota acá.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-800/60">
            {rows.map((r) => (
              <li
                key={r.customer_name}
                className="flex items-center justify-between gap-3 py-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-zinc-100 truncate">{r.customer_name}</p>
                  {r.last_event_at && (
                    <p className="text-[11px] text-zinc-500">
                      último movimiento: {formatDateTime(r.last_event_at)}
                    </p>
                  )}
                </div>
                <span className="text-amber-300 tabular-nums shrink-0">
                  {formatGTQ(Number(r.balance_gtq))}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-zinc-600 mt-3 leading-snug">
          Para registrar un pago, decíselo a CAPA: "Don Chepe me pagó Q24" → se descuenta del saldo.
        </p>
      </div>
    </section>
  );
}
