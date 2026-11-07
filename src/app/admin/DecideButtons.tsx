"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminDecideInstitution } from "@/app/actions";

export function DecideButtons({ institutionId, reopen }: { institutionId: string; reopen?: boolean }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [busy, start] = useTransition();
  const decide = (s: "approved" | "rejected") =>
    start(async () => {
      setErr("");
      const r = await adminDecideInstitution(institutionId, s);
      if (!r.ok) return setErr(r.error);
      router.refresh();
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className={`btn ${reopen ? "btn-sm btn-quiet" : ""}`} type="button" disabled={busy} onClick={() => decide("approved")}>
        {reopen ? "Approve after all" : "Approve"}
      </button>
      {!reopen && (
        <button className="btn btn-quiet" type="button" disabled={busy} onClick={() => decide("rejected")}>Reject</button>
      )}
      {err && <span role="alert" className="err">{err}</span>}
    </div>
  );
}
