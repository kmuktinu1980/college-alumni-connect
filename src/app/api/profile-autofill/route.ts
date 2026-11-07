import { NextResponse } from "next/server";
import { getViewer } from "@/lib/viewer";
import { createAdminClient } from "@/lib/supabase/admin";
import { AutofillError, MAX_PROFILE_TEXT, extractProfile } from "@/lib/profile-autofill";
import { describeClaudeError } from "@/lib/claude-errors";

export const maxDuration = 60;

const PER_DAY = 10;

// POST multipart/form-data with `pdf` (LinkedIn "Save to PDF" file) and/or `text`.
export async function POST(req: Request) {
  const v = await getViewer();
  if (!v) return NextResponse.json({ error: "Sign in again to continue." }, { status: 401 });
  if (v.profile.role === "student")
    return NextResponse.json({ error: "Profile autofill is for alumni." }, { status: 403 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Upload your resume or LinkedIn PDF, or paste your profile text." }, { status: 400 });

  const file = form.get("pdf");
  const text = String(form.get("text") ?? "").trim();
  const about = form.get("source") === "about";
  let pdf: Buffer | undefined;
  if (file && typeof file === "object" && "arrayBuffer" in file && file.size > 0) {
    const name = (file as File).name?.toLowerCase() ?? "";
    if (file.type !== "application/pdf" && !name.endsWith(".pdf"))
      return NextResponse.json({ error: "That file isn't a PDF. Save your resume as a PDF, or paste its text." }, { status: 400 });
    pdf = Buffer.from(await file.arrayBuffer());
    if (pdf.subarray(0, 5).toString() !== "%PDF-")
      return NextResponse.json({ error: "That file isn't a readable PDF." }, { status: 400 });
  }
  if (!pdf && text.length < (about ? 60 : 80))
    return NextResponse.json({
      error: about
        ? "Add a little more: your IITG batch and branch, what you do now, and what students could ask you about."
        : "Upload your resume or LinkedIn PDF, or paste more of your profile (experience and education).",
    }, { status: 400 });
  if (text.length > MAX_PROFILE_TEXT)
    return NextResponse.json({ error: "That's a lot of text. Paste just your About, Experience and Education sections." }, { status: 400 });

  // Light daily limit, logged alongside match searches.
  const admin = createAdminClient();
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await admin
    .from("match_requests")
    .select("id", { count: "exact", head: true })
    .eq("student_id", v.user.id)
    .eq("method", "autofill")
    .gt("created_at", since);
  if ((count ?? 0) >= PER_DAY)
    return NextResponse.json({ error: "You've used autofill several times today. Fill in the form directly, or try again tomorrow." }, { status: 429 });

  try {
    const source = pdf ? "linkedin-pdf" : about ? "about" : "linkedin-text";
    const fields = await extractProfile({ pdf, text: text || undefined, source });
    await admin.from("match_requests").insert({
      student_id: v.user.id,
      query: { source },
      results: { education: fields.education.length, filled: Object.entries(fields).filter(([, x]) => x && (!Array.isArray(x) || x.length)).length },
      method: "autofill",
    });
    return NextResponse.json(fields);
  } catch (e) {
    if (e instanceof AutofillError) return NextResponse.json({ error: e.message }, { status: 400 });
    const { message, setup } = describeClaudeError(e);
    console.error(`autofill failed${setup ? " (setup)" : ""}:`, message, e);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
