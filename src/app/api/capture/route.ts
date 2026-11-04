import { capturePage } from "@/lib/capture";
import { saveCapture } from "@/lib/store";

export const maxDuration = 120;

export async function POST(request: Request) {
  let url = "";
  try {
    const body = (await request.json()) as { url?: string };
    url = (body.url || "").trim();
  } catch {
    return Response.json({ error: "Mangler et link" }, { status: 400 });
  }
  if (!url) return Response.json({ error: "Mangler et link" }, { status: 400 });

  try {
    const { meta, shot } = await capturePage(url);
    await saveCapture(meta, shot);
    return Response.json(meta);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[capture]", url, message);
    return Response.json(
      { error: `Kunne ikke hente siden: ${message.split("\n")[0]}` },
      { status: 502 },
    );
  }
}
