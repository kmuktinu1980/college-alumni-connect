"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { orgAddInvites, orgCreateInviteLink, orgRemoveInvite, orgRevokeInviteLink } from "@/app/actions";
import { CopyLine } from "@/components/CopyLine";
import { FormError } from "@/components/Field";
import { LocalTime } from "@/components/LocalTime";

export type InviteRow = { email: string; note: string; joined: string | null };
export type LinkRow = { code: string; label: string; expires_at: string; max_uses: number; uses: number; revoked: boolean };

export function InviteManager({ institutionId, site, invites, links, defaultLabel }: { institutionId: string; site: string; invites: InviteRow[]; links: LinkRow[]; defaultLabel: string }) {
  const router = useRouter();
  const [emails, setEmails] = useState("");
  const [note, setNote] = useState("");
  const [label, setLabel] = useState(defaultLabel);
  const [days, setDays] = useState(60);
  const [maxUses, setMaxUses] = useState(30);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, start] = useTransition();
  const now = new Date().toISOString();

  const run = (fn: () => Promise<{ ok: boolean; error?: string } & Record<string, unknown>>, done?: (r: never) => void) =>
    start(async () => {
      setErr("");
      setMsg("");
      const r = await fn();
      if (!r.ok) return setErr(r.error ?? "Something went wrong.");
      done?.(r as never);
      router.refresh();
    });

  return (
    <div className="grid gap-4">
      <div className="panel">
        <h3 className="font-bold">Invite link</h3>
        <p className="text-[0.9rem] text-muted">
          Post it in an alumni group. Anyone who signs up through it can open slots without waiting for approval. You can
          still remove anyone later from the Alumni table.
        </p>
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
          <label className="field">
            <span className="field-label">Label</span>
            <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Valid for (days)</span>
            <input className="input tabular" type="number" min={1} max={365} value={days} onChange={(e) => setDays(Number(e.target.value))} />
          </label>
          <label className="field">
            <span className="field-label">Max sign-ups</span>
            <input className="input tabular" type="number" min={1} max={1000} value={maxUses} onChange={(e) => setMaxUses(Number(e.target.value))} />
          </label>
          <button className="btn" type="button" disabled={busy}
            onClick={() => run(() => orgCreateInviteLink(institutionId, label, days, maxUses), () => setMsg("Link created."))}>
            Create link
          </button>
        </div>
        {links.length > 0 && (
          <ul className="grid gap-2">
            {links.map((l) => {
              const live = !l.revoked && l.expires_at > now && l.uses < l.max_uses;
              return (
                <li key={l.code} className={`grid gap-1 rounded-lg border border-line px-3 py-2 ${live ? "" : "opacity-60"}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-[0.88rem]">
                    <b>{l.label || "Invite link"}</b>
                    <span className="text-muted">
                      {l.uses}/{l.max_uses} used ·{" "}
                      {l.revoked ? "revoked" : l.expires_at <= now ? "expired" : <>expires <LocalTime iso={l.expires_at} /></>}
                    </span>
                  </div>
                  {live && (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <CopyLine text={`${site}/join/${l.code}`} />
                      <button className="linkbtn text-[0.84rem]" type="button" disabled={busy}
                        onClick={() => run(() => orgRevokeInviteLink(l.code))}>Revoke</button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="panel">
        <h3 className="font-bold">Pre-approved emails</h3>
        <p className="text-[0.9rem] text-muted">
          Mentors who sign in with one of these emails are approved straight away. Anyone already waiting with one is approved now.
        </p>
        <label className="field">
          <span className="field-label">Emails</span>
          <textarea className="input min-h-[90px]" value={emails} onChange={(e) => setEmails(e.target.value)}
            placeholder="Paste emails, separated by commas, spaces or new lines" />
        </label>
        <div className="flex flex-wrap items-end gap-3">
          <label className="field min-w-[12rem] flex-1">
            <span className="field-label">Note (optional)</span>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 2005 batch WhatsApp group" />
          </label>
          <button className="btn" type="button" disabled={busy}
            onClick={() => run(() => orgAddInvites(institutionId, emails, note), (r: { data: { added: number; invalid: string[] } }) => {
              setEmails("");
              setMsg(`Added ${r.data.added}.${r.data.invalid.length ? ` Skipped (not emails): ${r.data.invalid.join(", ")}` : ""}`);
            })}>
            Add
          </button>
        </div>
        {invites.length > 0 && (
          <div className="overflow-x-auto rounded-[10px] border border-line">
            <table className="w-full border-collapse text-[0.86rem]">
              <thead>
                <tr>{["Email", "Note", "Status", ""].map((h) => <th key={h} className="label-cap border-b border-line px-3 py-2 text-left">{h}</th>)}</tr>
              </thead>
              <tbody>
                {invites.map((i) => (
                  <tr key={i.email}>
                    <td className="border-b border-line px-3 py-2 font-mono text-[0.8rem]">{i.email}</td>
                    <td className="border-b border-line px-3 py-2">{i.note}</td>
                    <td className="border-b border-line px-3 py-2">{i.joined ?? <span className="text-muted">Not signed up yet</span>}</td>
                    <td className="border-b border-line px-3 py-2 text-right">
                      <button className="linkbtn text-[0.84rem]" type="button" disabled={busy}
                        onClick={() => run(() => orgRemoveInvite(institutionId, i.email))}>Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {err && <FormError message={err} />}
      {msg && <p role="status" className="text-[0.88rem] text-ok">{msg}</p>}
    </div>
  );
}
