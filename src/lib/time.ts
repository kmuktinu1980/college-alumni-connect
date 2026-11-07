// Formatting helpers. Call these in the browser (via <LocalTime/>) so times
// render in the viewer's own time zone.

export const viewerTz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

export const fmtDay = (d: Date) => d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
export const fmtTime = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
export const fmtTimeTz = (d: Date) =>
  d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZoneName: "short" });

export const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

export function gcalUrl(title: string, startIso: string, durationMin: number, details: string) {
  const s = new Date(startIso);
  const e = new Date(s.getTime() + durationMin * 60000);
  const f = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const p = new URLSearchParams({ action: "TEMPLATE", text: title, dates: `${f(s)}/${f(e)}`, details });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

export const batchLabel = (a: { grad_year?: number | null; degree?: string; department?: string }) =>
  [a.grad_year ? "’" + String(a.grad_year).slice(-2) : "", [a.degree, a.department].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(" · ");
