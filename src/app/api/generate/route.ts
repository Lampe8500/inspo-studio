import Anthropic from "@anthropic-ai/sdk";
import type { GenerateEvent, GeneratePick, GenerateRequest } from "@/lib/types";

export const maxDuration = 600;

const MODEL = process.env.INSPO_MODEL || "claude-opus-5-5";

const SYSTEM = `Du er en erfaren webdesigner og frontend-udvikler. Brugeren har samlet inspiration fra 2-3 eksisterende hjemmesider ved at klikke på de elementer, de kan lide (en menu, en hero, nogle kort, en footer, farver, typografi). Du får et udklip (screenshot) af hvert element plus de målte CSS-værdier.

Din opgave er at lave ÉN ny, sammenhængende side, der låner stil og layout fra udklippene og får dem til at føles som ét design.

Sådan arbejder du:
- Saml først et fælles designsystem: én farvepalet, ét typografisk system (højst to fonte), én skala for afstande og hjørner. Elementer fra forskellige sider skal tilpasses det system, så siden ikke ligner et klippe-klistre-arbejde.
- Respekter hvad brugeren vil låne fra hvert udklip: "layout" betyder opbygning, proportioner og placering; "farver" betyder farvebrug; "typografi" betyder fonte, størrelser, vægt og rytme. Noter fra brugeren vejer tungere end udklippene.
- Kopier ikke tekst, logoer, billeder eller varemærker fra udklippene. Skriv ny tekst, der passer til brugerens beskrivelse af siden. Billeder laves som rolige CSS-gradienter, mønstre eller inline-SVG, eller som <img> fra https://picsum.photos med passende størrelse.
- Siden skal være responsiv (virke fra 360px til 1440px), tilgængelig (semantisk HTML, god kontrast, alt-tekster, synlig fokus) og uden brudte links (brug href="#").

Output-format:
- Svar KUN med ét komplet HTML-dokument, startende med <!doctype html> og sluttende med </html>. Ingen forklaring, ingen markdown, ingen kodeblok-markering.
- Brug Tailwind via <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>. Egne CSS-variabler og lidt <style> er fint.
- Fonte må hentes fra Google Fonts. Lidt vanilla-JavaScript er fint (fx mobilmenu), men ingen andre eksterne scripts.
- Øverst i <head> skal der være en HTML-kommentar, der kort beskriver designsystemet (farver, fonte, afstande) og hvilket udklip hver sektion bygger på.`;

function describePick(p: GeneratePick, n: number) {
  const s = p.styles;
  const lines = [
    `Udklip ${n}: ${p.role} fra ${p.host} (<${p.tag}>, ${p.size.w}×${p.size.h}px på en 1440px bred side)`,
    `Lån: ${p.aspects.length ? p.aspects.join(", ") : "alt"}`,
  ];
  if (p.note.trim()) lines.push(`Brugerens note: ${p.note.trim()}`);
  if (p.children) lines.push(`Opbygning (direkte børn): ${p.children}`);
  if (p.text) lines.push(`Tekst i originalen (kun til forståelse, må ikke genbruges): "${p.text}"`);
  lines.push(
    `Målte CSS-værdier: font ${s.fontFamily} ${s.fontSize}/${s.lineHeight} vægt ${s.fontWeight}` +
      `${s.letterSpacing !== "normal" ? `, spacing ${s.letterSpacing}` : ""}` +
      `${s.textTransform !== "none" ? `, ${s.textTransform}` : ""}; farve ${s.color}; baggrund ${s.backgroundColor}` +
      `${s.backgroundImage !== "none" ? ` + ${s.backgroundImage.slice(0, 200)}` : ""}; padding ${s.padding}; radius ${s.borderRadius}` +
      `${s.border !== "none" ? `; kant ${s.border}` : ""}${s.boxShadow !== "none" ? `; skygge ${s.boxShadow}` : ""}` +
      `; display ${s.display}${s.display.includes("flex") ? ` ${s.flexDirection}` : ""}` +
      `${s.display.includes("grid") ? ` kolonner ${s.gridTemplateColumns}` : ""}${s.gap !== "normal" ? `; gap ${s.gap}` : ""}`,
  );
  return lines.join("\n");
}

function buildUserContent(req: GenerateRequest): Anthropic.Beta.BetaContentBlockParam[] {
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  const lang = req.language === "da" ? "dansk" : "engelsk";

  content.push({
    type: "text",
    text:
      `Hvad siden skal bruges til: ${req.brief.trim() || "(ikke beskrevet – find selv på et troværdigt formål ud fra udklippene)"}\n` +
      `Sprog på siden: ${lang}\n` +
      (req.followOrder
        ? "Rækkefølge: byg siden med sektionerne i præcis den rækkefølge, udklippene kommer i (udklip af typen Typografi og Farver er stilreferencer, ikke sektioner)."
        : "Rækkefølge: du vælger selv den bedste opbygning af siden ud fra udklippene.") +
      "\n\nDominerende farver og fonte målt på hver kildeside (vægtet efter areal og tekstmængde):\n" +
      req.sites
        .map(
          (s) =>
            `- ${s.host}: farver ${s.colors.slice(0, 8).map((c) => c.value).join(" | ")}; fonte ${s.fonts
              .slice(0, 4)
              .map((f) => f.value)
              .join(", ")}`,
        )
        .join("\n"),
  });

  req.picks.forEach((p, idx) => {
    content.push({ type: "text", text: describePick(p, idx + 1) });
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: p.image },
    });
  });

  if (req.refine) {
    content.push({
      type: "text",
      text:
        "Her er den nuværende version af siden, som du lavede tidligere:\n\n" +
        req.refine.html +
        `\n\nRet siden sådan her: ${req.refine.instruction.trim()}\n\nBehold alt andet, som det er, medmindre rettelsen kræver noget andet. Svar med hele det opdaterede HTML-dokument.`,
    });
  } else {
    content.push({ type: "text", text: "Lav nu siden." });
  }
  return content;
}

export async function POST(request: Request) {
  const req = (await request.json()) as GenerateRequest;
  if (!Array.isArray(req.picks) || req.picks.length === 0) {
    return Response.json({ error: "Vælg mindst ét element først" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const send = (controller: ReadableStreamDefaultController, e: GenerateEvent) =>
    controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const client = new Anthropic();
        const msgStream = client.beta.messages.stream(
          {
            model: MODEL,
            max_tokens: 64000,
            thinking: { type: "adaptive" },
            output_config: { effort: "high" },
            // Hvis en sikkerhedsklassifikator afviser, prøver API'et selv en anden model.
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            system: SYSTEM,
            messages: [{ role: "user", content: buildUserContent(req) }],
          },
          { signal: request.signal },
        );

        for await (const event of msgStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            send(controller, { t: "delta", v: event.delta.text });
          }
        }
        const final = await msgStream.finalMessage();
        if (final.stop_reason === "refusal") {
          send(controller, {
            t: "error",
            message: "Modellen afviste forespørgslen. Prøv at omformulere beskrivelsen eller noterne.",
          });
        } else {
          send(controller, { t: "done", stop: final.stop_reason, model: final.model });
        }
      } catch (err) {
        let message = err instanceof Error ? err.message : String(err);
        if (err instanceof Anthropic.AuthenticationError) {
          message = "Ingen gyldig API-nøgle. Sæt ANTHROPIC_API_KEY i .env.local og genstart.";
        } else if (err instanceof Anthropic.RateLimitError) {
          message = "For mange forespørgsler lige nu. Vent lidt og prøv igen.";
        } else if (err instanceof Anthropic.APIError) {
          message = `API-fejl ${err.status}: ${err.message}`;
        } else if (/credentials|api key|apiKey/i.test(message)) {
          message = "Ingen API-nøgle fundet. Sæt ANTHROPIC_API_KEY i .env.local og genstart.";
        }
        try {
          send(controller, { t: "error", message });
        } catch {
          // klienten er gået
        }
      } finally {
        try {
          controller.close();
        } catch {
          // allerede lukket
        }
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
