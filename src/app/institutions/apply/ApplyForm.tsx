"use client";

import { useState, useTransition } from "react";
import { applyInstitution } from "@/app/actions";
import { Field, FormError } from "@/components/Field";

export function ApplyForm({ email }: { email: string }) {
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  const [pending, start] = useTransition();
  const domain = email.split("@")[1] ?? "";

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "");
    setErr("");
    start(async () => {
      const r = await applyInstitution({
        name: get("name"),
        shortName: get("shortName"),
        city: get("city"),
        country: get("country"),
        website: get("website"),
        domains: get("domains"),
        role: get("role"),
        note: get("note"),
      });
      if (!r.ok) return setErr(r.error);
      setDone(get("name"));
    });
  }

  if (done)
    return (
      <div className="panel bg-ok-soft">
        <h2 className="text-lg font-bold">Application sent</h2>
        <p>
          Thanks. We&apos;ll review <b>{done}</b>, usually within a couple of days, and email you at{" "}
          <span className="font-mono">{email}</span>. Once it&apos;s approved, you&apos;ll get an organizer page for it.
        </p>
      </div>
    );

  return (
    <form className="panel" onSubmit={submit} noValidate>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field id="name" label="Institution's full name">
            <input className="input" id="name" name="name" placeholder="Indian Institute of Technology Guwahati" />
          </Field>
        </div>
        <Field id="shortName" label="Short name (optional)" hint="Used in the page address, e.g. /i/iitg">
          <input className="input" id="shortName" name="shortName" placeholder="IITG" />
        </Field>
        <Field id="website" label="Website">
          <input className="input" id="website" name="website" type="url" placeholder="https://www.iitg.ac.in" />
        </Field>
        <Field id="city" label="City">
          <input className="input" id="city" name="city" placeholder="Guwahati" />
        </Field>
        <Field id="country" label="Country">
          <input className="input" id="country" name="country" placeholder="India" />
        </Field>
        <div className="sm:col-span-2">
          <Field id="domains" label="Student email domains"
            hint="Students sign in with an address at one of these. Separate several with commas. Subdomains (e.g. cse.college.edu) are included.">
            <input className="input font-mono" id="domains" name="domains" placeholder="iitg.ac.in" defaultValue={/\.(edu|ac\.[a-z]{2}|edu\.[a-z]{2})$/.test(domain) ? domain : ""} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field id="role" label="Your role at the institution" hint="For example: placement officer, alumni relations, faculty advisor, alumni association lead.">
            <input className="input" id="role" name="role" />
          </Field>
        </div>
      </div>
      <Field id="note" label="Anything else we should know (optional)">
        <textarea className="input" id="note" name="note" placeholder="How you plan to invite alumni, who else will help run it, and so on." />
      </Field>
      {err && <FormError message={err} />}
      <button className="btn justify-self-start" type="submit" disabled={pending}>
        {pending ? "Sending…" : "Apply"}
      </button>
    </form>
  );
}
