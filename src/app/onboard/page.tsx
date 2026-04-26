import { OnboardChat } from "./chat";

export const metadata = {
  title: "CAPA · nuevo espacio",
};

export default function OnboardPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <div className="max-w-2xl mx-auto w-full px-4 sm:px-6 py-8 sm:py-12 flex-1 flex flex-col">
        <header className="mb-6">
          <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-400 mb-2">
            CAPA · nuevo espacio
          </p>
          <h1 className="text-2xl sm:text-3xl font-semibold leading-tight">
            Contame de tu situación.
          </h1>
          <p className="text-sm text-zinc-400 mt-2 leading-relaxed">
            Una tiendita, un hogar, un encargo, una iglesia, una rutina — lo que sea que necesités llevar.
            Opus 4.7 arma tu protocolo de acciones correctivas y preventivas, a medida. Hablale suelto.
          </p>
        </header>
        <OnboardChat />
        <footer className="mt-6 text-[11px] text-zinc-600">
          Esta conversación corre en Opus 4.7. Eventos rutinarios después corren en Sonnet,
          recordatorios en Haiku — Opus se reserva para construir y cambiar tu baseline.
        </footer>
      </div>
    </main>
  );
}
