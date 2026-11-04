"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Board } from "./Board";
import type { BoardPlacement, CaptureMeta, CapturedElement, Pick } from "@/lib/types";

export type CanvasHandle = { fit: () => void; focusBoard: (captureId: string) => void };

type Props = {
  boards: BoardPlacement[];
  metas: Record<string, CaptureMeta>;
  picks: Pick[];
  pickNumbers: Map<string, number>;
  loading: string[];
  onTogglePick: (meta: CaptureMeta, el: CapturedElement) => void;
  onRemoveBoard: (captureId: string) => void;
  onMoveBoard: (captureId: string, x: number, y: number) => void;
};

type View = { x: number; y: number; scale: number };

const MIN = 0.05;
const MAX = 2;

export const Canvas = forwardRef<CanvasHandle, Props>(function Canvas(
  { boards, metas, picks, pickNumbers, loading, onTogglePick, onRemoveBoard, onMoveBoard },
  ref,
) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 60, y: 60, scale: 0.3 });
  const [space, setSpace] = useState(false);
  const drag = useRef<
    | { kind: "pan"; sx: number; sy: number; vx: number; vy: number }
    | { kind: "board"; id: string; sx: number; sy: number; bx: number; by: number }
    | null
  >(null);
  const [dragging, setDragging] = useState(false);

  const fit = useCallback(() => {
    const el = rootRef.current;
    const placed = boards.filter((b) => metas[b.captureId]);
    if (!el || placed.length === 0) return;
    const minX = Math.min(...placed.map((b) => b.x));
    const maxX = Math.max(...placed.map((b) => b.x + metas[b.captureId].width));
    const minY = Math.min(...placed.map((b) => b.y));
    const w = el.clientWidth - 120;
    const scale = Math.max(MIN, Math.min(1, w / (maxX - minX)));
    setView({ scale, x: 60 - minX * scale, y: 60 - minY * scale });
  }, [boards, metas]);

  const focusBoard = useCallback(
    (captureId: string) => {
      const el = rootRef.current;
      const b = boards.find((x) => x.captureId === captureId);
      const m = metas[captureId];
      if (!el || !b || !m) return;
      const scale = Math.min(0.6, (el.clientWidth - 120) / m.width);
      setView({ scale, x: 60 - b.x * scale, y: 60 - b.y * scale });
    },
    [boards, metas],
  );

  useImperativeHandle(ref, () => ({ fit, focusBoard }), [fit, focusBoard]);

  // Hjul: panorér. Ctrl/⌘ + hjul eller knib på touchpad: zoom omkring musen.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      setView((v) => {
        if (e.ctrlKey || e.metaKey) {
          const factor = Math.exp(-e.deltaY * 0.0025);
          const scale = Math.max(MIN, Math.min(MAX, v.scale * factor));
          const k = scale / v.scale;
          return { scale, x: mx - (mx - v.x) * k, y: my - (my - v.y) * k };
        }
        return { ...v, x: v.x - e.deltaX, y: v.y - e.deltaY };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Mellemrum = hånd-værktøj (som i Figma).
  useEffect(() => {
    const isTyping = (e: KeyboardEvent) =>
      (e.target as HTMLElement)?.closest("input, textarea, select, [contenteditable]");
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isTyping(e)) {
        e.preventDefault();
        setSpace(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpace(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    const onBackground = e.target === e.currentTarget || (e.target as HTMLElement).dataset.bg === "1";
    if (e.button === 1 || space || onBackground) {
      e.preventDefault();
      drag.current = { kind: "pan", sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
      setDragging(true);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
  };

  const startBoardDrag = (b: BoardPlacement) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    drag.current = { kind: "board", id: b.captureId, sx: e.clientX, sy: e.clientY, bx: b.x, by: b.y };
    setDragging(true);
    rootRef.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === "pan") {
      setView((v) => ({ ...v, x: d.vx + e.clientX - d.sx, y: d.vy + e.clientY - d.sy }));
    } else {
      onMoveBoard(
        d.id,
        Math.round(d.bx + (e.clientX - d.sx) / view.scale),
        Math.round(d.by + (e.clientY - d.sy) / view.scale),
      );
    }
  };

  const endDrag = () => {
    drag.current = null;
    setDragging(false);
  };

  const zoomBy = (f: number) => {
    const el = rootRef.current;
    if (!el) return;
    const mx = el.clientWidth / 2;
    const my = el.clientHeight / 2;
    setView((v) => {
      const scale = Math.max(MIN, Math.min(MAX, v.scale * f));
      const k = scale / v.scale;
      return { scale, x: mx - (mx - v.x) * k, y: my - (my - v.y) * k };
    });
  };

  const panMode = space || dragging;

  return (
    <div
      ref={rootRef}
      data-bg="1"
      className={`relative h-full w-full overflow-hidden canvas-bg ${
        panMode ? (dragging ? "cursor-grabbing" : "cursor-grab") : ""
      }`}
      style={{ backgroundPosition: `${view.x}px ${view.y}px`, backgroundSize: `${24 * view.scale * 2}px ${24 * view.scale * 2}px` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
      >
        {boards.map((b) => {
          const meta = metas[b.captureId];
          if (!meta) return null;
          return (
            <div key={b.captureId} className="absolute" style={{ left: b.x, top: b.y }}>
              <div style={{ transform: `translateY(-${48 / Math.max(view.scale, 0.25)}px)` }}>
                <Board
                  meta={meta}
                  picks={picks}
                  pickNumbers={pickNumbers}
                  scale={view.scale}
                  panMode={panMode}
                  onTogglePick={onTogglePick}
                  onRemove={() => onRemoveBoard(b.captureId)}
                  onDragStart={startBoardDrag(b)}
                />
              </div>
            </div>
          );
        })}
      </div>

      {boards.length === 0 && loading.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="max-w-md text-center text-neutral-400">
            <p className="text-2xl font-semibold text-neutral-200">Start med 2-3 sider, du kan lide</p>
            <p className="mt-3 leading-relaxed">
              Indsæt et link øverst. Siden bliver hentet og lagt på lærredet, så du kan klikke på de elementer, du
              vil låne fra.
            </p>
          </div>
        </div>
      )}

      {loading.length > 0 && (
        <div className="absolute left-4 bottom-4 rounded-lg bg-neutral-800/90 px-4 py-3 text-sm text-neutral-200 shadow-lg">
          {loading.map((u) => (
            <div key={u} className="flex items-center gap-2">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
              Henter {u} … (tager 10-30 sekunder)
            </div>
          ))}
        </div>
      )}

      <div className="absolute bottom-4 right-4 flex items-center gap-1 rounded-lg bg-neutral-800/90 p-1 text-sm text-neutral-200 shadow-lg">
        <button className="rounded px-2 py-1 hover:bg-neutral-700" onClick={() => zoomBy(1 / 1.25)} title="Zoom ud">
          −
        </button>
        <span className="w-12 text-center tabular-nums">{Math.round(view.scale * 100)}%</span>
        <button className="rounded px-2 py-1 hover:bg-neutral-700" onClick={() => zoomBy(1.25)} title="Zoom ind">
          +
        </button>
        <button className="rounded px-2 py-1 hover:bg-neutral-700" onClick={fit} title="Vis alle sider">
          Tilpas
        </button>
      </div>

      <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-neutral-900/70 px-4 py-1.5 text-xs text-neutral-400">
        Klik = vælg element · ↑/↓ = større/mindre element · Hjul = panorér · Ctrl/⌘ + hjul = zoom · Mellemrum + træk =
        flyt
      </div>
    </div>
  );
});
