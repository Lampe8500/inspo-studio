"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { shotUrl } from "@/lib/client";
import type { CaptureMeta, CapturedElement, Pick, Role } from "@/lib/types";

const ROLE_DA: Record<Role, string> = {
  header: "Menu",
  nav: "Menu",
  hero: "Hero",
  section: "Sektion",
  card: "Kort",
  button: "Knap",
  heading: "Overskrift",
  image: "Billede",
  form: "Formular",
  list: "Liste",
  footer: "Footer",
  text: "Tekst",
  block: "Blok",
};

type Props = {
  meta: CaptureMeta;
  picks: Pick[];
  /** nummer i moodboardet for hver pick-id */
  pickNumbers: Map<string, number>;
  scale: number;
  onTogglePick: (meta: CaptureMeta, el: CapturedElement) => void;
  onRemove: () => void;
  onShowPalette: () => void;
  onDragStart: (e: React.PointerEvent) => void;
  panMode: boolean;
};

export function Board({
  meta,
  picks,
  pickNumbers,
  scale,
  onTogglePick,
  onRemove,
  onShowPalette,
  onDragStart,
  panMode,
}: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  // Niveau gælder kun, så længe musen er over det samme mindste element.
  const [levelState, setLevelState] = useState({ anchor: -1, level: 0 });

  // Alle elementer under et punkt, mindste først.
  const candidatesAt = (pt: { x: number; y: number } | null) =>
    !pt
      ? []
      : meta.elements
          .filter(
            (e) =>
              pt.x >= e.rect.x &&
              pt.x <= e.rect.x + e.rect.w &&
              pt.y >= e.rect.y &&
              pt.y <= e.rect.y + e.rect.h,
          )
          .sort((a, b) => a.rect.w * a.rect.h - b.rect.w * b.rect.h);

  const candidates = useMemo(() => candidatesAt(point), [point, meta.elements]); // eslint-disable-line react-hooks/exhaustive-deps

  const anchor = candidates[0]?.i ?? -1;
  const level = levelState.anchor === anchor ? levelState.level : 0;
  const hoveredIdx = Math.min(level, candidates.length - 1);
  const hovered = candidates[hoveredIdx];
  const bigger = candidates[hoveredIdx + 1];
  const smaller = hoveredIdx > 0 ? candidates[hoveredIdx - 1] : undefined;

  // Piletaster skifter niveau: op = større (forælder), ned = mindre.
  useEffect(() => {
    if (!point) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea, select")) return;
      if (e.key === "ArrowUp" || e.key === "w") {
        e.preventDefault();
        setLevelState({ anchor, level: Math.min(level + 1, Math.max(0, candidates.length - 1)) });
      } else if (e.key === "ArrowDown" || e.key === "s") {
        e.preventDefault();
        setLevelState({ anchor, level: Math.max(0, level - 1) });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [point, anchor, level, candidates.length]);

  const toLocal = (e: React.PointerEvent | React.MouseEvent) => {
    const r = overlayRef.current!.getBoundingClientRect();
    const k = meta.width / r.width;
    return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k };
  };

  const myPicks = picks.filter((p) => p.captureId === meta.id);
  const border = Math.max(1.5, 2 / scale);
  const labelSize = Math.max(11, 12 / scale);

  return (
    <div className="absolute" style={{ width: meta.width }}>
      <div
        className="flex items-center gap-3 select-none cursor-grab active:cursor-grabbing text-neutral-300"
        style={{ height: 48 / Math.max(scale, 0.25), fontSize: 14 / Math.max(scale, 0.25) }}
        onPointerDown={onDragStart}
      >
        <span className="min-w-0 font-semibold text-white truncate" title={meta.title}>{meta.host}</span>
        {meta.truncated && <span className="opacity-40 shrink-0">kun øverste del</span>}
        <button
          className="ml-auto shrink-0 rounded-full bg-white/10 px-[0.8em] py-[0.2em] text-neutral-200 hover:bg-white/20"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onShowPalette}
          title="Se sidens farver og fonte"
        >
          <span className="mr-[0.4em] inline-flex gap-[0.15em] align-[-0.1em]">
            {meta.colors.slice(0, 3).map((c) => (
              <span key={c.value} className="inline-block h-[0.8em] w-[0.8em] rounded-full ring-1 ring-white/30" style={{ background: c.value }} />
            ))}
          </span>
          Farver
        </button>
        <button
          className="shrink-0 opacity-60 hover:opacity-100 hover:text-red-400"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onRemove}
          title="Fjern siden fra lærredet"
        >
          ✕
        </button>
      </div>
      <div className="relative shadow-2xl shadow-black/50 bg-white" style={{ height: meta.height }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={shotUrl(meta.id)}
          alt={`Screenshot af ${meta.host}`}
          width={meta.width}
          height={meta.height}
          draggable={false}
          className="block select-none"
        />
        <div
          ref={overlayRef}
          className={`absolute inset-0 ${panMode ? "" : "cursor-crosshair"}`}
          onPointerMove={(e) => {
            if (panMode) return;
            setPoint(toLocal(e));
          }}
          onPointerLeave={() => setPoint(null)}
          onClick={(e) => {
            if (panMode) return;
            // Brug klikkets egen position – state kan være et træk bagud ved hurtige klik.
            const atClick = candidatesAt(toLocal(e));
            if (atClick.length === 0) return;
            const lvl = atClick[0].i === anchor ? level : 0;
            e.stopPropagation();
            onTogglePick(meta, atClick[Math.min(lvl, atClick.length - 1)]);
          }}
        />

        {myPicks.map((p) => (
          <div
            key={p.id}
            className="absolute pointer-events-none bg-emerald-400/10"
            style={{
              left: p.rect.x,
              top: p.rect.y,
              width: p.rect.w,
              height: p.rect.h,
              outline: `${border}px solid rgb(52 211 153)`,
            }}
          >
            <span
              className="absolute -top-px -left-px bg-emerald-400 text-emerald-950 font-bold px-1.5 leading-tight"
              style={{ fontSize: labelSize * 1.2 }}
            >
              {pickNumbers.get(p.id)} · {p.role}
            </span>
          </div>
        ))}

        {hovered && !panMode && (
          <div
            className="absolute pointer-events-none bg-sky-400/10"
            style={{
              left: hovered.rect.x,
              top: hovered.rect.y,
              width: hovered.rect.w,
              height: hovered.rect.h,
              outline: `${border}px solid rgb(56 189 248)`,
            }}
          >
            <span
              className="absolute left-0 flex items-center gap-1.5 whitespace-nowrap leading-tight"
              style={{ fontSize: labelSize, top: -labelSize * 1.6 }}
            >
              <span className="bg-sky-500 px-1.5 py-px font-semibold text-white">
                {myPicks.some((p) => p.elementIndex === hovered.i) ? "Klik for at fjerne" : `Klik for at vælge: ${ROLE_DA[hovered.role]}`}
              </span>
              {bigger && <span className="bg-neutral-900/90 px-1.5 py-px text-neutral-200">↑ {ROLE_DA[bigger.role]}</span>}
              {smaller && <span className="bg-neutral-900/90 px-1.5 py-px text-neutral-200">↓ {ROLE_DA[smaller.role]}</span>}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
