"use client";

import { useState } from "react";
import { PICK_ROLES, shotUrl } from "@/lib/client";
import { PalettePanel } from "./PalettePanel";
import type { Aspect, CaptureMeta, Pick, Project } from "@/lib/types";

/** Ét enkelt valg i stedet for tre knapper: hvad vil du låne fra udklippet? */
const BORROW: { label: string; aspects: Aspect[] }[] = [
  { label: "Det hele", aspects: ["layout", "farver", "typografi"] },
  { label: "Kun opbygningen", aspects: ["layout"] },
  { label: "Kun farverne", aspects: ["farver"] },
  { label: "Kun skrifttypen", aspects: ["typografi"] },
];

const borrowLabel = (aspects: Aspect[]) =>
  BORROW.find((b) => b.aspects.length === aspects.length && b.aspects.every((a) => aspects.includes(a)))?.label ??
  "Det hele";

const THUMB_W = 292;
const THUMB_H = 120;

/** Udklippet skaleret til at passe i en fast boks, så smalle menuer også kan ses. */
function Thumb({ pick, meta }: { pick: Pick; meta?: CaptureMeta }) {
  if (!meta) return <div className="rounded-md bg-neutral-800" style={{ height: THUMB_H }} />;
  const k = Math.min(THUMB_W / pick.rect.w, THUMB_H / pick.rect.h);
  const w = pick.rect.w * k;
  const h = pick.rect.h * k;
  return (
    <div className="flex items-center justify-center rounded-md bg-neutral-800/70" style={{ height: THUMB_H }}>
      <div
        className="bg-no-repeat shadow-md"
        style={{
          width: w,
          height: h,
          backgroundImage: `url(${shotUrl(meta.id)})`,
          backgroundSize: `${meta.width * k}px auto`,
          backgroundPosition: `${-pick.rect.x * k}px ${-pick.rect.y * k}px`,
        }}
      />
    </div>
  );
}

type Props = {
  project: Project;
  metas: Record<string, CaptureMeta>;
  generating: boolean;
  onChange: (fn: (p: Project) => Project) => void;
  onFocusBoard: (captureId: string) => void;
  onGenerate: () => void;
  tab: "picks" | "palette";
  onTabChange: (t: "picks" | "palette") => void;
  paletteSource: string | null;
  onPaletteSource: (id: string) => void;
};

export function Moodboard({
  project,
  metas,
  generating,
  onChange,
  onFocusBoard,
  onGenerate,
  tab,
  onTabChange,
  paletteSource,
  onPaletteSource,
}: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [handleDown, setHandleDown] = useState(false);

  const updatePick = (id: string, patch: Partial<Pick>) =>
    onChange((p) => ({ ...p, picks: p.picks.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));

  const moveTo = (from: number, to: number) =>
    onChange((p) => {
      if (from === to) return p;
      const picks = [...p.picks];
      const [item] = picks.splice(from, 1);
      picks.splice(to, 0, item);
      return { ...p, picks };
    });

  const remove = (id: string) => onChange((p) => ({ ...p, picks: p.picks.filter((x) => x.id !== id) }));

  const count = project.picks.length;
  const paletteCount = project.palette.colors.length + project.palette.fonts.length;

  return (
    <aside data-tour="moodboard" className="flex h-full w-[348px] shrink-0 flex-col border-l border-neutral-800 bg-neutral-900">
      <div className="px-5 pb-3 pt-4">
        <div className="flex rounded-lg bg-neutral-800 p-0.5 text-sm" role="tablist">
          {(
            [
              ["picks", `Dine valg${count ? ` (${count})` : ""}`],
              ["palette", `Farver og fonte${paletteCount ? ` (${paletteCount})` : ""}`],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              onClick={() => onTabChange(k)}
              className={`flex-1 rounded-md px-2 py-1.5 ${tab === k ? "bg-neutral-600 font-medium text-white" : "text-neutral-400 hover:text-white"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "picks" && (
          <p className="mt-3 text-sm leading-snug text-neutral-400">
            {count === 0
              ? "Klik på de dele af siderne, du kan lide. De dukker op her."
              : "Træk i ⠿ for at ændre rækkefølgen. Den bliver sidens opbygning fra top til bund."}
          </p>
        )}
      </div>

      {tab === "palette" ? (
        <PalettePanel
          project={project}
          metas={metas}
          sourceId={paletteSource}
          onSourceChange={onPaletteSource}
          onChange={onChange}
        />
      ) : (
      <ol className="flex-1 space-y-2.5 overflow-y-auto px-5 pb-4">
        {count === 0 && (
          <li className="rounded-xl border border-dashed border-neutral-700 p-6 text-center text-sm text-neutral-500">
            Fx en menu fra én side, en hero fra en anden og nogle kort fra en tredje.
          </li>
        )}
        {project.picks.map((pick, idx) => {
          const meta = metas[pick.captureId];
          const open = openId === pick.id;
          return (
            <li
              key={pick.id}
              draggable={handleDown}
              onDragStart={(e) => {
                setDragFrom(idx);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (dragFrom === null) return;
                e.preventDefault();
                setDragOver(idx);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragFrom !== null) moveTo(dragFrom, idx);
                setDragFrom(null);
                setDragOver(null);
              }}
              onDragEnd={() => {
                setDragFrom(null);
                setDragOver(null);
                setHandleDown(false);
              }}
              className={`group rounded-xl border bg-neutral-950/60 p-2.5 transition ${
                dragOver === idx && dragFrom !== idx ? "border-sky-500" : "border-neutral-800"
              } ${dragFrom === idx ? "opacity-40" : ""}`}
            >
              <div className="mb-2 flex items-center gap-2 text-sm">
                <span
                  className="cursor-grab select-none px-0.5 text-neutral-600 hover:text-neutral-300 active:cursor-grabbing"
                  onPointerDown={() => setHandleDown(true)}
                  onPointerUp={() => setHandleDown(false)}
                  title="Træk for at flytte"
                >
                  ⠿
                </span>
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-emerald-400 text-xs font-bold text-emerald-950">
                  {idx + 1}
                </span>
                <span className="font-medium text-neutral-100">{pick.role}</span>
                <button
                  className="truncate text-xs text-neutral-500 hover:text-sky-400"
                  onClick={() => onFocusBoard(pick.captureId)}
                  title="Vis på lærredet"
                >
                  {meta?.host ?? "…"}
                </button>
                <button
                  className="ml-auto rounded px-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-red-400"
                  onClick={() => remove(pick.id)}
                  title="Fjern"
                  aria-label="Fjern"
                >
                  ✕
                </button>
              </div>

              <Thumb pick={pick} meta={meta} />

              <input
                value={pick.note}
                onChange={(e) => updatePick(pick.id, { note: e.target.value })}
                placeholder="Skriv en note (valgfrit)"
                className="mt-2 w-full rounded-md bg-neutral-800 px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-500"
              />

              <button
                onClick={() => setOpenId(open ? null : pick.id)}
                className="mt-1.5 text-xs text-neutral-500 hover:text-neutral-300"
              >
                Lån: <span className="text-neutral-300">{borrowLabel(pick.aspects)}</span> {open ? "▴" : "▾"}
              </button>

              {open && (
                <div className="mt-2 space-y-2 rounded-md bg-neutral-900 p-2.5 text-xs text-neutral-300">
                  <div className="flex flex-wrap gap-1">
                    {BORROW.map((b) => {
                      const on = borrowLabel(pick.aspects) === b.label;
                      return (
                        <button
                          key={b.label}
                          onClick={() => updatePick(pick.id, { aspects: b.aspects })}
                          className={`rounded-full px-2.5 py-1 ${
                            on ? "bg-sky-500 text-white" : "bg-neutral-800 text-neutral-400 hover:text-white"
                          }`}
                        >
                          {b.label}
                        </button>
                      );
                    })}
                  </div>
                  <label className="flex items-center gap-2">
                    Det er en
                    <select
                      value={pick.role}
                      onChange={(e) => updatePick(pick.id, { role: e.target.value as Pick["role"] })}
                      className="rounded bg-neutral-800 px-1.5 py-1 text-neutral-100"
                    >
                      {PICK_ROLES.map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      )}

      <div className="space-y-3 border-t border-neutral-800 p-5">
        <label className="block">
          <span className="text-sm font-medium text-neutral-200">Hvad skal siden bruges til?</span>
          <textarea
            value={project.brief}
            onChange={(e) => onChange((p) => ({ ...p, brief: e.target.value }))}
            placeholder="Fx forside for et lille kaffebrænderi i Aarhus"
            rows={2}
            className="mt-1.5 w-full resize-none rounded-md bg-neutral-800 px-2.5 py-2 text-sm text-neutral-100 placeholder:text-neutral-500"
          />
        </label>
        <button
          data-tour="generate"
          onClick={onGenerate}
          disabled={generating || count === 0}
          className="w-full rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
        >
          {generating ? "Laver siden …" : count === 0 ? "Vælg mindst ét element først" : "Lav siden"}
        </button>
        <details className="text-xs text-neutral-500">
          <summary className="cursor-pointer select-none hover:text-neutral-300">Flere indstillinger</summary>
          <div className="mt-2 space-y-2 text-neutral-300">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={project.followOrder}
                onChange={(e) => onChange((p) => ({ ...p, followOrder: e.target.checked }))}
              />
              Byg siden i præcis den rækkefølge, jeg har valgt
            </label>
            <label className="flex items-center gap-2">
              Sprog på siden
              <select
                value={project.language}
                onChange={(e) => onChange((p) => ({ ...p, language: e.target.value as Project["language"] }))}
                className="rounded bg-neutral-800 px-1.5 py-0.5"
              >
                <option value="da">Dansk</option>
                <option value="en">Engelsk</option>
              </select>
            </label>
          </div>
        </details>
      </div>
    </aside>
  );
}
