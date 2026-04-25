"use client";

import { useEffect, useRef } from "react";

export type ChatMessage = {
  event_id: string;
  type: string;
  text: string;
  who: string;
  created_at: string;
  agent_summary: string | null;
  agent_tools: string[];
  transcription: string | null;
  anomalies: Array<{ kind: string; severity: string; message: string | null }>;
};

function formatTime(s: string): string {
  try {
    return new Date(s).toLocaleString("es-GT", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
    });
  } catch {
    return s;
  }
}

function channelLabel(type: string): string | null {
  // Subtle channel indicator. Most are obvious in context; only show for
  // non-text inputs where the modality matters.
  return (
    {
      voice_note: "nota de voz",
      photo: "foto",
      task_completed: "tarea hecha",
      scheduled_checkin: "recordatorio de Capataz",
      text_message: "Telegram",
    } as Record<string, string>
  )[type] ?? null;
}

export function ChatThread({ messages }: { messages: ChatMessage[] }) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-6 py-16 text-center">
        <div className="max-w-sm">
          <p className="text-zinc-300 text-base">Aún no hay conversación.</p>
          <p className="text-sm text-zinc-500 mt-2 leading-relaxed">
            Escribíle abajo a Capataz: contale lo que pasó, o tocá una tarea pendiente
            para marcarla hecha o pedirle ayuda con ella.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 px-3 sm:px-5 py-4 space-y-4 overflow-y-auto">
      {messages
        .slice()
        .reverse()
        .map((m) => (
          <ConversationTurn key={m.event_id} m={m} />
        ))}
      <div ref={endRef} />
    </div>
  );
}

function ConversationTurn({ m }: { m: ChatMessage }) {
  return (
    <div className="space-y-2">
      <UserBubble m={m} />
      {m.transcription && m.type === "voice_note" && (
        <UserBubble
          m={{ ...m, text: `🎙️ ${m.transcription}`, who: m.who }}
          subtitle="transcripción"
        />
      )}
      {m.agent_summary && <AgentBubble text={m.agent_summary} tools={m.agent_tools} />}
      {m.anomalies.map((a, i) => (
        <AnomalyBubble key={i} kind={a.kind} severity={a.severity} message={a.message} />
      ))}
    </div>
  );
}

function UserBubble({ m, subtitle }: { m: ChatMessage; subtitle?: string }) {
  const channel = channelLabel(m.type);
  const meta = subtitle ?? channel;
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] sm:max-w-[75%]">
        <div className="bg-emerald-900/40 text-emerald-50 border border-emerald-800/60 rounded-2xl rounded-br-md px-4 py-2.5 text-[15px] leading-relaxed break-words whitespace-pre-wrap">
          {m.text || `(${channel ?? m.type})`}
        </div>
        <p className="text-[11px] text-zinc-500 mt-1 mr-1 text-right">
          {m.who}
          {meta ? ` · ${meta}` : ""}
          {" · "}
          {formatTime(m.created_at)}
        </p>
      </div>
    </div>
  );
}

function AgentBubble({ text, tools }: { text: string; tools: string[] }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] sm:max-w-[75%]">
        <div className="flex items-center gap-2 mb-1 text-[11px] text-zinc-500">
          <span className="inline-block h-5 w-5 rounded-full bg-emerald-700 text-white text-[10px] flex items-center justify-center font-semibold">
            C
          </span>
          <span>Capataz</span>
        </div>
        <div className="bg-zinc-800/80 text-zinc-100 border border-zinc-700 rounded-2xl rounded-bl-md px-4 py-2.5 text-[15px] leading-relaxed break-words whitespace-pre-wrap">
          {text}
        </div>
        {tools.length > 0 && (
          <p className="text-[10px] text-zinc-600 mt-1 ml-1">
            usó: {tools.join(" · ")}
          </p>
        )}
      </div>
    </div>
  );
}

function AnomalyBubble({
  kind,
  severity,
  message,
}: {
  kind: string;
  severity: string;
  message: string | null;
}) {
  const tone = {
    critical: "bg-rose-950/40 text-rose-100 border-rose-800/70",
    high: "bg-orange-950/40 text-orange-100 border-orange-800/70",
    medium: "bg-amber-950/40 text-amber-100 border-amber-800/70",
    low: "bg-zinc-800/80 text-zinc-100 border-zinc-700",
  }[severity] ?? "bg-amber-950/40 text-amber-100 border-amber-800/70";
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] sm:max-w-[75%]">
        <div className={`border rounded-2xl rounded-bl-md px-4 py-2.5 text-[15px] leading-relaxed ${tone}`}>
          <p className="text-[11px] uppercase tracking-wider opacity-70 mb-1">
            ⚠ alerta · {severity} · {kind}
          </p>
          <p className="break-words">{message ?? "—"}</p>
        </div>
      </div>
    </div>
  );
}
