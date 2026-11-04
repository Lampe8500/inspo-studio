import { connection } from "next/server";
import { readProject, writeProject } from "@/lib/store";
import type { Project } from "@/lib/types";

export async function GET() {
  // Projektet ændrer sig hele tiden, så ruten må ikke prerenderes.
  await connection();
  return Response.json(await readProject());
}

export async function PUT(request: Request) {
  const project = (await request.json()) as Project;
  if (!Array.isArray(project?.boards) || !Array.isArray(project?.picks)) {
    return Response.json({ error: "Ugyldigt projekt" }, { status: 400 });
  }
  await writeProject(project);
  return Response.json({ ok: true });
}
