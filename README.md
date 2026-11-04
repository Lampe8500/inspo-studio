# Inspo Studio

Et personligt værktøj til at samle inspiration fra 2-3 hjemmesider og lave en ny side ud fra de dele, du kan lide.

1. **Indsæt et link.** Siden bliver hentet med en headless browser. Du får et screenshot plus et kort over alle elementer (placering, farver, fonte, afstande).
2. **Klik på det, du kan lide**, på lærredet: menu, hero, kort, footer osv. Med **↑/↓** skifter du mellem et større eller mindre element under musen.
3. **Moodboardet** til højre samler dine valg. Du kan ændre typen, vælge om du vil låne *layout*, *farver* og/eller *typografi*, skrive en note og ændre rækkefølgen.
4. **Lav side med AI.** Claude får udklip, målte CSS-værdier og dine noter og laver én samlet HTML-side (Tailwind). Du kan rette den med almindelig tekst, skifte mellem versioner og downloade den.

Med "Følg min rækkefølge" slået til bliver moodboardets rækkefølge til sidens opbygning, så du selv bestemmer strukturen. Slår du det fra, vælger AI'en opbygningen.

## Kom i gang

Kræver Node 20 eller nyere.

```bash
npm install
npx playwright install chromium
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local
npm run dev
```

Åbn http://localhost:3000.

Valgfrit i `.env.local`:

- `INSPO_MODEL`: en anden Claude-model (standard er `claude-opus-5-5`)
- `CHROMIUM_PATH`: sti til en Chromium, hvis du ikke vil bruge Playwrights egen

## Styring på lærredet

| Handling | Sådan |
|---|---|
| Vælg / fravælg element | Klik |
| Større / mindre element | ↑ / ↓ (eller W / S) |
| Panorér | Scroll, eller træk i baggrunden, eller hold mellemrum og træk |
| Zoom | Ctrl/⌘ + scroll, eller knib på touchpad |
| Flyt en side | Træk i dens titellinje |

## Hvor ligger data

Alt ligger lokalt i `./data` (er i `.gitignore`):

- `data/captures/<id>/shot.jpg` og `meta.json`: hentede sider
- `data/project.json`: lærred, moodboard, beskrivelse og genererede versioner

Slet mappen for at starte forfra.

## Opbygning

```
src/lib/capture.ts            Playwright: henter siden, lukker cookie-banner, måler elementer
src/lib/store.ts              Læs og skriv i ./data
src/app/api/capture           POST { url } → henter og gemmer en side
src/app/api/captures/[id]     Metadata og screenshot for en hentet side
src/app/api/project           Hent og gem projektet
src/app/api/generate          Sender udklip til Claude og streamer HTML tilbage (NDJSON)
src/components/Canvas.tsx     Lærred med panorering og zoom
src/components/Board.tsx      Screenshot med klikbare elementer
src/components/Moodboard.tsx  Valgte elementer, noter og knappen "Lav side med AI"
src/components/Preview.tsx    Forhåndsvisning, versioner, rettelser og download
```

## Begrænsninger

- Sider over 12.000 px bliver skåret af.
- Nogle sider blokerer robotter eller viser en captcha. Så bliver screenshottet tomt eller forkert.
- Animationer og elementer, der først vises ved interaktion (fx dropdown-menuer), kommer ikke med.
- Værktøjet låner stil og opbygning. AI'en får besked på ikke at kopiere tekst, logoer og billeder.

## Idéer til næste trin

- Eksport som Next.js/React-komponenter i stedet for én HTML-fil
- Manuel side-stak, hvor hver sektion kan laves om for sig
- Flere projekter
- Mobil-screenshot af kildesiderne
- Udtræk af et fælles designsystem (tokens) som en fil for sig
