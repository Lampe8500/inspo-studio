"use client";

import { useEffect, useLayoutEffect, useState } from "react";

type Step = { target: string; title: string; text: string; place: "center" | "left" | "above-left" };

const STEPS: Step[] = [
  {
    target: '[data-tour="canvas"]',
    title: "1. Klik på det, du kan lide",
    text: "Her ligger siderne. Hold musen over en menu, en overskrift eller nogle kort, og klik for at vælge. Med ↑ og ↓ vælger du et større eller mindre område.",
    place: "center",
  },
  {
    target: '[data-tour="moodboard"]',
    title: "2. Dine valg samles her",
    text: "Træk i dem for at bestemme rækkefølgen på siden, og skriv en note, hvis noget skal være anderledes. Under “Farver og fonte” kan du gemme en sides farver og skrifttyper.",
    place: "left",
  },
  {
    target: '[data-tour="generate"]',
    title: "3. Lav siden",
    text: "Skriv kort, hvad siden skal bruges til, og tryk her. Så laver Claude én samlet side ud fra dine valg, som du bagefter kan rette med almindelig tekst.",
    place: "above-left",
  },
];

const KEY = "inspo-tour-done";

export function tourSeen() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return true;
  }
}

type Rect = { x: number; y: number; w: number; h: number };

export function Tour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const step = STEPS[i];

  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const el = document.querySelector(step.target);
      if (!el) return setRect(null);
      const r = el.getBoundingClientRect();
      setRect({ x: r.left, y: r.top, w: r.width, h: r.height });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open, step.target]);

  const finish = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      // ingen lagring – guiden kommer bare igen næste gang
    }
    setI(0);
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!open || !rect) return null;

  const pad = 6;
  const bubbleW = 340;
  let bubble: React.CSSProperties;
  if (step.place === "center") {
    bubble = { left: rect.x + rect.w / 2 - bubbleW / 2, top: rect.y + rect.h / 2 - 90 };
  } else if (step.place === "left") {
    bubble = { left: rect.x - bubbleW - 20, top: rect.y + 80 };
  } else {
    bubble = { left: rect.x - bubbleW - 20, top: rect.y + rect.h - 170 };
  }

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={step.title}>
      {/* Mørk baggrund med et hul omkring det, der forklares */}
      <div
        className="pointer-events-none absolute rounded-xl transition-all duration-300"
        style={{
          left: rect.x - pad,
          top: rect.y - pad,
          width: rect.w + pad * 2,
          height: rect.h + pad * 2,
          boxShadow: "0 0 0 9999px rgba(0,0,0,0.62)",
          outline: "2px solid rgb(56 189 248)",
        }}
      />
      <div className="absolute inset-0" onClick={finish} />
      <div
        className="absolute rounded-2xl bg-white p-5 text-neutral-900 shadow-2xl transition-all duration-300"
        style={{ width: bubbleW, ...bubble }}
      >
        <p className="text-base font-semibold">{step.title}</p>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">{step.text}</p>
        <div className="mt-4 flex items-center gap-2">
          <div className="flex gap-1">
            {STEPS.map((_, n) => (
              <span key={n} className={`h-1.5 w-1.5 rounded-full ${n === i ? "bg-sky-500" : "bg-neutral-300"}`} />
            ))}
          </div>
          <button onClick={finish} className="ml-auto px-2 py-1 text-sm text-neutral-500 hover:text-neutral-900">
            Spring over
          </button>
          <button
            onClick={() => (i < STEPS.length - 1 ? setI(i + 1) : finish())}
            className="rounded-lg bg-neutral-900 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700"
          >
            {i < STEPS.length - 1 ? "Næste" : "Kom i gang"}
          </button>
        </div>
      </div>
    </div>
  );
}
