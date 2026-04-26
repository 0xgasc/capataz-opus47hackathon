# Capataz — video script options

Three 3-minute scripts. Each is fully written: timestamps, what's on screen,
exact words to say (Spanish + English), and Remotion-friendly animation moments.

Pick one. I'll cut the others into outtakes if you want.

Live URL: **https://capataz-web-production.up.railway.app**

---

## Script A — "El día de Doña Rosa" (most emotional, recommended)

**Premise:** Capataz isn't a business tool. It's an operations brain for whatever
matters to you. We open with Sofía, who cares for her 78-year-old mom. We end with
the same agent powering a tiendita and a construction site — to prove the platform
thesis without the demo getting cold.

**Total: 3:00.**

### Beat 1 — The hook (0:00 – 0:20)

**Screen:** Black. White text appears one word at a time (Remotion):
*"Cien millones de personas..."*
*"...llevan operaciones complejas..."*
*"...sin software."*

**Voiceover (Spanish, calm):**
> "Cien millones de personas en Latinoamérica llevan operaciones complejas sin software. Cuidan a sus papás. Atienden tienditas. Coordinan iglesias. Construyen casas. Y todo lo hacen en WhatsApp y de memoria."

**Remotion:** 4 still photos fade in/out behind the text — abuela tomando pastilla,
tiendita guatemalteca, iglesia comunitaria, obra de construcción.

### Beat 2 — Meet Capataz (0:20 – 0:35)

**Screen:** Cut to landing page in light mode, slow Ken-Burns zoom in.

**Voiceover:**
> "Capataz es un agente de Claude Opus 4.7 que vive donde ya están — Telegram, WhatsApp, mensajes de voz — y convierte el caos en estado real."

### Beat 3 — Onboarding live (0:35 – 1:10)

**Screen:** Click "+ agregar un nuevo negocio". Land on `/onboard`.
Type live (or pre-recorded for tighter timing):

> *"Cuido a mi mamá Doña Rosa de 78 años en mi casa de Mixco. Le toca pastilla
> de la presión a las 8am, una de tiroides a las 11am, y cena con sopa baja en
> sodio a las 6pm. Compro pañales (le quedan 12). El doctor la llama los
> miércoles. Soy Sofía."*

**Remotion:** The "opus pensando…" badge pulses. After ~10s the redirect happens.

**Voiceover during the wait:**
> "Sofía describe su situación en una sola frase. Opus 4.7 escucha, decide qué
> tipo de operación es, y le arma su panel."

### Beat 4 — The bespoke protocol (1:10 – 1:45)

**Screen:** Lands on `/dashboard/casa-de-dona-rosa`. Camera scrolls down to
"Protocolo del negocio". Highlight 3 tasks one by one:
- *"Dar pastilla de la presión — 8am"*
- *"Llamada del doctor (miércoles) — Tener a la mano la lista de cómo se sintió esta semana (presión, ánimo, apetito, sueño)"*
- *"Bitácora diaria de Doña Rosa"*

**Voiceover:**
> "Esto no es una plantilla. Opus escribió este protocolo específicamente para
> Doña Rosa — incluyendo la nota sobre qué llevar a la llamada del doctor del
> miércoles. Para una pizzería habría escrito tareas de horno y masa. Para
> una iglesia, tareas de predicador y ofrenda. Mismo agente, distinto contexto."

**Remotion:** A small "→" arrow flies from the chat input on /onboard to each
task on the dashboard, suggesting "your sentence became this."

### Beat 5 — Conversation does the work (1:45 – 2:15)

**Screen:** Dashboard chat input. Type:
> *"Ya le di las pastillas de la mañana. Tomó la presión bien, durmió toda la noche."*

**Remotion:** Watch the bubble appear → "Capataz pensando…" → response bubble.
The matching task in the protocolo flips to ✓ done in real time. Score Δ ticks up.

**Voiceover:**
> "Cuando Sofía cuenta lo que pasó, Capataz cierra la tarea, anota en la
> bitácora, y actualiza el score. Sin formularios. Sin Notion. Solo conversación."

### Beat 6 — Mode flip: same agent, different lens (2:15 – 2:45)

**Screen:** Click "← Capataz" header link → landing → click "Tiendita Doña Marta"
or "Villa Nueva Fase 2". Camera lingers on the different vocabulary
("Cobros", "Fiados pendientes", "Materiales"). Then cycle through `/agents`:

**Voiceover:**
> "Mismo Capataz. Misma plataforma. Mismo modelo Opus 4.7. Pero la tiendita ve
> 'fiados', la obra ve 'cuadrilla', el hogar de Doña Rosa ve 'pastillas y bitácora'.
> Capataz aprende qué cosas importan para vos."

**Remotion:** Quick cut/animation showing 4 dashboards stacked, each with a
floating label: *"Hogar"* / *"Tiendita"* / *"Bodega"* / *"Obra"*.

### Beat 7 — The economic story (2:45 – 3:00)

**Screen:** Cut to `/agents`, focus on "Tokens y costo".

**Voiceover (close):**
> "Opus 4.7 razona. Sonnet 4.6 lleva el día a día. Haiku 4.5 te recuerda lo
> importante. Cinco centavos de dólar por interacción. Open source. Construido
> en Guatemala. Hecho para los cien millones de personas que el software siempre
> olvidó."

**Remotion:** Numbers ticking up: cost per turn, businesses live, tasks
completed. End frame: Capataz logo + URL.

---

## Script B — "Una sola voz nota" (tightest, most viral)

**Premise:** Show ONE voice note doing all the magic. No setup, no narration —
let Capataz speak for itself.

**Total: 2:30 (leaves 30s buffer).**

### Beat 1 — Phone in hand (0:00 – 0:15)

**Screen:** Close-up of an iPhone. WhatsApp open. Long-press to record.
Operator's voice:
> "Don, llegaron 300 varillas de Ferretería Los Cipreses a las once y pico
> de la noche, cobraron cuarenta y seis mil quinientos quetzales."

### Beat 2 — Watch the agent work (0:15 – 1:30)

**Screen:** Cut to dashboard. The voice note appears as a 🎙️ bubble (right side).
"opus procesando…" pulses for ~10s.

**Remotion:** Show the agent's tool trace appearing on the side as a stack:
- `query_project_state`
- `log_event`
- `flag_anomaly: off_hours`
- `flag_anomaly: unknown_supplier`
- `recompute_score`
- `reply_in_chat`

**Voiceover (sparse):**
> "Capataz transcribe la voz. Razona en chapín. Detecta dos anomalías. Avisa al
> jefe."

Final agent bubble appears with the Spanish summary. Score drops 100 → 79 with
a smooth Remotion ticker.

### Beat 3 — The audit moment (1:30 – 2:00)

**Screen:** Click the event card → `/runs/:id` page. Camera scrolls through:
- Session ID `sesn_011...`
- Each tool call with input + output JSON
- Token count, model used

**Voiceover:**
> "Cada decisión de Capataz se puede reproducir. Para un dueño que necesita
> entender por qué bajó el score. Para un prestamista que necesita auditar
> antes de financiar. Para vos, que necesitás dormir tranquilo."

### Beat 4 — Mode flip + close (2:00 – 2:30)

**Screen:** Quick cut: tiendita dashboard with cobros widget → casa-de-dona-rosa
with bitácora task → landing with all 5 businesses listed.

**Voiceover:**
> "Construcción. Bodegas. Tiendas. Hogares. Iglesias. Mismo agente. Capataz."

End frame.

---

## Script C — "El protocolo de tu vida" (most ambitious / pitch-y)

**Premise:** Position Capataz as the operating system for the long tail of
operations that software forgot. Less demo, more manifesto.

**Total: 3:00.**

### Beat 1 — The thesis (0:00 – 0:30)

**Screen:** Black. White text fades in line by line:
> "Cuando algo importa,"
> "y nadie lo está midiendo,"
> "se pierde."

(Pause.)

> "Capataz es el agente que mide lo que importa,"
> "donde la gente ya está hablando."

**Voiceover (slower, deliberate):**
> "Cuando algo importa y nadie lo está midiendo, se pierde. La pastilla que se
> olvidó. La factura que llegó tarde. El cliente que dejó de venir. Capataz
> nació en Guatemala para escuchar todo eso."

### Beat 2 — Three lives (0:30 – 1:30)

**Screen:** Triptych — three dashboards side by side, each in light mode:
- **Casa de Doña Rosa** (cuidado de adulto mayor)
- **Tiendita Doña Marta** (tienda de barrio con fiados)
- **Villa Nueva Fase 2** (obra en construcción)

Camera zooms into each one for ~15s. Show:
- Casa: Bitácora task being completed via voice
- Tiendita: "vendí 2 cervezas a Don Chepe que paga viernes" → cobros widget updates
- Obra: "llegaron 60 sacos de cemento" → score recompute

**Voiceover (rotating):**
> "Sofía cuida a su mamá. Doña Marta atiende sola su tienda en Zona 7. Don
> Beto coordina cuadrillas en Villa Nueva. Tres vidas, tres rutinas, mismo
> agente."

### Beat 3 — How it scales (1:30 – 2:15)

**Screen:** Switch to `/agents`. Show the cost view + model tiering panel.

**Voiceover:**
> "Opus 4.7 piensa. Sonnet 4.6 ejecuta. Haiku 4.5 vigila. Cinco centavos por
> interacción. Open source. Cada negocio tiene su propio agente con memoria
> persistente. Cada decisión es auditable. Cualquier proveedor — un banco, un
> familiar, un auditor — puede reproducir el razonamiento entero."

**Remotion:** Per-vertical cost numbers tick up. Token counts swirl.

### Beat 4 — Module growth (2:15 – 2:45)

**Screen:** Tap "+ pedir módulo nuevo" on the tiendita dashboard. Type:
> *"quiero llevar control de fiados"*

**Remotion:** Watch the agent route the request — "matched: cobros" — and the
new widget materialize on the dashboard.

**Voiceover:**
> "Si te falta algo, se lo pedís. Si Capataz lo tiene, te lo activa. Si no, lo
> pasa al equipo. Capataz crece con vos, no contra vos."

### Beat 5 — Close (2:45 – 3:00)

**Screen:** Black. Single line of text:
> *"Capataz. El agente para los cien millones que el software olvidó."*

End frame: URL + logo + "Built with Claude Opus 4.7 — Anthropic Hackathon 2026".

---

## My recommendation

**Script A** for the hackathon submission. Reasons:
1. Opens with the strongest emotional beat (a human caring for her mom)
2. Demonstrates the platform thesis without saying it (Doña Rosa, then tiendita, then obra)
3. Lands on the economic story at the end — judges remember the "5¢ per interaction"
4. The Doña Rosa onboarding moment is provably impressive (proven live just now)

Script B is great as a teaser / promo. Script C is great for an investor deck.

---

## Remotion notes

If you want me to scaffold the Remotion project:
- `apps/video/` (separate package, doesn't touch the Next app)
- Compositions: `<TypingIntro>`, `<DashboardZoom>`, `<ToolTraceStack>`, `<ScoreTicker>`,
  `<ModeFlip>`, `<NumberCount>`
- All accept props so you can re-use them across the 3 scripts
- Renders to MP4 via `remotion render`

Estimate: ~2-3 hours to set up the scaffold + the 6 reusable compositions, then
~1 hour per script to wire the actual content. Say the word and I'll build it.

---

## Demo scenarios already wired in `scripts/demo/`

These you can fire from a terminal during recording (handy if you want the
agent's response timing to be repeatable):

```
pnpm demo:reset
pnpm demo:1   # construction: normal delivery
pnpm demo:2   # construction: off-hours + unknown supplier (Script A beat 6 / Script B beat 2)
pnpm demo:3   # construction: market shock
pnpm demo:4   # inventory: stock_out
pnpm demo:5   # inventory: shrinkage HIGH
pnpm demo:7   # tiendita: low stock + credit sale (Script A beat 5)
pnpm demo:8   # construction: memory moment
```

If you go with Script A, I'd add `demo:9` for "Casa de Doña Rosa morning routine"
and `demo:10` for the cross-business mode flip.
