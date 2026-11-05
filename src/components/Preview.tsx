"use client";

import { useState } from "react";
import type { PageVersion } from "@/lib/types";

type Props = {
  versions: PageVersion[];
  currentId: string | null;
  onSelect: (id: string) => void;
  generating: boolean;
  streamText: string;
  error: string | null;
  onRefine: (instruction: string) => void;
  onStop: () => void;
  pickCount: number;
  onGenerate: () => void;
};

export function Preview({
  versions,
  currentId,
  onSelect,
  generating,
  streamText,
  error,
  onRefine,
  onStop,
  pickCount,
  onGenerate,
}: Props) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [showCode, setShowCode] = useState(false);
  const [instruction, setInstruction] = useState("");
  const current = versions.find((v) => v.id === currentId) ?? versions[versions.length - 1];

  const download = () => {
    if (!current) return;
    const blob = new Blob([current.html], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `inspo-side-${versions.indexOf(current) + 1}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const openTab = () => {
    if (!current) return;
    const url = URL.createObjectURL(new Blob([current.html], { type: "text/html" }));
    window.open(url, "_blank", "noopener");
  };

  return (
    <div className="flex h-full flex-col bg-neutral-950">
      <div className={`${versions.length === 0 ? "hidden" : "flex"} flex-wrap items-center gap-2 border-b border-neutral-800 px-4 py-2 text-sm text-neutral-300`}>
        {versions.length > 0 && (
          <select
            value={current?.id}
            onChange={(e) => onSelect(e.target.value)}
            className="rounded bg-neutral-800 px-2 py-1"
          >
            {versions.map((v, i) => (
              <option key={v.id} value={v.id}>
                Version {i + 1}
                {v.instruction ? ` – ${v.instruction.slice(0, 40)}` : ""}
              </option>
            ))}
          </select>
        )}
        <div className="flex rounded bg-neutral-800 p-0.5">
          {(["desktop", "mobile"] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDevice(d)}
              className={`rounded px-2 py-0.5 ${device === d ? "bg-neutral-600 text-white" : ""}`}
            >
              {d === "desktop" ? "Desktop" : "Mobil"}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={openTab} disabled={!current} className="rounded bg-neutral-800 px-3 py-1 hover:bg-neutral-700 disabled:opacity-40">
            Åbn i ny fane
          </button>
          <button onClick={download} disabled={!current} className="rounded bg-neutral-800 px-3 py-1 hover:bg-neutral-700 disabled:opacity-40">
            Download HTML
          </button>
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {generating ? (
          <div className="flex h-full flex-col items-center justify-center gap-5 px-6 text-center">
            <span className="h-10 w-10 animate-spin rounded-full border-[3px] border-sky-400 border-t-transparent" />
            <div>
              <p className="text-lg font-medium text-white">
                {streamText.length === 0 ? "Claude kigger på dine udklip …" : "Claude bygger din side …"}
              </p>
              <p className="mt-1 text-sm text-neutral-400">
                {streamText.length === 0
                  ? "Først samles farver, skrifttyper og afstande til ét design."
                  : "Det tager typisk 1-3 minutter. Du kan godt kigge på lærredet imens."}
              </p>
            </div>
            <div className="flex gap-2 text-sm">
              <button onClick={onStop} className="rounded-lg bg-neutral-800 px-3 py-1.5 text-neutral-200 hover:bg-neutral-700">
                Stop
              </button>
              {streamText.length > 0 && (
                <button
                  onClick={() => setShowCode((v) => !v)}
                  className="rounded-lg px-3 py-1.5 text-neutral-500 hover:text-neutral-200"
                >
                  {showCode ? "Skjul koden" : "Vis koden"}
                </button>
              )}
            </div>
            {showCode && (
              <pre className="max-h-64 w-full max-w-3xl overflow-hidden whitespace-pre-wrap rounded-lg bg-neutral-900 p-4 text-left font-mono text-[11px] leading-relaxed text-neutral-500">
                {streamText.slice(-3000)}
              </pre>
            )}
          </div>
        ) : current ? (
          <div className="flex h-full justify-center overflow-auto bg-neutral-900 p-4">
            <iframe
              key={current.id}
              title="Forhåndsvisning af den genererede side"
              srcDoc={current.html}
              sandbox="allow-scripts"
              className="h-full rounded bg-white shadow-2xl"
              style={{ width: device === "desktop" ? "100%" : 390, maxWidth: 1440 }}
            />
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <p className="text-lg font-medium text-white">Du har ikke lavet en side endnu</p>
            <p className="max-w-sm text-sm text-neutral-400">
              {pickCount === 0
                ? "Gå tilbage til lærredet og klik på de dele af siderne, du kan lide."
                : `Du har valgt ${pickCount} element${pickCount === 1 ? "" : "er"}. Tryk på knappen, så laver Claude siden.`}
            </p>
            {pickCount > 0 && (
              <button onClick={onGenerate} className="rounded-xl bg-sky-500 px-5 py-2.5 font-semibold text-white hover:bg-sky-400">
                Lav siden
              </button>
            )}
          </div>
        )}
        {error && (
          <div className="absolute left-1/2 top-4 max-w-lg -translate-x-1/2 rounded-lg bg-red-950 px-4 py-3 text-sm text-red-200 shadow-lg ring-1 ring-red-800">
            {error}
          </div>
        )}
      </div>

      <form
        className={`${versions.length === 0 ? "hidden" : "flex"} gap-2 border-t border-neutral-800 p-3`}
        onSubmit={(e) => {
          e.preventDefault();
          if (!instruction.trim()) return;
          onRefine(instruction);
          setInstruction("");
        }}
      >
        <input
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          disabled={!current || generating}
          placeholder="Skriv hvad der skal ændres, fx “gør overskriften større og knapperne grønne”"
          className="flex-1 rounded-lg bg-neutral-800 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 disabled:opacity-50"
        />
        <button
          disabled={!current || generating || !instruction.trim()}
          className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-400 disabled:opacity-40"
        >
          Ret siden
        </button>
      </form>
    </div>
  );
}
