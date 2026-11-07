"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveAlumniProfile } from "@/app/actions";
import { ADVICE_GROUPS } from "@/lib/constants";
import { Field, FormError } from "@/components/Field";
import { InstitutionFields, type InstitutionOption } from "@/components/InstitutionFields";

export type AlumniInitial = {
  fullName: string;
  /** Used only when signing up: the first institution they join. */
  gradYear: number | "";
  degree: string;
  department: string;
  jobTitle: string;
  organization: string;
  city: string;
  linkedinUrl: string;
  meetingLink: string;
  skills: string[];
  adviceAreas: string[];
  bio: string;
  visible: boolean;
};

export function AlumniProfileForm({
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
    const get = (k: string) => String(f.get(k) ?? "").trim();
    setErr("");
    setSaved(false);
    start(async () => {
      const r = await saveAlumniProfile({
        fullName: get("fullName"),
        join: isNew
          ? {
              institutionId: get("institutionId"),
              gradYear: get("gradYear") === "" ? NaN : Number(get("gradYear")),
              degree: get("degree"),
              department: get("department"),
            }
          : undefined,
        jobTitle: get("jobTitle"),
        organization: get("organization"),
        city: get("city"),
        timezone: tz,
        linkedinUrl: get("linkedinUrl"),
        meetingLink: get("meetingLink"),
        skills: get("skills").split(",").map((s) => s.trim()).filter(Boolean),
        adviceAreas: f.getAll("adviceAreas").map(String) as never,
        bio: get("bio"),
        visible: f.get("visible") === "on",
      });
      if (!r.ok) return setErr(r.error);
      if (isNew) router.push(r.data?.status === "approved" ? "/availability" : "/pending");
      else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  const areas = new Set(initial.adviceAreas);
  const later = (
    <>
      <Field id="meetingLink" label="Your meeting link"
        hint="Only students who book you see this. A personal Zoom or Google Meet room you reuse works best.">
        <input className="input" id="meetingLink" name="meetingLink" type="url" defaultValue={initial.meetingLink}
          placeholder="https://meet.google.com/… or https://zoom.us/j/…" />
      </Field>
      <Field id="skills" label="Skills and expertise" hint="Separate with commas. Matching weighs these most.">
        <input className="input" id="skills" name="skills" defaultValue={initial.skills.join(", ")}
          placeholder="Embedded systems, IoT, product strategy, fundraising" />
      </Field>
      <Field id="city" label="City">
        <input className="input" id="city" name="city" defaultValue={initial.city} placeholder="Bengaluru" />
      </Field>
      <label className="check-chip justify-self-start">
        <input type="checkbox" name="visible" defaultChecked={initial.visible} className="accent-river" />
        Show me to students
      </label>
    </>
  );
  return (
    <form className="panel" onSubmit={submit} noValidate>
      {isNew && (
        <fieldset className="grid gap-3.5 rounded-lg border border-line px-4 py-3">
          <legend className="px-1 text-[0.92rem] font-semibold">Your institution</legend>
          <p className="-mt-1 text-[0.86rem] text-muted">
            Its organizers confirm you're an alumnus. You can add more institutions later from your profile.
          </p>
          <InstitutionFields
            institutions={institutions}
            defaultInstitution={defaultInstitution}
            gradYear={initial.gradYear}
            degree={initial.degree}
            department={initial.department}
          />
        </fieldset>
      )}
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field id="fullName" label="Your name">
          <input className="input" id="fullName" name="fullName" autoComplete="name" defaultValue={initial.fullName} />
        </Field>
        <Field id="jobTitle" label="Current role">
          <input className="input" id="jobTitle" name="jobTitle" defaultValue={initial.jobTitle} placeholder="Senior Director of Product" />
        </Field>
        <Field id="organization" label="Organization">
          <input className="input" id="organization" name="organization" defaultValue={initial.organization} placeholder="Company, lab or startup" />
        </Field>
        <Field id="linkedinUrl" label="LinkedIn (optional)">
          <input className="input" id="linkedinUrl" name="linkedinUrl" type="url" defaultValue={initial.linkedinUrl}
            placeholder="https://www.linkedin.com/in/…" />
        </Field>
      </div>
      <fieldset className="field gap-3">
        <legend className="field-label mb-1">Happy to advise on</legend>
        <span className="hint -mt-1">Pick the areas where you have hands-on experience. Matching weighs these with your skills.</span>
        {ADVICE_GROUPS.map((g) => (
          <div key={g.title} className="grid gap-1.5">
            <p className="label-cap">
              {g.title}
              {g.hint && <span className="ml-2 normal-case tracking-normal font-normal">· {g.hint}</span>}
            </p>
            <div className="flex flex-wrap gap-2">
              {g.areas.map((a) => (
                <label key={a} className="check-chip">
                  <input type="checkbox" name="adviceAreas" value={a} defaultChecked={areas.has(a)} className="accent-river" />
                  {a}
                </label>
              ))}
            </div>
          </div>
        ))}
      </fieldset>
      <Field id="bio" label="About you">
        <textarea className="input" id="bio" name="bio" defaultValue={initial.bio}
          placeholder="Two or three lines on your path since graduating and what you've built." />
      </Field>
      {isNew ? (
        <details className="grid gap-3.5 rounded-lg border border-line px-4 py-3">
          <summary className="cursor-pointer text-[0.92rem] font-semibold">
            Optional for now: meeting link, skills, city
            <span className="block text-[0.84rem] font-normal text-muted">
              {initial.skills.length ? `${initial.skills.length} skills filled in. ` : ""}You'll be asked for the meeting link and skills before you open slots.
            </span>
          </summary>
          <div className="mt-3 grid gap-3.5">{later}</div>
        </details>
      ) : (
        later
      )}
      {err && <FormError message={err} />}
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Saving…" : isNew ? "Save and continue" : "Save profile"}
        </button>
        {saved && <span role="status" className="text-[0.88rem] text-ok">Saved.</span>}
      </div>
    </form>
  );
}
