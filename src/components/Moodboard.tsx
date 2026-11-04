"use client";

import { PICK_ROLES, shotUrl } from "@/lib/client";
import type { Aspect, CaptureMeta, Pick, Project } from "@/lib/types";

const ASPECTS: { key: Aspect; label: string }[] = [
  { key: "layout", label: "Layout" },
  { key: "farver", label: "Farver" },
  { key: "typografi", label: "Typografi" },
];

const THUMB_W = 288;

function Thumb({ pick, meta }: { pick: Pick; meta?: CaptureMeta }) {
  if (!meta) return <div className="h-20 rounded bg-neutral-800" />;
  const k = THUMB_W / pick.rect.w;
  const h = Math.min(pick.rect.h * k, 200);
  return (
    <div
      className="rounded bg-neutral-800 bg-no-repeat"
      style={{
        width: THUMB_W,
        height: h,
        backgroundImage: `url(${shotUrl(meta.id)})`,
        backgroundSize: `${meta.width * k}px auto`,
        backgroundPosition: `${-pick.rect.x * k}px ${-pick.rect.y * k}px`,
      }}
    />
  );
}

type Props = {
  project: Project;
  metas: Record<string, CaptureMeta>;
  generating: boolean;
  onChange: (fn: (p: Project) => Project) => void;
  onFocusBoard: (captureId: string) => void;
  onGenerate: () => void;
};

export function Moodboard({ project, metas, generating, onChange, onFocusBoard, onGenerate }: Props) {
  const updatePick = (id: string, patch: Partial<Pick>) =>
    onChange((p) => ({ ...p, picks: p.picks.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));

  const move = (idx: number, dir: -1 | 1) =>
    onChange((p) => {
      const picks = [...p.picks];
      const j = idx + dir;
      if (j < 0 || j >= picks.length) return p;
      [picks[idx], picks[j]] = [picks[j], picks[idx]];
      return { ...p, picks };
    });

  const remove = (id: string) => onChange((p) => ({ ...p, picks: p.picks.filter((x) => x.id !== id) }));

  return (
    <aside className="flex h-full w-[340px] shrink-0 flex-col border-l border-neutral-800 bg-neutral-900">
      <div className="border-b border-neutral-800 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">Moodboard</h2>
        <p className="mt-1 text-xs text-neutral-500">
          {project.picks.length === 0
            ? "Klik på elementer på lærredet for at samle dem her."
            : `${project.picks.length} valgt. Rækkefølgen bliver sidens opbygning.`}
        </p>
      </div>

      <ol className="flex-1 space-y-3 overflow-y-auto p-4">
        {project.picks.map((pick, idx) => {
          const meta = metas[pick.captureId];
          return (
            <li key={pick.id} className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-2.5">
              <div className="mb-2 flex items-center gap-2 text-xs">
                <span className="flex h-5 w-5 items-center justify-center rounded bg-emerald-400 font-bold text-emerald-950">
                  {idx + 1}
                </span>
                <select
                  value={pick.role}
                  onChange={(e) => updatePick(pick.id, { role: e.target.value as Pick["role"] })}
                  className="rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-100"
                >
                  {PICK_ROLES.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
                <button
                  className="truncate text-neutral-500 hover:text-sky-400"
                  onClick={() => onFocusBoard(pick.captureId)}
                  title="Vis siden på lærredet"
                >
                  {meta?.host ?? "…"}
                </button>
                <span className="ml-auto flex shrink-0 gap-0.5 text-neutral-500">
                  <button className="px-1 hover:text-white disabled:opacity-30" disabled={idx === 0} onClick={() => move(idx, -1)} title="Flyt op">
                    ↑
                  </button>
                  <button
                    className="px-1 hover:text-white disabled:opacity-30"
                    disabled={idx === project.picks.length - 1}
                    onClick={() => move(idx, 1)}
                    title="Flyt ned"
                  >
                    ↓
                  </button>
                  <button className="px-1 hover:text-red-400" onClick={() => remove(pick.id)} title="Fjern">
                    ✕
                  </button>
                </span>
              </div>
              <Thumb pick={pick} meta={meta} />
              <div className="mt-2 flex gap-1">
                {ASPECTS.map((a) => {
                  const on = pick.aspects.includes(a.key);
                  return (
                    <button
                      key={a.key}
                      onClick={() =>
                        updatePick(pick.id, {
                          aspects: on ? pick.aspects.filter((x) => x !== a.key) : [...pick.aspects, a.key],
                        })
                      }
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        on ? "bg-sky-500/20 text-sky-300 ring-1 ring-sky-500/50" : "bg-neutral-800 text-neutral-500"
                      }`}
                    >
                      {a.label}
                    </button>
                  );
                })}
              </div>
              <textarea
                value={pick.note}
                onChange={(e) => updatePick(pick.id, { note: e.target.value })}
                placeholder="Note, fx “denne hero, men mørkere”"
                rows={2}
                className="mt-2 w-full resize-none rounded bg-neutral-800 px-2 py-1.5 text-xs text-neutral-100 placeholder:text-neutral-500"
              />
            </li>
          );
        })}
      </ol>

      <div className="space-y-3 border-t border-neutral-800 p-4">
        <textarea
          value={project.brief}
          onChange={(e) => onChange((p) => ({ ...p, brief: e.target.value }))}
          placeholder="Hvad er siden til? Fx “Forside for et lille kaffebrænderi i Aarhus, der sælger abonnementer”"
          rows={3}
          className="w-full resize-none rounded bg-neutral-800 px-2.5 py-2 text-sm text-neutral-100 placeholder:text-neutral-500"
        />
        <div className="flex items-center gap-3 text-xs text-neutral-300">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={project.followOrder}
              onChange={(e) => onChange((p) => ({ ...p, followOrder: e.target.checked }))}
            />
            Følg min rækkefølge
          </label>
          <select
            value={project.language}
            onChange={(e) => onChange((p) => ({ ...p, language: e.target.value as Project["language"] }))}
            className="ml-auto rounded bg-neutral-800 px-1.5 py-0.5"
          >
            <option value="da">Dansk</option>
            <option value="en">English</option>
          </select>
        </div>
        <button
          onClick={onGenerate}
          disabled={generating || project.picks.length === 0}
          className="w-full rounded-lg bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {generating ? "Laver siden …" : "Lav side med AI"}
        </button>
      </div>
    </aside>
  );
}
