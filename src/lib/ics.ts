// Minimal RFC 5545 calendar invite. Gmail, Outlook and Apple Calendar all
// show an "Add to calendar" / RSVP card for METHOD:REQUEST attachments, and
// remove the event when a METHOD:CANCEL with the same UID arrives.

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

// Lines longer than 75 octets are folded with CRLF + space.
function fold(line: string) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let len = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (len + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
      len = 0;
    }
    cur += ch;
    len += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function buildIcs(o: {
  uid: string;
  method: "REQUEST" | "CANCEL";
  sequence: number;
  start: Date;
  durationMin: number;
  summary: string;
  description: string;
  location: string;
  organizerEmail: string;
  attendees: { name: string; email: string }[];
}) {
  const end = new Date(o.start.getTime() + o.durationMin * 60000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Alumni Connect//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${o.method}`,
    "BEGIN:VEVENT",
    `UID:${o.uid}`,
    `SEQUENCE:${o.sequence}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(o.start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(o.summary)}`,
    `DESCRIPTION:${esc(o.description)}`,
    `LOCATION:${esc(o.location)}`,
    o.location.startsWith("https://") ? `URL:${o.location}` : "",
    `ORGANIZER;CN=Alumni Connect:mailto:${o.organizerEmail}`,
    ...o.attendees.map(
      (a) => `ATTENDEE;CN=${esc(a.name || a.email)};ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:${a.email}`,
    ),
    `STATUS:${o.method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return lines.map(fold).join("\r\n") + "\r\n";
}
