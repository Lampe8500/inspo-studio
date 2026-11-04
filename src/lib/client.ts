"use client";

import type { CapturedElement, PickRole, Rect } from "./types";

export const shotUrl = (captureId: string) => `/api/captures/${captureId}/shot`;

const imageCache = new Map<string, Promise<HTMLImageElement>>();

function loadImage(captureId: string) {
  let p = imageCache.get(captureId);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Kunne ikke indlæse screenshot"));
      img.src = shotUrl(captureId);
    });
    imageCache.set(captureId, p);
  }
  return p;
}

/** Skærer et element ud af screenshottet og returnerer JPEG som base64 (uden præfiks). */
export async function cropToBase64(captureId: string, rect: Rect, maxW = 1200, maxH = 1600) {
  const img = await loadImage(captureId);
  const x = Math.max(0, Math.min(rect.x, img.naturalWidth - 1));
  const y = Math.max(0, Math.min(rect.y, img.naturalHeight - 1));
  const w = Math.max(1, Math.min(rect.w, img.naturalWidth - x));
  const h = Math.max(1, Math.min(rect.h, img.naturalHeight - y));
  const scale = Math.min(1, maxW / w, maxH / h);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas virker ikke i denne browser");
  ctx.drawImage(img, x, y, w, h, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
}

export function defaultPickRole(el: CapturedElement): PickRole {
  switch (el.role) {
    case "header":
    case "nav":
      return "Menu";
    case "hero":
      return "Hero";
    case "section":
      return "Sektion";
    case "card":
      return "Kort";
    case "button":
      return "Knap";
    case "footer":
      return "Footer";
    case "form":
      return "Formular";
    case "heading":
    case "text":
      return "Typografi";
    default:
      return el.rect.w >= 1000 ? "Sektion" : "Andet";
  }
}

export const PICK_ROLES: PickRole[] = [
  "Menu",
  "Hero",
  "Sektion",
  "Kort",
  "Knap",
  "Footer",
  "Formular",
  "Typografi",
  "Farver",
  "Andet",
];

export function uid() {
  return crypto.randomUUID();
}

/** Fjerner evt. ```html-markering, hvis modellen alligevel kommer til at sende det. */
export function cleanHtml(raw: string) {
  let s = raw.trim();
  s = s.replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/i, "");
  const start = s.search(/<!doctype html|<html/i);
  if (start > 0) s = s.slice(start);
  return s.trim();
}
