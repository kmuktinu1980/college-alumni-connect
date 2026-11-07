"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveStudentProfile } from "@/app/actions";
import { DEGREES, YEARS } from "@/lib/constants";
import { Field, FormError } from "@/components/Field";
import type { InstitutionOption } from "@/components/InstitutionFields";

export type StudentInitial = {
  institutionId: string;
  fullName: string;
  program: string;
  department: string;
  year: string;
  projectTitle: string;
  projectSummary: string;
  seeking: string;
};

export function StudentProfileForm({
  initial,
  isNew,
  institutions,
}: {
  initial: StudentInitial;
  isNew: boolean;
  /** Institutions this student's email qualifies for. */
  institutions: InstitutionOption[];
}) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);
  const [tz, setTz] = useState("UTC");
  const [pending, start] = useTransition();

  useEffect(() => {
    try {
      setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    } catch {}
  }, []);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "");
    setErr("");
    setSaved(false);
    start(async () => {
      const r = await saveStudentProfile({
        institutionId: get("institutionId"),
        fullName: get("fullName"),
        program: get("program"),
        department: get("department"),
        year: get("year") as never,
        timezone: tz,
        projectTitle: get("projectTitle"),
        projectSummary: get("projectSummary"),
        seeking: get("seeking"),
      });
      if (!r.ok) return setErr(r.error);
      if (isNew) router.push("/find");
      else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  const single = institutions.length === 1;
  return (
    <form className="panel" onSubmit={submit} noValidate>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field id="institutionId" label="Institution">
            {single ? (
              <>
                <input type="hidden" name="institutionId" value={institutions[0].id} />
                <p id="institutionId" className="input bg-sunk">{institutions[0].name}</p>
              </>
            ) : (
              <select className="input" id="institutionId" name="institutionId" defaultValue={initial.institutionId}>
                <option value="">Choose…</option>
                {institutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            )}
          </Field>
        </div>
        <Field id="fullName" label="Your name">
          <input className="input" id="fullName" name="fullName" autoComplete="name" defaultValue={initial.fullName} required />
        </Field>
        <Field id="year" label="Year">
          <select className="input" id="year" name="year" defaultValue={initial.year}>
            <option value="">Choose…</option>
            {YEARS.map((y) => <option key={y}>{y}</option>)}
          </select>
        </Field>
        <Field id="program" label="Program">
          <input className="input" id="program" name="program" list="program-options" defaultValue={initial.program} placeholder="B.Tech / B.E." />
          <datalist id="program-options">
            {DEGREES.map((d) => <option key={d} value={d} />)}
          </datalist>
        </Field>
        <Field id="department" label="Department or major">
          <input className="input" id="department" name="department" defaultValue={initial.department} placeholder="Computer Science" />
        </Field>
      </div>
      <Field id="projectTitle" label="Project title">
        <input className="input" id="projectTitle" name="projectTitle" defaultValue={initial.projectTitle}
          placeholder="e.g. Low-cost flood sensor for river communities" />
      </Field>
      <Field id="projectSummary" label="Project summary">
        <textarea className="input" id="projectSummary" name="projectSummary" defaultValue={initial.projectSummary}
          placeholder="What you're building, the stack or method, and where you are now." />
      </Field>
      <Field id="seeking" label="What advice are you looking for?" hint="Matching reads this, so be specific.">
        <textarea className="input" id="seeking" name="seeking" defaultValue={initial.seeking}
          placeholder="e.g. How to validate the sensor design, and whether to take this toward a startup or a paper." />
      </Field>
      {err && <FormError message={err} />}
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Saving…" : isNew ? "Create student profile" : "Save profile"}
        </button>
        {saved && <span role="status" className="text-[0.88rem] text-ok">Saved.</span>}
      </div>
    </form>
  );
}
