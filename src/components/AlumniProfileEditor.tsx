"use client";

import { useRef, useState } from "react";
import { AlumniProfileForm, type AlumniInitial } from "@/components/AlumniProfileForm";
import { FormError } from "@/components/Field";
import type { InstitutionOption } from "@/components/InstitutionFields";

type Education = { institution: string; gradYear: number | null; degree: string; department: string };
type Filled = Omit<AlumniInitial, "linkedinUrl" | "meetingLink" | "visible" | "gradYear" | "degree" | "department"> & {
  education: Education[];
  gaps: string[];
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** Which listed institution an education entry refers to, if any. */
function matchInstitution(e: Education, list: InstitutionOption[]) {
  const n = norm(e.institution);
  if (!n) return undefined;
  return list.find((i) => {
    const name = norm(i.name);
    const short = norm(i.short_name ?? "");
    return name === n || n.includes(name) || name.includes(n) || (!!short && (n === short || n.split(" ").includes(short)));
  });
}

type Mode = "about" | "linkedin";

/** What a useful self-description covers, with a sample phrase for each. */
const PROMPTS: { label: string; sample: string; optional?: boolean }[] = [
  { label: "Your college, graduating year and major", sample: "IIT Guwahati, 2005 batch, Mechanical" },
  { label: "Your role and company now, and city", sample: "Product lead at Google, Bengaluru" },
  { label: "What you've built or worked on hands-on", sample: "8 years on Android performance; built UPI payments at a startup" },
  { label: "What students can come to you for", sample: "PM interviews, moving from core to software, MS applications in the US" },
  { label: "Earlier roles, higher studies or startups", sample: "MS at Georgia Tech; co-founded a fintech that was acquired", optional: true },
];

const EXAMPLE =
  "I graduated from IIT Guwahati in 2005 in Mechanical. Then I did an MS in robotics at Georgia Tech and spent six years at " +
  "Bosch on autonomous-driving perception. I'm now a product lead at Google in Bengaluru, working on Android performance. " +
  "I co-founded a small fintech in 2016 that was acquired. Students can ask me about PM interviews, moving from a core " +
  "branch into software, MS applications in the US, and robotics or computer-vision projects.";

const GOOD_LENGTH = 220;

/**
 * Alumni profile with autofill. Mentors either describe themselves in a few
 * lines (typed or dictated on a phone) or upload a resume or LinkedIn's Save-to-PDF
 * export. Claude suggests the fields; the form below is pre-filled for them
 * to review and save.
 */
export function AlumniProfileEditor({
  initial,
  isNew,
  institutions = [],
  defaultInstitution = "",
}: {
  initial: AlumniInitial;
  isNew: boolean;
  institutions?: InstitutionOption[];
  defaultInstitution?: string;
}) {
  const [values, setValues] = useState(initial);
  const [version, setVersion] = useState(0); // remounts the form with new values
  const [mode, setMode] = useState<Mode>("about");
  const [about, setAbout] = useState("");
  const [showExample, setShowExample] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<{ count: number; matched: string; gaps: string[] } | null>(null);
  const [institutionId, setInstitutionId] = useState(defaultInstitution);
  const fileRef = useRef<HTMLInputElement>(null);
  const aboutRef = useRef<HTMLTextAreaElement>(null);

  async function autofill() {
    setErr("");
    const body = new FormData();
    if (mode === "about") {
      if (about.trim().length < 60)
        return setErr("Add a little more: your college, year and major, what you do now, and what students could ask you about.");
      body.set("source", "about");
      body.set("text", about.trim());
    } else {
      const file = fileRef.current?.files?.[0];
      if (!file && text.trim().length < 80)
        return setErr(showPaste ? "Paste your About, Experience and Education sections." : "Choose your resume or LinkedIn PDF first.");
      if (file && file.size > 4 * 1024 * 1024) return setErr("That PDF is over 4 MB. Try a text-only version of your resume, or your LinkedIn Save to PDF export.");
      if (file) body.set("pdf", file);
      if (text.trim()) body.set("text", text.trim());
    }
    setResult(null);
    setBusy(true);
    try {
      const res = await fetch("/api/profile-autofill", { method: "POST", body });
      const data = await res.json().catch(() => ({ error: "Couldn't read that. Try again." }));
      if (!res.ok) return setErr(data.error ?? "Couldn't read that. Try again.");
      const f = data as Filled;
      // Prefer the degree from an institution on the platform (the invited one first).
      const preferred = institutions.find((i) => i.id === institutionId);
      const withInst = f.education.map((e) => ({ e, inst: matchInstitution(e, institutions) }));
      const pick =
        withInst.find((x) => preferred && x.inst?.id === preferred.id) ??
        withInst.find((x) => x.inst) ??
        withInst[0];
      if (pick?.inst && !institutionId) setInstitutionId(pick.inst.id);
      // Keep anything the person already typed where the text had nothing.
      const next: AlumniInitial = {
        ...values,
        fullName: f.fullName || values.fullName,
        gradYear: pick?.e.gradYear ?? values.gradYear,
        degree: pick?.e.degree || values.degree,
        department: pick?.e.department || values.department,
        jobTitle: f.jobTitle || values.jobTitle,
        organization: f.organization || values.organization,
        city: f.city || values.city,
        skills: f.skills.length ? f.skills : values.skills,
        adviceAreas: f.adviceAreas.length ? f.adviceAreas : values.adviceAreas,
        bio: f.bio || values.bio,
      };
      const count = [f.fullName, pick?.e.gradYear, f.jobTitle, f.organization, f.city, f.bio].filter(Boolean).length +
        (f.skills.length ? 1 : 0) + (f.adviceAreas.length ? 1 : 0);
      setValues(next);
      setVersion((n) => n + 1);
      setResult({ count, matched: pick?.inst?.id ?? "", gaps: f.gaps ?? [] });
    } catch {
      setErr("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const len = about.trim().length;
  const tab = (m: Mode, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === m}
      onClick={() => { setMode(m); setErr(""); }}
      className={`rounded-full px-4 py-1 text-[0.86rem] ${mode === m ? "bg-surface font-semibold text-ink" : "text-muted"}`}
    >
      {label}
    </button>
  );

  return (
    <>
      <section className="panel border-river/40" aria-labelledby="autofill-h">
        <div className="grid gap-1">
          <h2 id="autofill-h" className="text-lg font-bold">Fill your profile in one go</h2>
          <p className="text-[0.9rem] text-muted">We'll fill in the form below for you to check.</p>
        </div>

        <div className="inline-flex justify-self-start rounded-full border border-line bg-sunk p-0.5" role="tablist" aria-label="Fill from">
          {tab("about", "Describe yourself")}
          {tab("linkedin", "Upload resume")}
        </div>

        {mode === "about" ? (
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <p className="text-[0.92rem]">
                Write or dictate a few lines. Cover these, in any order, and be specific: students are matched to you
                on the details.
              </p>
              <ol className="grid gap-1.5 text-[0.9rem]">
                {PROMPTS.map((p, i) => (
                  <li key={p.label} className="grid grid-cols-[1.4rem_1fr] gap-x-1">
                    <span className="tabular text-muted">{i + 1}.</span>
                    <span>
                      <b className="font-semibold">{p.label}</b>
                      {p.optional && <span className="text-muted"> (optional)</span>}
                      <span className="block text-[0.84rem] text-muted">e.g. “{p.sample}”</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="field">
              <label htmlFor="about-text" className="field-label">About you</label>
              <textarea
                id="about-text"
                ref={aboutRef}
                className="input min-h-[160px]"
                value={about}
                onChange={(e) => setAbout(e.target.value)}
                placeholder="I graduated from ___ in 20__ in ___. I now work as … at … in …. I've built … . Students can ask me about …"
              />
              <span className="hint flex flex-wrap justify-between gap-2">
                <span>On a phone, tap the microphone on your keyboard and just talk.</span>
                <span className={len >= GOOD_LENGTH ? "text-ok" : ""}>
                  {len === 0 ? "" : len < 60 ? "Keep going" : len < GOOD_LENGTH ? "Good start: a bit more detail helps" : "Good detail"}
                </span>
              </span>
            </div>

            {showExample ? (
              <div className="grid gap-1.5 rounded-lg bg-sunk px-4 py-3 text-[0.88rem]">
                <p className="label-cap">Example</p>
                <p>{EXAMPLE}</p>
                <button type="button" className="linkbtn justify-self-start text-[0.84rem]" onClick={() => setShowExample(false)}>
                  Hide example
                </button>
              </div>
            ) : (
              <button type="button" className="linkbtn justify-self-start text-[0.86rem]" onClick={() => setShowExample(true)}>
                See an example
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-3">
            <p className="text-[0.9rem] text-muted">
              Upload your resume as a PDF; a recent one works best. Or use your LinkedIn profile: click{" "}
              <b className="text-ink">Resources</b> (or <b className="text-ink">More</b>) → <b className="text-ink">Save to PDF</b>, then upload that file here.
            </p>
            <div className="field max-w-md">
              <label htmlFor="li-pdf" className="field-label">Resume or LinkedIn PDF</label>
              <input id="li-pdf" ref={fileRef} type="file" accept="application/pdf,.pdf"
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
                className="input file:mr-3 file:rounded-md file:border-0 file:bg-river-soft file:px-3 file:py-1 file:text-[0.84rem] file:font-semibold file:text-river" />
              {fileName && <span className="hint">{fileName}</span>}
            </div>
            {showPaste ? (
              <div className="field">
                <label htmlFor="li-text" className="field-label">Or paste your profile</label>
                <textarea id="li-text" className="input min-h-[140px]" value={text} onChange={(e) => setText(e.target.value)}
                  placeholder="Paste your resume, or your About, Experience and Education sections from LinkedIn." />
              </div>
            ) : (
              <button type="button" className="linkbtn justify-self-start text-[0.86rem]" onClick={() => setShowPaste(true)}>
                Can't get the PDF? Paste your profile text instead
              </button>
            )}
          </div>
        )}

        {err && <FormError message={err} />}
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn" type="button" disabled={busy} onClick={autofill}>
            {busy ? "Filling in…" : result ? "Fill again" : "Fill my profile"}
          </button>
          {busy && <span className="text-[0.84rem] text-muted">This takes about 10–20 seconds.</span>}
        </div>

        {result && (
          <div role="status" className={`grid gap-2 rounded-lg px-4 py-3 text-[0.92rem] ${result.count > 0 && (result.matched || !isNew) ? "bg-ok-soft" : "bg-amber-soft"}`}>
            <p>
              {result.count > 0
                ? "Done. Check the details below, then save."
                : "We couldn't find much there. Add more detail and fill again, or fill in the form below directly."}
              {isNew && !result.matched && result.count > 0 && <> Choose your institution below and check your graduating year, degree and major.</>}
            </p>
            {result.gaps.length > 0 && (
              <div className="grid gap-1">
                <p className="font-semibold">For better matches, you could add:</p>
                <ul className="grid list-disc gap-0.5 pl-5">
                  {result.gaps.map((g) => <li key={g}>{g}</li>)}
                </ul>
                {mode === "about" && (
                  <button type="button" className="linkbtn justify-self-start text-[0.86rem]"
                    onClick={() => { aboutRef.current?.focus(); aboutRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }); }}>
                    Add to my description, then fill again
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      <AlumniProfileForm key={version} isNew={isNew} initial={values} institutions={institutions} defaultInstitution={institutionId} />
    </>
  );
}
