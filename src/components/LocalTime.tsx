"use client";

import { useEffect, useState } from "react";
import { fmtDay, fmtTime, fmtTimeTz } from "@/lib/time";

type Mode = "day" | "time" | "timeTz" | "dayTime";

const format = (d: Date, mode: Mode) =>
  mode === "day" ? fmtDay(d)
  : mode === "time" ? fmtTime(d)
  : mode === "timeTz" ? fmtTimeTz(d)
  : `${fmtDay(d)}, ${fmtTime(d)}`;

/** Renders a time in the viewer's own time zone (formatted after mount to avoid server/client mismatch). */
export function LocalTime({ iso, mode = "dayTime", className }: { iso: string; mode?: Mode; className?: string }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => setText(format(new Date(iso), mode)), [iso, mode]);
  return (
    <time dateTime={iso} className={className}>
      {text ?? " "}
    </time>
  );
}

export function TzName() {
  const [tz, setTz] = useState("");
  useEffect(() => {
    try {
      setTz(Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g, " "));
    } catch {}
  }, []);
  return <>{tz || "your time zone"}</>;
}
