"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelBooking } from "@/app/actions";

export function CancelSession({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [err, setErr] = useState("");
  const [busy, start] = useTransition();

  if (!asking)
    return (
      <button className="btn btn-quiet btn-sm" type="button" onClick={() => setAsking(true)}>
        Cancel session
      </button>
    );

  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="text-[0.86rem]">Cancel this session? You'll both get an email.</span>
      <button
        className="btn btn-danger btn-sm"
        type="button"
        disabled={busy}
        onClick={() =>
          start(async () => {
            const r = await cancelBooking(bookingId);
            if (!r.ok) return setErr(r.error);
            router.refresh();
          })
        }
      >
        {busy ? "Cancelling…" : "Yes, cancel"}
      </button>
      <button className="btn btn-quiet btn-sm" type="button" onClick={() => setAsking(false)}>Keep it</button>
      {err && <span role="alert" className="err">{err}</span>}
    </span>
  );
}
