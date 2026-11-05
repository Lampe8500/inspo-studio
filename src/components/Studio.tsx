"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, type CanvasHandle } from "./Canvas";
import { Moodboard } from "./Moodboard";
import { Preview } from "./Preview";
import { cleanHtml, cropToBase64, defaultPickRole, uid } from "@/lib/client";
import {
  emptyProject,
  type CaptureMeta,
  type CapturedElement,
  type GenerateEvent,
  type GenerateRequest,
  type Project,
} from "@/lib/types";

const BOARD_GAP = 240;

export function Studio() {
  const [project, setProject] = useState<Project>(emptyProject);
  const [loaded, setLoaded] = useState(false);
  const [metas, setMetas] = useState<Record<string, CaptureMeta>>({});
  const [loadingUrls, setLoadingUrls] = useState<string[]>([]);
  const [url, setUrl] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [tab, setTab] = useState<"canvas" | "preview">("canvas");
  const [generating, setGenerating] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [genError, setGenError] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const canvasRef = useRef<CanvasHandle>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Hent gemt projekt + metadata for siderne på lærredet.
  useEffect(() => {
    (async () => {
      const p = (await fetch("/api/project").then((r) => r.json())) as Project;
      const entries = await Promise.all(
        p.boards.map(async (b) => {
          const r = await fetch(`/api/captures/${b.captureId}`);
          return r.ok ? ((await r.json()) as CaptureMeta) : null;
        }),
      );
      const m: Record<string, CaptureMeta> = {};
      for (const e of entries) if (e) m[e.id] = e;
      setMetas(m);
      setProject({
        ...p,
        boards: p.boards.filter((b) => m[b.captureId]),
        picks: p.picks.filter((x) => m[x.captureId]),
      });
      setLoaded(true);
      setTimeout(() => canvasRef.current?.fit(), 50);
    })().catch(() => setLoaded(true));
  }, []);

  // Gem projektet (lidt forsinket, så vi ikke gemmer for hvert tastetryk).
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      fetch("/api/project", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(project),
      }).catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [project, loaded]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const update = useCallback((fn: (p: Project) => Project) => setProject(fn), []);

  const addOne = async (target: string) => {
    setLoadingUrls((l) => [...l, target]);
    try {
      const r = await fetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: target }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Ukendt fejl");
      const meta = data as CaptureMeta;
      setMetas((m) => ({ ...m, [meta.id]: meta }));
      setProject((p) => {
        const right = p.boards.reduce((acc, b) => Math.max(acc, b.x + 1440 + BOARD_GAP), 0);
        return { ...p, boards: [...p.boards, { captureId: meta.id, x: right, y: 0 }] };
      });
      setTimeout(() => canvasRef.current?.fit(), 50);
    } catch (err) {
      setToast(`${target}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoadingUrls((l) => l.filter((x) => x !== target));
    }
  };

  /** Tager ét eller flere links (adskilt af mellemrum, komma eller linjeskift). */
  const addSites = (raw: string) => {
    const links = raw.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
    if (links.length === 0) return;
    setUrl("");
    setTab("canvas");
    links.forEach((l) => void addOne(l));
  };

  const togglePick = useCallback((meta: CaptureMeta, el: CapturedElement) => {
    setProject((p) => {
      const existing = p.picks.find((x) => x.captureId === meta.id && x.elementIndex === el.i);
      if (existing) return { ...p, picks: p.picks.filter((x) => x.id !== existing.id) };
      return {
        ...p,
        picks: [
          ...p.picks,
          {
            id: uid(),
            captureId: meta.id,
            elementIndex: el.i,
            rect: el.rect,
            role: defaultPickRole(el),
            aspects: ["layout", "farver", "typografi"],
            note: "",
          },
        ],
      };
    });
  }, []);

  const pickNumbers = useMemo(() => new Map(project.picks.map((p, i) => [p.id, i + 1])), [project.picks]);

  const buildRequest = async (refine?: GenerateRequest["refine"]): Promise<GenerateRequest> => {
    const picks = await Promise.all(
      project.picks.map(async (p) => {
        const meta = metas[p.captureId];
        const el = meta.elements[p.elementIndex];
        return {
          role: p.role,
          aspects: p.aspects,
          note: p.note,
          host: meta.host,
          tag: el.tag,
          text: el.text,
          children: el.children,
          styles: el.styles,
          size: { w: p.rect.w, h: p.rect.h },
          image: await cropToBase64(p.captureId, p.rect),
        };
      }),
    );
    const usedIds = [...new Set(project.picks.map((p) => p.captureId))];
    return {
      brief: project.brief,
      language: project.language,
      followOrder: project.followOrder,
      picks,
      sites: usedIds.map((id) => ({ host: metas[id].host, colors: metas[id].colors, fonts: metas[id].fonts })),
      refine,
    };
  };

  const generate = async (refine?: { html: string; instruction: string }) => {
    if (project.picks.length === 0) return;
    setTab("preview");
    setGenerating(true);
    setGenError(null);
    setStreamText("");
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let text = "";
    let failed: string | null = null;
    try {
      const body = await buildRequest(refine);
      const r = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!r.ok || !r.body) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.error || `Fejl ${r.status}`);
      }
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let done = false;
      while (!done) {
        const chunk = await reader.read();
        done = chunk.done;
        buf += decoder.decode(chunk.value ?? new Uint8Array(), { stream: !done });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as GenerateEvent;
          if (ev.t === "delta") {
            text += ev.v;
            setStreamText(text);
          } else if (ev.t === "error") {
            failed = ev.message;
          } else if (ev.t === "done" && ev.stop === "max_tokens") {
            failed = "Siden blev for lang og blev skåret af. Prøv med færre elementer.";
          }
        }
      }
    } catch (err) {
      failed = ctrl.signal.aborted ? "Stoppet." : err instanceof Error ? err.message : String(err);
    } finally {
      abortRef.current = null;
      setGenerating(false);
    }

    const html = cleanHtml(text);
    if (html.includes("</html>") || (html.length > 500 && !failed)) {
      const version = {
        id: uid(),
        createdAt: new Date().toISOString(),
        instruction: refine?.instruction ?? "",
        html,
      };
      setProject((p) => ({ ...p, versions: [...p.versions, version] }));
      setCurrentVersion(version.id);
    }
    if (failed) setGenError(failed);
  };

  const currentHtml = () => {
    const v = project.versions.find((x) => x.id === currentVersion) ?? project.versions[project.versions.length - 1];
    return v?.html ?? "";
  };

  const steps = [
    {
      label: "Tilføj sider",
      done: project.boards.length > 0,
      active: tab === "canvas" && project.boards.length === 0,
      onClick: () => setTab("canvas"),
    },
    {
      label: "Vælg det, du kan lide",
      done: project.picks.length > 0,
      active: tab === "canvas" && project.boards.length > 0,
      onClick: () => setTab("canvas"),
    },
    {
      label: "Se din side",
      done: project.versions.length > 0,
      active: tab === "preview",
      onClick: () => setTab("preview"),
    },
  ];

  const removeBoard = (id: string) => {
    const n = project.picks.filter((x) => x.captureId === id).length;
    if (n > 0 && !window.confirm(`Fjerne siden? ${n} valgt${n === 1 ? "" : "e"} element${n === 1 ? "" : "er"} fra den forsvinder også.`)) return;
    setProject((p) => ({
      ...p,
      boards: p.boards.filter((b) => b.captureId !== id),
      picks: p.picks.filter((x) => x.captureId !== id),
    }));
  };

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
      <header className="flex items-center gap-6 border-b border-neutral-800 bg-neutral-900 px-5 py-3">
        <span className="text-sm font-bold tracking-tight">
          inspo<span className="text-sky-400">studio</span>
        </span>
        <nav className="flex items-center gap-1 text-sm" aria-label="Trin">
          {steps.map((st, i) => (
            <div key={st.label} className="flex items-center gap-1">
              {i > 0 && <span className="px-1 text-neutral-700">→</span>}
              <button
                onClick={st.onClick}
                className={`flex items-center gap-2 rounded-full px-3 py-1.5 ${
                  st.active ? "bg-neutral-700 text-white" : "text-neutral-400 hover:text-white"
                }`}
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
                    st.done ? "bg-emerald-400 text-emerald-950" : "bg-neutral-800 text-neutral-400"
                  }`}
                >
                  {st.done ? "✓" : i + 1}
                </span>
                {st.label}
              </button>
            </div>
          ))}
        </nav>
        {project.boards.length > 0 && (
          <form
            className="ml-auto flex w-full max-w-sm gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addSites(url);
            }}
          >
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Tilføj endnu en side (link)"
              className="flex-1 rounded-lg bg-neutral-800 px-3 py-1.5 text-sm placeholder:text-neutral-500"
            />
            <button
              disabled={!url.trim()}
              className="rounded-lg bg-neutral-100 px-3 py-1.5 text-sm font-semibold text-neutral-900 hover:bg-white disabled:opacity-40"
            >
              Tilføj
            </button>
          </form>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1">
          <div className={tab === "canvas" ? "h-full" : "hidden"}>
            <Canvas
              ref={canvasRef}
              boards={project.boards}
              metas={metas}
              picks={project.picks}
              pickNumbers={pickNumbers}
              loading={loadingUrls}
              onTogglePick={togglePick}
              onRemoveBoard={removeBoard}
              onMoveBoard={(id, x, y) =>
                setProject((p) => ({ ...p, boards: p.boards.map((b) => (b.captureId === id ? { ...b, x, y } : b)) }))
              }
            />
          </div>
          {tab === "canvas" && loaded && project.boards.length === 0 && loadingUrls.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <form
                className="w-full max-w-xl rounded-2xl border border-neutral-800 bg-neutral-900 p-8 shadow-2xl"
                onSubmit={(e) => {
                  e.preventDefault();
                  addSites(url);
                }}
              >
                <h1 className="text-2xl font-semibold text-white">Hvilke sider kan du lide?</h1>
                <p className="mt-2 leading-relaxed text-neutral-400">
                  Indsæt links til 2-3 sider, du er inspireret af. Bagefter klikker du på de dele, du vil låne, og får
                  lavet én ny side ud fra dem.
                </p>
                <textarea
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addSites(url);
                  }}
                  rows={3}
                  autoFocus
                  placeholder={"stripe.com\nlinear.app\napple.com/dk"}
                  className="mt-5 w-full resize-none rounded-lg bg-neutral-800 px-3.5 py-3 font-mono text-sm text-neutral-100 placeholder:text-neutral-600"
                />
                <p className="mt-1.5 text-xs text-neutral-500">Ét link pr. linje.</p>
                <button
                  disabled={!url.trim()}
                  className="mt-4 w-full rounded-xl bg-sky-500 px-4 py-3 font-semibold text-white hover:bg-sky-400 disabled:bg-neutral-800 disabled:text-neutral-500"
                >
                  Hent siderne
                </button>
              </form>
            </div>
          )}
          {tab === "preview" && (
            <Preview
              versions={project.versions}
              currentId={currentVersion}
              onSelect={setCurrentVersion}
              generating={generating}
              streamText={streamText}
              error={genError}
              onStop={() => abortRef.current?.abort()}
              onRefine={(instruction) => generate({ html: currentHtml(), instruction })}
              pickCount={project.picks.length}
              onGenerate={() => generate()}
            />
          )}
          {toast && (
            <div className="absolute left-1/2 top-4 z-10 max-w-lg -translate-x-1/2 rounded-lg bg-red-950 px-4 py-3 text-sm text-red-200 shadow-lg ring-1 ring-red-800">
              {toast}
            </div>
          )}
        </main>
        {(project.boards.length > 0 || loadingUrls.length > 0) && (
        <Moodboard
          project={project}
          metas={metas}
          generating={generating}
          onChange={update}
          onFocusBoard={(id) => {
            setTab("canvas");
            setTimeout(() => canvasRef.current?.focusBoard(id), 0);
          }}
          onGenerate={() => generate()}
        />
        )}
      </div>
    </div>
  );
}
