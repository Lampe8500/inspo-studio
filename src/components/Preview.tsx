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
};

export function Preview({ versions, currentId, onSelect, generating, streamText, error, onRefine, onStop }: Props) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
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
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-800 px-4 py-2 text-sm text-neutral-300">
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
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-3 px-6 py-4 text-neutral-300">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
              {streamText.length === 0
                ? "Claude kigger på dine udklip og planlægger designet …"
                : `Skriver siden … ${Math.round(streamText.length / 1000)}k tegn`}
              <button onClick={onStop} className="ml-auto rounded bg-neutral-800 px-3 py-1 text-sm hover:bg-neutral-700">
                Stop
              </button>
            </div>
            <pre className="flex-1 overflow-hidden whitespace-pre-wrap px-6 pb-6 font-mono text-[11px] leading-relaxed text-neutral-500">
              {streamText.slice(-6000)}
            </pre>
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
          <div className="flex h-full items-center justify-center text-neutral-500">
            Ingen side endnu. Vælg elementer på lærredet og tryk “Lav side med AI”.
          </div>
        )}
        {error && (
          <div className="absolute left-1/2 top-4 max-w-lg -translate-x-1/2 rounded-lg bg-red-950 px-4 py-3 text-sm text-red-200 shadow-lg ring-1 ring-red-800">
            {error}
          </div>
        )}
      </div>

      <form
        className="flex gap-2 border-t border-neutral-800 p-3"
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
          placeholder="Ret noget, fx “gør heroen højere og brug den grønne farve til knapper”"
          className="flex-1 rounded-lg bg-neutral-800 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 disabled:opacity-50"
        />
        <button
          disabled={!current || generating || !instruction.trim()}
          className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-400 disabled:opacity-40"
        >
          Ret
        </button>
      </form>
    </div>
  );
}
