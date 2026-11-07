"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  orgAddOrganizer, orgAllowStudentEmails, orgRemoveOrganizer, orgRemoveStudentEmail, orgUpdateInstitution,
} from "@/app/actions";
import { Field, FormError } from "@/components/Field";

type Inst = { id: string; name: string; short_name: string; city: string; country: string; website: string; student_domains: string[] };
export type OrganizerRow = { user_id: string; name: string; email: string };
export type AllowRow = { email: string; note: string; joined: boolean };

function useRun() {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok?: string, after?: () => void) =>
    start(async () => {
      setErr("");
      setMsg("");
      const r = await fn();
      if (!r.ok) return setErr(r.error ?? "Something went wrong.");
      if (ok) setMsg(ok);
      after?.();
      router.refresh();
    });
  return { err, msg, busy, run };
}

/** Institution details, including the student email domains. */
export function InstitutionDetails({ inst }: { inst: Inst }) {
  const { err, msg, busy, run } = useRun();
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "");
    run(() => orgUpdateInstitution(inst.id, {
      name: get("name"), shortName: get("shortName"), city: get("city"), country: get("country"),
      website: get("website"), domains: get("domains"),
    }), "Saved.");
  }
  return (
    <form className="panel" onSubmit={submit} noValidate>
      <h3 className="font-bold">Institution details</h3>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <div className="sm:col-span-2"><Field id="name" label="Full name"><input className="input" id="name" name="name" defaultValue={inst.name} /></Field></div>
        <Field id="shortName" label="Short name"><input className="input" id="shortName" name="shortName" defaultValue={inst.short_name} /></Field>
        <Field id="website" label="Website"><input className="input" id="website" name="website" defaultValue={inst.website} /></Field>
        <Field id="city" label="City"><input className="input" id="city" name="city" defaultValue={inst.city} /></Field>
        <Field id="country" label="Country"><input className="input" id="country" name="country" defaultValue={inst.country} /></Field>
        <div className="sm:col-span-2">
          <Field id="domains" label="Student email domains" hint="Anyone signing in with an address at one of these (or a subdomain) can join as a student.">
            <input className="input font-mono" id="domains" name="domains" defaultValue={inst.student_domains.join(", ")} />
          </Field>
        </div>
      </div>
      {err && <FormError message={err} />}
      <div className="flex items-center gap-3">
        <button className="btn" type="submit" disabled={busy}>{busy ? "Saving…" : "Save details"}</button>
        {msg && <span role="status" className="text-[0.88rem] text-ok">{msg}</span>}
      </div>
    </form>
  );
}

/** Extra student emails (outside the institution's domains). */
export function StudentAllowlist({ institutionId, rows }: { institutionId: string; rows: AllowRow[] }) {
  const { err, msg, busy, run } = useRun();
  const [emails, setEmails] = useState("");
  return (
    <div className="panel">
      <h3 className="font-bold">Extra student emails</h3>
      <p className="text-[0.9rem] text-muted">
        For students who can&apos;t use an institution address, such as exchange students or a student whose institute email
        isn&apos;t working.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="field min-w-[14rem] flex-1">
          <span className="field-label">Emails</span>
          <input className="input" value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="name@gmail.com, other@gmail.com" />
        </label>
        <button className="btn" type="button" disabled={busy}
          onClick={() => run(() => orgAllowStudentEmails(institutionId, emails, ""), "Added.", () => setEmails(""))}>Allow</button>
      </div>
      {rows.length > 0 && (
        <ul className="grid gap-1 text-[0.88rem]">
          {rows.map((r) => (
            <li key={r.email} className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-[0.82rem]">{r.email}{r.joined && <span className="ml-2 font-sans text-muted">· signed up</span>}</span>
              <button className="linkbtn text-[0.84rem]" type="button" disabled={busy}
                onClick={() => run(() => orgRemoveStudentEmail(institutionId, r.email))}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      {err && <FormError message={err} />}
      {msg && <p role="status" className="text-[0.88rem] text-ok">{msg}</p>}
    </div>
  );
}

/** Who runs this institution. */
export function Organizers({ institutionId, rows, me }: { institutionId: string; rows: OrganizerRow[]; me: string }) {
  const { err, msg, busy, run } = useRun();
  const [email, setEmail] = useState("");
  return (
    <div className="panel">
      <h3 className="font-bold">Organizers</h3>
      <p className="text-[0.9rem] text-muted">Organizers approve alumni, manage invites and see sessions for this institution.</p>
      <ul className="grid gap-1 text-[0.9rem]">
        {rows.map((o) => (
          <li key={o.user_id} className="flex flex-wrap items-center justify-between gap-2">
            <span>{o.name || o.email} <span className="font-mono text-[0.78rem] text-muted">{o.email}</span>{o.user_id === me && " (you)"}</span>
            {rows.length > 1 && (
              <button className="linkbtn text-[0.84rem]" type="button" disabled={busy}
                onClick={() => run(() => orgRemoveOrganizer(institutionId, o.user_id))}>Remove</button>
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-3">
        <label className="field min-w-[14rem] flex-1">
          <span className="field-label">Add an organizer by email</span>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="colleague@college.edu" />
          <span className="hint">They need to have signed in once.</span>
        </label>
        <button className="btn" type="button" disabled={busy}
          onClick={() => run(() => orgAddOrganizer(institutionId, email), "Added.", () => setEmail(""))}>Add</button>
      </div>
      {err && <FormError message={err} />}
      {msg && <p role="status" className="text-[0.88rem] text-ok">{msg}</p>}
    </div>
  );
}
