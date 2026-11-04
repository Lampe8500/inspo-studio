import "server-only";
import { randomUUID } from "node:crypto";
import { chromium, type Page } from "playwright";
import type { CaptureMeta, CapturedElement, Token } from "./types";

export const VIEWPORT_WIDTH = 1440;
const VIEWPORT_HEIGHT = 900;
/** Meget lange sider skæres af, så screenshots ikke bliver kæmpestore */
const MAX_HEIGHT = 12000;
const MAX_ELEMENTS = 900;

const COOKIE_WORDS = [
  "accept",
  "accept all",
  "accept all cookies",
  "allow all",
  "allow all cookies",
  "i agree",
  "agree",
  "got it",
  "ok",
  "accepter",
  "accepter alle",
  "accepter alle cookies",
  "tillad alle",
  "tillad alle cookies",
  "godkend",
  "godkend alle",
  "jeg accepterer",
  "forstået",
];

export function normalizeUrl(input: string): URL {
  let s = input.trim();
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  const url = new URL(s);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Kun http- og https-links virker");
  }
  return url;
}

async function dismissCookieBanner(page: Page) {
  try {
    const clicked = await page.evaluate((words) => {
      const nodes = Array.from(
        document.querySelectorAll<HTMLElement>("button, [role=button], a"),
      );
      for (const el of nodes) {
        const t = (el.innerText || "").trim().toLowerCase();
        if (!t || t.length > 40) continue;
        if (!words.includes(t)) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        el.click();
        return true;
      }
      return false;
    }, COOKIE_WORDS);
    if (clicked) await page.waitForTimeout(600);
  } catch {
    // ligegyldigt – banneret bliver bare på billedet
  }
}

async function scrollThrough(page: Page) {
  // Rul ned gennem siden, så lazy-loadede billeder og "reveal on scroll" bliver vist.
  await page.evaluate(async (maxH) => {
    const step = Math.round(window.innerHeight * 0.8);
    const limit = Math.min(document.documentElement.scrollHeight, maxH);
    for (let y = 0; y < limit; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 300));
  }, MAX_HEIGHT);
}

type RawResult = {
  title: string;
  description: string;
  height: number;
  elements: Omit<CapturedElement, "i">[];
  colors: Token[];
  fonts: Token[];
};

/** Kører inde i browseren. Må ikke bruge noget udefra. */
function extractInBrowser(args: { maxHeight: number; maxElements: number }): RawResult {
  const { maxHeight, maxElements } = args;
  const docH = Math.min(document.documentElement.scrollHeight, maxHeight);
  const pageW = document.documentElement.clientWidth;

  const colorWeight = new Map<string, number>();
  const fontWeight = new Map<string, number>();
  const addW = (m: Map<string, number>, k: string, w: number) =>
    m.set(k, (m.get(k) || 0) + w);

  const isTransparent = (c: string) =>
    c === "transparent" || c === "rgba(0, 0, 0, 0)" || /,\s*0\)$/.test(c);

  const semantic = new Set([
    "header", "nav", "main", "section", "footer", "article", "aside", "form",
    "h1", "h2", "h3", "h4", "button", "img", "picture", "video", "svg", "figure",
    "ul", "ol", "li", "blockquote", "table", "input", "textarea", "select",
  ]);

  const out: Omit<CapturedElement, "i">[] = [];
  const seenRects = new Set<string>();

  const firstText = (el: HTMLElement) =>
    (el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 160);

  const childSummary = (el: Element) => {
    const counts: string[] = [];
    let last = "";
    let n = 0;
    const flush = () => {
      if (last) counts.push(n > 1 ? `${last}×${n}` : last);
    };
    for (const c of Array.from(el.children).slice(0, 24)) {
      const r = c.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      const tag = c.tagName.toLowerCase();
      if (tag === last) n++;
      else {
        flush();
        last = tag;
        n = 1;
      }
    }
    flush();
    return counts.join(", ");
  };

  const guessRole = (
    el: HTMLElement,
    tag: string,
    r: { x: number; y: number; w: number; h: number },
    cs: CSSStyleDeclaration,
  ): CapturedElement["role"] => {
    const roleAttr = el.getAttribute("role");
    if (tag === "nav" || roleAttr === "navigation") return "nav";
    if (tag === "header" || roleAttr === "banner") return "header";
    if (tag === "footer" || roleAttr === "contentinfo") return "footer";
    if (tag === "form") return "form";
    if (/^h[1-4]$/.test(tag)) return "heading";
    if (tag === "button" || roleAttr === "button") return "button";
    if (tag === "a" && r.h < 80 && r.w < 400 && (!isTransparent(cs.backgroundColor) || cs.borderStyle !== "none"))
      return "button";
    if (["img", "picture", "video", "svg", "figure"].includes(tag)) return "image";
    if (tag === "ul" || tag === "ol") return "list";
    const wide = r.w >= pageW * 0.7;
    if (wide && r.y < 900 && r.h >= 300 && el.querySelector("h1")) return "hero";
    if (wide && r.h >= 160) return "section";
    const boxed =
      !isTransparent(cs.backgroundColor) ||
      cs.boxShadow !== "none" ||
      (cs.borderStyle !== "none" && cs.borderWidth !== "0px") ||
      parseFloat(cs.borderRadius) > 0;
    if (boxed && r.w < pageW * 0.6 && r.h >= 80) return "card";
    if (tag === "p" || tag === "span") return "text";
    return "block";
  };

  const walk = (el: Element, depth: number, parentKey: string) => {
    if (out.length >= maxElements) return;
    if (!(el instanceof HTMLElement) && !(el instanceof SVGElement)) return;
    const tag = el.tagName.toLowerCase();
    if (["script", "style", "noscript", "template", "head", "meta", "link"].includes(tag)) return;

    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) return;

    const br = el.getBoundingClientRect();
    const r = {
      x: Math.round(br.left + window.scrollX),
      y: Math.round(br.top + window.scrollY),
      w: Math.round(br.width),
      h: Math.round(br.height),
    };
    const key = `${r.x},${r.y},${r.w},${r.h}`;
    const visible = r.w >= 16 && r.h >= 12 && r.y < docH && r.y + r.h > 0 && r.x < pageW && r.x + r.w > 0;

    if (visible && el instanceof HTMLElement) {
      // farver og fonte vægtes efter areal/tekstmængde
      const area = r.w * r.h;
      if (!isTransparent(cs.backgroundColor)) addW(colorWeight, cs.backgroundColor, area / 1000);
      if (cs.backgroundImage.includes("gradient")) {
        const stops = cs.backgroundImage.match(/rgba?\([^)]+\)/g) || [];
        for (const c of stops) if (!isTransparent(c)) addW(colorWeight, c, area / 1000 / stops.length);
      }
      const ownText = Array.from(el.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent || "")
        .join("")
        .trim().length;
      if (ownText > 0) {
        addW(colorWeight, cs.color, ownText * 4);
        addW(fontWeight, cs.fontFamily.split(",")[0].replace(/["']/g, "").trim(), ownText);
      }
    }

    // Wrapper med samme størrelse som forælderen er støj – spring den over, men gå videre ned.
    const sameAsParent = key === parentKey;
    let keep = false;
    if (visible && !sameAsParent && !seenRects.has(key) && el instanceof HTMLElement) {
      const isSem = semantic.has(tag);
      const boxed =
        !isTransparent(cs.backgroundColor) ||
        cs.backgroundImage !== "none" ||
        cs.boxShadow !== "none" ||
        (cs.borderStyle !== "none" && cs.borderWidth !== "0px");
      const big = r.w >= pageW * 0.3 && r.h >= 80;
      const layout = (cs.display.includes("flex") || cs.display.includes("grid")) && r.h >= 40 && el.children.length >= 2;
      const linkBtn = tag === "a" && r.h >= 28 && r.h <= 90;
      keep = isSem || boxed || big || layout || linkBtn;
    }
    if (visible && el instanceof SVGElement && tag === "svg" && r.w >= 24) keep = !seenRects.has(key);

    if (keep) {
      seenRects.add(key);
      const h = el as HTMLElement;
      out.push({
        tag,
        role: el instanceof HTMLElement ? guessRole(h, tag, r, cs) : "image",
        rect: r,
        depth,
        text: el instanceof HTMLElement ? firstText(h) : "",
        children: childSummary(el),
        styles: {
          color: cs.color,
          backgroundColor: cs.backgroundColor,
          backgroundImage: cs.backgroundImage.startsWith("url(") ? "billede" : cs.backgroundImage,
          fontFamily: cs.fontFamily,
          fontSize: cs.fontSize,
          fontWeight: cs.fontWeight,
          lineHeight: cs.lineHeight,
          letterSpacing: cs.letterSpacing,
          textTransform: cs.textTransform,
          padding: cs.padding,
          borderRadius: cs.borderRadius,
          border: cs.borderStyle === "none" ? "none" : `${cs.borderWidth} ${cs.borderStyle} ${cs.borderColor}`,
          boxShadow: cs.boxShadow,
          display: cs.display,
          flexDirection: cs.flexDirection,
          gridTemplateColumns: cs.gridTemplateColumns,
          gap: cs.gap,
          textAlign: cs.textAlign,
        },
      });
    }
    if (tag === "svg") return;
    for (const c of Array.from(el.children)) walk(c, keep ? depth + 1 : depth, key);
  };

  const bodyBr = document.body.getBoundingClientRect();
  const bodyKey = `${Math.round(bodyBr.left)},${Math.round(bodyBr.top + window.scrollY)},${Math.round(bodyBr.width)},${Math.round(bodyBr.height)}`;
  for (const c of Array.from(document.body.children)) walk(c, 0, bodyKey);

  const top = (m: Map<string, number>, n: number): Token[] =>
    Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([value, weight]) => ({ value, weight: Math.round(weight) }));

  return {
    title: document.title,
    description:
      document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content || "",
    height: docH,
    elements: out,
    colors: top(colorWeight, 10),
    fonts: top(fontWeight, 5),
  };
}

export async function capturePage(rawUrl: string): Promise<{ meta: CaptureMeta; shot: Buffer }> {
  const url = normalizeUrl(rawUrl);
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });
  try {
    const context = await browser.newContext({
      viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
      deviceScaleFactor: 1,
      locale: "da-DK",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 inspo-studio",
    });
    const page = await context.newPage();
    await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await dismissCookieBanner(page);
    await scrollThrough(page);
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});

    const raw = await page.evaluate(extractInBrowser, {
      maxHeight: MAX_HEIGHT,
      maxElements: MAX_ELEMENTS,
    });
    const fullHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    const height = Math.min(fullHeight, MAX_HEIGHT);

    const shot = await page.screenshot({
      type: "jpeg",
      quality: 80,
      fullPage: true,
      clip: fullHeight > MAX_HEIGHT ? { x: 0, y: 0, width: VIEWPORT_WIDTH, height } : undefined,
      animations: "disabled",
    });

    const meta: CaptureMeta = {
      id: randomUUID(),
      url: page.url(),
      host: new URL(page.url()).host.replace(/^www\./, ""),
      title: raw.title,
      description: raw.description,
      capturedAt: new Date().toISOString(),
      width: VIEWPORT_WIDTH,
      height,
      truncated: fullHeight > MAX_HEIGHT,
      colors: raw.colors,
      fonts: raw.fonts,
      elements: raw.elements.map((e, i) => ({ ...e, i })),
    };
    return { meta, shot };
  } finally {
    await browser.close();
  }
}
