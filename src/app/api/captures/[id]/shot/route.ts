import { isValidId, readCaptureShot } from "@/lib/store";

export async function GET(_request: Request, ctx: RouteContext<"/api/captures/[id]/shot">) {
  const { id } = await ctx.params;
  if (!isValidId(id)) return new Response("Ugyldigt id", { status: 400 });
  const shot = await readCaptureShot(id);
  if (!shot) return new Response("Findes ikke", { status: 404 });
  return new Response(new Uint8Array(shot), {
    headers: {
      "Content-Type": "image/jpeg",
      // Et screenshot ændrer sig aldrig – id'et er nyt for hver hentning.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
