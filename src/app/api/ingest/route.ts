import { NextRequest, NextResponse } from "next/server";
import { splitText, ingestChunks, type Source } from "@/lib/rag";

export const runtime = "nodejs";

const ALLOWED_SOURCES: Source[] = ["CUSTOM", "CURATED"];

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const { text, title = "Custom Document", source = "CUSTOM" } = await req.json() as {
        text?: string;
        title?: string;
        source?: Source;
      };
      if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });
      if (!ALLOWED_SOURCES.includes(source)) {
        return NextResponse.json({ error: `source は ${ALLOWED_SOURCES.join("/")} のみ` }, { status: 400 });
      }
      const chunks = splitText(text, title, 600, 60, source);
      await ingestChunks(chunks);
      return NextResponse.json({ chunks: chunks.length, title, source });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });

    const ext = file.name.split(".").pop()?.toLowerCase();
    let text = "";

    if (ext === "pdf") {
      const buffer = Buffer.from(await file.arrayBuffer());
      const pdfParse = (await import("pdf-parse")).default;
      const parsed = await pdfParse(buffer);
      text = parsed.text;
    } else if (ext === "txt" || ext === "md") {
      text = await file.text();
    } else {
      return NextResponse.json({ error: "PDF / TXT / MD のみ対応" }, { status: 400 });
    }

    const title = file.name.replace(/\.[^.]+$/, "");
    const chunks = splitText(text, title);
    await ingestChunks(chunks);
    return NextResponse.json({ filename: file.name, chunks: chunks.length, title });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
