"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { joinInstitution, leaveInstitution } from "@/app/actions";
import { FormError } from "@/components/Field";
import { InstitutionFields, type InstitutionOption } from "@/components/InstitutionFields";

export type MembershipRow = {
  id: string;
  name: string;
  status: "pending" | "approved" | "rejected";
  grad_year: number;
  degree: string;
  department: string;
};

const STATUS: Record<MembershipRow["status"], { label: string; cls: string }> = {
  approved: { label: "Approved", cls: "bg-ok-soft" },
  pending: { label: "Awaiting its organizers", cls: "bg-amber-soft" },
  rejected: { label: "Not approved", cls: "bg-bad-soft" },
};

/** An alumnus's institutions: status of each, and joining another. */
export function MembershipsPanel({
  memberships,
  institutions,
  defaultInstitution = "",
}: {
  memberships: MembershipRow[];
  institutions: InstitutionOption[];
  defaultInstitution?: string;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(!memberships.length || !!defaultInstitution);
  const [confirmLeave, setConfirmLeave] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const joined = new Set(memberships.map((m) => m.id));
  const options = institutions.filter((i) => !joined.has(i.id));

  function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "").trim();
    setErr("");
    setMsg("");
    start(async () => {
      const r = await joinInstitution({
        institutionId: get("institutionId"),
        gradYear: get("gradYear") === "" ? NaN : Number(get("gradYear")),
        degree: get("degree"),
        department: get("department"),
      });
      if (!r.ok) return setErr(r.error);
      setMsg(r.data?.status === "approved" ? "Added and approved: its students can find you now." : "Added. Its organizers will confirm you, usually within a day or two.");
      setAdding(false);
      router.refresh();
    });
  }

  function leave(id: string) {
    setErr("");
    start(async () => {
      const r = await leaveInstitution(id);
      if (!r.ok) return setErr(r.error);
      setConfirmLeave("");
      router.refresh();
    });
  }

  return (
    <section className="panel" aria-labelledby="inst-h">
      <div className="grid gap-1">
        <h2 id="inst-h" className="text-lg font-bold">Your institutions</h2>
        <p className="text-[0.9rem] text-muted">
          Students of each institution that approves you can find and book you. Add every college you graduated from.
        </p>
      </div>
      {memberships.length > 0 && (
        <ul className="grid gap-2">
          {memberships.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2">
              <span className="grid">
                <b>{m.name}</b>
                <span className="text-[0.84rem] text-muted">
                  {[m.grad_year, m.degree, m.department].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-[0.8rem] ${STATUS[m.status].cls}`}>{STATUS[m.status].label}</span>
                {confirmLeave === m.id ? (
                  <>
                    <button className="btn btn-sm btn-quiet" type="button" disabled={pending} onClick={() => leave(m.id)}>Yes, leave</button>
                    <button className="linkbtn text-[0.84rem]" type="button" onClick={() => setConfirmLeave("")}>Keep</button>
                  </>
                ) : (
                  <button className="linkbtn text-[0.84rem]" type="button" onClick={() => setConfirmLeave(m.id)}>Leave</button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {adding && options.length > 0 ? (
        <form onSubmit={add} className="grid gap-3.5 rounded-lg border border-line px-4 py-3" noValidate>
          <InstitutionFields institutions={options} defaultInstitution={defaultInstitution} />
          <div className="flex flex-wrap gap-3">
            <button className="btn" type="submit" disabled={pending}>{pending ? "Adding…" : "Add institution"}</button>
            {memberships.length > 0 && (
              <button className="btn btn-quiet" type="button" onClick={() => setAdding(false)}>Cancel</button>
            )}
          </div>
        </form>
      ) : options.length > 0 ? (
        <button className="btn btn-quiet justify-self-start" type="button" onClick={() => setAdding(true)}>
          Add another institution
        </button>
      ) : null}
      {err && <FormError message={err} />}
      {msg && <p role="status" className="text-[0.9rem] text-ok">{msg}</p>}
    </section>
  );
}
