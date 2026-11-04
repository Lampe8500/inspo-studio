import { isValidId, readCaptureMeta } from "@/lib/store";

export async function GET(_request: Request, ctx: RouteContext<"/api/captures/[id]">) {
  const { id } = await ctx.params;
  if (!isValidId(id)) return Response.json({ error: "Ugyldigt id" }, { status: 400 });
  const meta = await readCaptureMeta(id);
  if (!meta) return Response.json({ error: "Findes ikke" }, { status: 404 });
  return Response.json(meta);
}
