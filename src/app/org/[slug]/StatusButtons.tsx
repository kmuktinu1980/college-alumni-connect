"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { orgSetMemberStatus } from "@/app/actions";

type Status = "pending" | "approved" | "rejected";

export function StatusButtons({ institutionId, userId, current, compact }: { institutionId: string; userId: string; current: Status; compact?: boolean }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [busy, start] = useTransition();

  const set = (s: Status) =>
    start(async () => {
      setErr("");
      const r = await orgSetMemberStatus(institutionId, userId, s);
      if (!r.ok) return setErr(r.error);
      router.refresh();
    });

  const size = compact ? "btn-sm" : "";
  return (
    <div className="flex flex-wrap items-center gap-2">
      {current !== "approved" && (
        <button className={`btn ${size}`} type="button" disabled={busy} onClick={() => set("approved")}>
          {current === "pending" ? "Approve" : "Approve instead"}
        </button>
      )}
      {current !== "rejected" && (
        <button className={`btn btn-quiet ${size}`} type="button" disabled={busy} onClick={() => set("rejected")}>
          {current === "pending" ? "Reject" : "Remove from directory"}
        </button>
      )}
      {err && <span role="alert" className="err">{err}</span>}
    </div>
  );
}
