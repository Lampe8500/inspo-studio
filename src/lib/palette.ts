// Udtræk af farver og fonte fra en hentet side. Kører i browseren ud fra de målte elementer,
// så det også virker på sider, der er hentet før funktionen fandtes.

import type { CaptureMeta, CapturedElement } from "./types";

export type ColorRole = "Baggrund" | "Flade" | "Tekst" | "Accent";
export type FontRole = "Overskrift" | "Brødtekst";

export type FoundColor = { hex: string; role: ColorRole; score: number };
export type FoundFont = { family: string; role: FontRole; size: string; weight: string; stack: string };

type RGB = [number, number, number];

function parseColor(c: string): { rgb: RGB; a: number } | null {
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
  return { rgb: [parts[0], parts[1], parts[2]], a: parts[3] ?? 1 };
}

export function toHex([r, g, b]: RGB) {
  return "#" + [r, g, b].map((n) => Math.round(n).toString(16).padStart(2, "0")).join("");
}

function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const dist = (a: RGB, b: RGB) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Mørk eller lys tekst oven på en farve. */
export function readableOn(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return l > 0.6 ? "#111111" : "#ffffff";
}

const saturation = ([r, g, b]: RGB) => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
};

/** Første font i en font-stack, uden anførselstegn. */
export const firstFamily = (stack: string) => stack.split(",")[0].replace(/["']/g, "").trim();

export function extractPalette(meta: CaptureMeta): { colors: FoundColor[]; fonts: FoundFont[] } {
  // Saml point pr. farve og rolle.
  type Bucket = { rgb: RGB; Baggrund: number; Flade: number; Tekst: number; Accent: number };
  const buckets: Bucket[] = [];
  const add = (raw: string, role: ColorRole, w: number) => {
    const p = parseColor(raw);
    if (!p || p.a < 0.5 || w <= 0) return;
    let b = buckets.find((x) => dist(x.rgb, p.rgb) < 20);
    if (!b) {
      b = { rgb: p.rgb, Baggrund: 0, Flade: 0, Tekst: 0, Accent: 0 };
      buckets.push(b);
    }
    b[role] += w;
  };

  const pageArea = meta.width * meta.height;
  for (const el of meta.elements) {
    const s = el.styles;
    const area = el.rect.w * el.rect.h;
    const bg = parseColor(s.backgroundColor);
    if (bg && bg.a >= 0.5) {
      if (el.role === "button") add(s.backgroundColor, "Accent", 40 + area / 500);
      else if (area > pageArea * 0.08 || el.rect.w >= meta.width * 0.9) add(s.backgroundColor, "Baggrund", area / 1000);
      else add(s.backgroundColor, saturation(bg.rgb) > 0.45 ? "Accent" : "Flade", area / 1000);
    }
    for (const c of s.backgroundImage.match(/rgba?\([^)]+\)/g) || []) {
      add(c, "Baggrund", area / 2000);
    }
    if (el.text) {
      const textW = Math.min(el.text.length, 160);
      const p = parseColor(s.color);
      const isLink = el.role === "button" || el.tag === "a";
      if (p && isLink && saturation(p.rgb) > 0.35) add(s.color, "Accent", textW);
      else add(s.color, "Tekst", textW * (el.role === "heading" ? 2 : 1));
    }
  }
  // Sidens grundfarve fylder mest af alt.
  if (meta.pageBackground) add(meta.pageBackground, "Baggrund", pageArea / 400);
  // Ældre hentninger uden målte elementer: brug sidens samlede farver.
  if (buckets.length === 0) for (const t of meta.colors) add(t.value, "Flade", t.weight);

  const colors = buckets
    .map((b) => {
      const roles: ColorRole[] = ["Baggrund", "Flade", "Tekst", "Accent"];
      const role = roles.reduce((best, r) => (b[r] > b[best] ? r : best), "Baggrund" as ColorRole);
      return { hex: toHex(b.rgb), role, score: b.Baggrund + b.Flade + b.Tekst + b.Accent };
    })
    .filter((c) => c.score > 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  const order: ColorRole[] = ["Baggrund", "Flade", "Tekst", "Accent"];
  colors.sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role) || b.score - a.score);

  // Fonte: overskrift = den største tekst-font, brødtekst = den mest brugte i almindelig tekst.
  const px = (v: string) => parseFloat(v) || 0;
  const headings = meta.elements.filter((e) => e.role === "heading" || e.tag === "h1" || e.tag === "h2");
  const body = meta.elements.filter(
    (e) => e.text && ["text", "card", "block", "section", "list"].includes(e.role) && px(e.styles.fontSize) <= 20,
  );

  const pickFont = (els: CapturedElement[], role: FontRole, by: (e: CapturedElement) => number): FoundFont | null => {
    if (els.length === 0) return null;
    const score = new Map<string, { w: number; el: CapturedElement }>();
    for (const e of els) {
      const fam = firstFamily(e.styles.fontFamily);
      const cur = score.get(fam);
      const w = by(e);
      if (!cur) score.set(fam, { w, el: e });
      else {
        cur.w += w;
        if (px(e.styles.fontSize) > px(cur.el.styles.fontSize)) cur.el = e;
      }
    }
    const [family, { el }] = [...score.entries()].sort((a, b) => b[1].w - a[1].w)[0];
    return { family, role, size: el.styles.fontSize, weight: el.styles.fontWeight, stack: el.styles.fontFamily };
  };

  const fonts: FoundFont[] = [];
  const h = pickFont(headings, "Overskrift", (e) => px(e.styles.fontSize) ** 2);
  const b = pickFont(body, "Brødtekst", (e) => Math.min(e.text.length, 200));
  if (h) fonts.push(h);
  if (b) fonts.push(b);
  if (fonts.length === 0 && meta.fonts[0]) {
    fonts.push({ family: meta.fonts[0].value, role: "Brødtekst", size: "16px", weight: "400", stack: meta.fonts[0].value });
  }
  return { colors, fonts };
}

/** Forsøger at hente en font fra Google Fonts, så den kan vises i sin rigtige form. */
const requested = new Set<string>();
const SYSTEM_FONTS = /^(arial|helvetica|georgia|times|times new roman|verdana|system-ui|-apple-system|sans-serif|serif|monospace|segoe ui|tahoma|trebuchet ms|courier new)$/i;

export function loadFontPreview(family: string) {
  if (typeof document === "undefined" || requested.has(family) || SYSTEM_FONTS.test(family)) return;
  requested.add(family);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:wght@400;700&display=swap`;
  document.head.appendChild(link);
}

export function paletteAsCss(colors: { hex: string; role: string }[], fonts: { family: string; role: string }[]) {
  const count: Record<string, number> = {};
  const slug = (r: string) => r.toLowerCase().replace("ø", "o").replace("æ", "ae").replace("å", "aa");
  const lines = colors.map((c) => {
    const k = slug(c.role);
    count[k] = (count[k] ?? 0) + 1;
    return `  --${k}${count[k] > 1 ? `-${count[k]}` : ""}: ${c.hex};`;
  });
  for (const f of fonts) lines.push(`  --font-${slug(f.role)}: "${f.family}", sans-serif;`);
  return `:root {\n${lines.join("\n")}\n}`;
}
