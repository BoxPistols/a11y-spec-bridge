import { NextRequest, NextResponse } from "next/server";
import { splitText, ingestChunks } from "@/lib/rag";
import { isSource, type Source } from "@/lib/sources";
import { authorizeIngest, MAX_INGEST_FILE_BYTES, MAX_INGEST_TEXT_CHARS } from "@/lib/ingestAuth";

export const runtime = "nodejs";

const ALLOWED_SOURCES: readonly Source[] = ["CUSTOM", "CURATED"];

export async function POST(req: NextRequest) {
  // 共有 DB への書き込みなので、トークンか招待コードが無ければ受け付けない
  const auth = authorizeIngest(
    {
      ingestToken: req.headers.get("x-ingest-token"),
      inviteCode: req.headers.get("x-invite-code"),
    },
    { INGEST_TOKEN: process.env.INGEST_TOKEN, INVITE_CODES: process.env.INVITE_CODES },
  );
  if (!auth.allowed) {
    return NextResponse.json(
      { error: "ガイドの追加には招待コードが必要です。設定画面で招待コードを入力してください。" },
      { status: 403 },
    );
  }

  try {
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const { text, title = "Custom Document", source = "CUSTOM" } = await req.json() as {
        text?: unknown;
        title?: unknown;
        source?: unknown;
      };
      if (typeof text !== "string" || !text) return NextResponse.json({ error: "text required" }, { status: 400 });
      if (text.length > MAX_INGEST_TEXT_CHARS) {
        return NextResponse.json({ error: `text は ${MAX_INGEST_TEXT_CHARS.toLocaleString()} 文字以内にしてください` }, { status: 413 });
      }
      if (!isSource(source) || !ALLOWED_SOURCES.includes(source)) {
        return NextResponse.json({ error: `source は ${ALLOWED_SOURCES.join("/")} のみ` }, { status: 400 });
      }
      // CURATED は運営が管理する層なので、管理者トークンでのみ書き込める
      if (source === "CURATED" && auth.by !== "token") {
        return NextResponse.json({ error: "CURATED への書き込みは管理者トークンが必要です" }, { status: 403 });
      }
      const safeTitle = typeof title === "string" && title.trim() ? title.slice(0, 200) : "Custom Document";
      const chunks = splitText(text, safeTitle, 600, 60, source);
      await ingestChunks(chunks);
      return NextResponse.json({ chunks: chunks.length, title: safeTitle, source });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "file required" }, { status: 400 });
    if (file.size > MAX_INGEST_FILE_BYTES) {
      return NextResponse.json({ error: `ファイルは ${MAX_INGEST_FILE_BYTES / 1024 / 1024}MB 以内にしてください` }, { status: 413 });
    }

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

    if (text.length > MAX_INGEST_TEXT_CHARS) {
      return NextResponse.json({ error: `本文は ${MAX_INGEST_TEXT_CHARS.toLocaleString()} 文字以内にしてください` }, { status: 413 });
    }

    const title = file.name.replace(/\.[^.]+$/, "").slice(0, 200);
    const chunks = splitText(text, title);
    await ingestChunks(chunks);
    return NextResponse.json({ filename: file.name, chunks: chunks.length, title });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
