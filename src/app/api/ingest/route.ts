import { NextRequest, NextResponse } from "next/server";
import { splitText, ingestChunks } from "@/lib/rag";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const { text, title = "Custom Document" } = await req.json();
      if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });
      const chunks = splitText(text, title);
      await ingestChunks(chunks);
      return NextResponse.json({ chunks: chunks.length, title });
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
