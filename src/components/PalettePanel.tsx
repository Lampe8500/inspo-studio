"use client";

import { useEffect, useMemo, useState } from "react";
import { uid } from "@/lib/client";
import { extractPalette, loadFontPreview, paletteAsCss, readableOn } from "@/lib/palette";
import type { CaptureMeta, Project } from "@/lib/types";

type Props = {
  project: Project;
  metas: Record<string, CaptureMeta>;
  sourceId: string | null;
  onSourceChange: (id: string) => void;
  onChange: (fn: (p: Project) => Project) => void;
};

export function PalettePanel({ project, metas, sourceId, onSourceChange, onChange }: Props) {
  const [copied, setCopied] = useState<string | null>(null);
  const boards = project.boards.filter((b) => metas[b.captureId]);
  const source = metas[sourceId ?? ""] ?? metas[boards[0]?.captureId ?? ""];
  const found = useMemo(() => (source ? extractPalette(source) : null), [source]);
  const saved = project.palette;

  useEffect(() => {
    found?.fonts.forEach((f) => loadFontPreview(f.family));
    saved.fonts.forEach((f) => loadFontPreview(f.family));
  }, [found, saved.fonts]);

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ingen adgang til udklipsholder – vis alligevel værdien
    }
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1400);
  };

  const hasColor = (hex: string) => saved.colors.some((c) => c.hex === hex);
  const hasFont = (family: string, role: string) => saved.fonts.some((f) => f.family === family && f.role === role);

  const toggleColor = (hex: string, role: string) =>
    onChange((p) => ({
      ...p,
      palette: {
        ...p.palette,
        colors: p.palette.colors.some((c) => c.hex === hex)
          ? p.palette.colors.filter((c) => c.hex !== hex)
          : [...p.palette.colors, { id: uid(), hex, role, from: source?.host ?? "" }],
      },
    }));

  const toggleFont = (f: { family: string; role: string; size: string; weight: string }) =>
    onChange((p) => ({
      ...p,
      palette: {
        ...p.palette,
        fonts: p.palette.fonts.some((x) => x.family === f.family && x.role === f.role)
          ? p.palette.fonts.filter((x) => !(x.family === f.family && x.role === f.role))
          : [...p.palette.fonts, { id: uid(), ...f, from: source?.host ?? "" }],
      },
    }));

  const saveAll = () => {
    if (!found || !source) return;
    onChange((p) => {
      const colors = [...p.palette.colors];
      for (const c of found.colors)
        if (!colors.some((x) => x.hex === c.hex)) colors.push({ id: uid(), hex: c.hex, role: c.role, from: source.host });
      const fonts = [...p.palette.fonts];
      for (const f of found.fonts)
        if (!fonts.some((x) => x.family === f.family && x.role === f.role))
          fonts.push({ id: uid(), family: f.family, role: f.role, size: f.size, weight: f.weight, from: source.host });
      return { ...p, palette: { colors, fonts } };
    });
  };

  return (
    <div className="flex-1 space-y-6 overflow-y-auto px-5 pb-6">
      {/* Fra en side */}
      {source && found ? (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <span className="text-sm text-neutral-400">Fra</span>
            <select
              value={source.id}
              onChange={(e) => onSourceChange(e.target.value)}
              className="min-w-0 flex-1 truncate rounded-md bg-neutral-800 px-2 py-1 text-sm text-neutral-100"
            >
              {boards.map((b) => (
                <option key={b.captureId} value={b.captureId}>
                  {metas[b.captureId].host}
                </option>
              ))}
            </select>
            <button onClick={saveAll} className="shrink-0 rounded-md bg-neutral-800 px-2.5 py-1 text-xs text-neutral-200 hover:bg-neutral-700">
              Gem alle
            </button>
          </div>

          <p className="mb-2 text-xs text-neutral-500">Klik på en farve for at kopiere den. Brug + for at gemme den.</p>
          <div className="grid grid-cols-5 gap-2">
            {found.colors.map((c) => {
              const on = hasColor(c.hex);
              return (
                <div key={c.hex} className="group relative">
                  <button
                    onClick={() => copy(c.hex, c.hex)}
                    title={`${c.role} · ${c.hex} – klik for at kopiere`}
                    className="flex aspect-square w-full items-end justify-center rounded-lg pb-1 text-[10px] font-medium ring-1 ring-white/10 transition hover:scale-105"
                    style={{ background: c.hex, color: readableOn(c.hex) }}
                  >
                    {copied === c.hex ? "Kopieret" : c.hex.slice(1)}
                  </button>
                  <button
                    onClick={() => toggleColor(c.hex, c.role)}
                    title={on ? "Fjern fra palette" : "Gem i palette"}
                    aria-label={on ? "Fjern fra palette" : "Gem i palette"}
                    className={`absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold shadow ${
                      on ? "bg-emerald-400 text-emerald-950" : "bg-neutral-100 text-neutral-900 opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    {on ? "✓" : "+"}
                  </button>
                  <div className="mt-1 text-center text-[10px] text-neutral-500">{c.role}</div>
                </div>
              );
            })}
          </div>

          <div className="mt-5 space-y-2">
            {found.fonts.map((f) => {
              const on = hasFont(f.family, f.role);
              return (
                <div key={f.role + f.family} className="flex items-center gap-3 rounded-lg bg-neutral-950/60 p-3 ring-1 ring-neutral-800">
                  <button className="min-w-0 flex-1 text-left" onClick={() => copy(f.family, f.role + f.family)} title="Klik for at kopiere navnet">
                    <div className="truncate text-xl text-white" style={{ fontFamily: f.stack, fontWeight: Number(f.weight) || 400 }}>
                      {copied === f.role + f.family ? "Kopieret" : f.family}
                    </div>
                    <div className="mt-0.5 text-xs text-neutral-500">
                      {f.role} · {Math.round(parseFloat(f.size))}px · vægt {f.weight}
                    </div>
                  </button>
                  <button
                    onClick={() => toggleFont(f)}
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                      on ? "bg-emerald-400 text-emerald-950" : "bg-neutral-800 text-neutral-200 hover:bg-neutral-700"
                    }`}
                  >
                    {on ? "✓ Gemt" : "+ Gem"}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <p className="text-sm text-neutral-500">Hent en side for at se dens farver og fonte.</p>
      )}

      {/* Den gemte palette */}
      <section className="border-t border-neutral-800 pt-5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Din palette</h3>
          {(saved.colors.length > 0 || saved.fonts.length > 0) && (
            <button
              onClick={() => copy(paletteAsCss(saved.colors, saved.fonts), "css")}
              className="text-xs text-sky-400 hover:text-sky-300"
            >
              {copied === "css" ? "Kopieret ✓" : "Kopiér som CSS"}
            </button>
          )}
        </div>
        {saved.colors.length === 0 && saved.fonts.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-700 p-4 text-center text-xs leading-relaxed text-neutral-500">
            Gem de farver og fonte, du vil bruge. De bliver brugt, når siden laves, og du kan blande fra flere sider.
          </p>
        ) : (
          <>
            <div className="flex overflow-hidden rounded-lg ring-1 ring-white/10">
              {saved.colors.map((c) => (
                <button
                  key={c.id}
                  onClick={() => copy(c.hex, "s" + c.id)}
                  title={`${c.role} · ${c.hex} fra ${c.from}`}
                  className="group relative h-14 flex-1"
                  style={{ background: c.hex, color: readableOn(c.hex) }}
                >
                  <span className="text-[10px] font-medium opacity-0 group-hover:opacity-100">
                    {copied === "s" + c.id ? "✓" : c.hex.slice(1)}
                  </span>
                  <span
                    role="button"
                    aria-label="Fjern"
                    onClick={(e) => {
                      e.stopPropagation();
                      onChange((p) => ({ ...p, palette: { ...p.palette, colors: p.palette.colors.filter((x) => x.id !== c.id) } }));
                    }}
                    className="absolute right-0.5 top-0.5 hidden h-4 w-4 items-center justify-center rounded-full bg-black/40 text-[9px] text-white group-hover:flex"
                  >
                    ✕
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-3 space-y-1.5">
              {saved.fonts.map((f) => (
                <div key={f.id} className="group flex items-baseline gap-2">
                  <span className="truncate text-lg text-neutral-100" style={{ fontFamily: `"${f.family}", sans-serif` }}>
                    {f.family}
                  </span>
                  <span className="shrink-0 text-xs text-neutral-500">{f.role}</span>
                  <button
                    onClick={() => onChange((p) => ({ ...p, palette: { ...p.palette, fonts: p.palette.fonts.filter((x) => x.id !== f.id) } }))}
                    className="ml-auto text-xs text-neutral-600 opacity-0 hover:text-red-400 group-hover:opacity-100"
                    aria-label="Fjern"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
