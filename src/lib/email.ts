import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildIcs } from "@/lib/ics";

// Email goes through Resend's HTTP API. Without RESEND_API_KEY the app works
// normally and simply skips email (useful for local development).

const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
const fromHeader = () => process.env.EMAIL_FROM || "Alumni Connect <onboarding@resend.dev>";
const fromAddress = () => /<([^>]+)>/.exec(fromHeader())?.[1] ?? fromHeader();

const escHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Mail = {
  to: string;
  subject: string;
  lines: (string | [label: string, value: string])[];
  cta?: { label: string; href: string };
  ics?: { method: "REQUEST" | "CANCEL"; content: string };
};

async function send(m: Mail) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.info(`[email skipped: no RESEND_API_KEY] to=${m.to} subject="${m.subject}"`);
    return;
  }
  const text = [
    ...m.lines.map((l) => (Array.isArray(l) ? `${l[0]}: ${l[1]}` : l)),
    m.cta ? `\n${m.cta.label}: ${m.cta.href}` : "",
  ].join("\n");
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.55;color:#132228;max-width:560px">
${m.lines
  .map((l) =>
    Array.isArray(l)
      ? `<p style="margin:0 0 6px"><span style="color:#566a70">${escHtml(l[0])}:</span> ${escHtml(l[1])}</p>`
      : `<p style="margin:0 0 12px">${escHtml(l)}</p>`,
  )
  .join("\n")}
${m.cta ? `<p style="margin:20px 0"><a href="${escHtml(m.cta.href)}" style="background:#1b5e78;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">${escHtml(m.cta.label)}</a></p>` : ""}
<p style="margin-top:24px;color:#566a70;font-size:13px">Alumni Connect</p></div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: fromHeader(),
      to: [m.to],
      subject: m.subject,
      text,
      html,
      attachments: m.ics
        ? [
            {
              filename: m.ics.method === "CANCEL" ? "cancel.ics" : "invite.ics",
              content: Buffer.from(m.ics.content).toString("base64"),
              content_type: `text/calendar; charset=utf-8; method=${m.ics.method}`,
            },
          ]
        : undefined,
    }),
  });
  if (!res.ok) console.error("Resend error", res.status, await res.text().catch(() => ""));
}

// Times in emails: each recipient sees their own time zone.
function when(iso: string, tz: string) {
  const zone = tz || "UTC";
  try {
    return new Date(iso).toLocaleString("en-US", {
      weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: zone, timeZoneName: "short",
    });
  } catch {
    return new Date(iso).toUTCString();
  }
}

async function loadBooking(id: string) {
  const db = createAdminClient();
  const { data: b } = await db
    .from("bookings")
    .select("id, institution_id, alumni_id, student_id, starts_at, duration_min, topic, note, status, cancelled_by")
    .eq("id", id)
    .single();
  if (!b) return null;
  const [{ data: people }, { data: alum }, { data: stu }, { data: inst }] = await Promise.all([
    db.from("profiles").select("id, full_name, email").in("id", [b.alumni_id, b.student_id]),
    db.from("alumni_profiles").select("meeting_link, timezone, job_title, organization").eq("user_id", b.alumni_id).single(),
    db.from("student_profiles").select("department, year_of_study, timezone, project_title, project_summary").eq("user_id", b.student_id).single(),
    db.from("institutions").select("name, short_name").eq("id", b.institution_id).single(),
  ]);
  const a = people?.find((p) => p.id === b.alumni_id);
  const s = people?.find((p) => p.id === b.student_id);
  if (!a || !s || !alum || !stu) return null;
  const instName = inst?.short_name || inst?.name || "";
  return { b, a, s, alum, stu, instName };
}

function invite(x: NonNullable<Awaited<ReturnType<typeof loadBooking>>>, method: "REQUEST" | "CANCEL") {
  return buildIcs({
    uid: `booking-${x.b.id}@alumni-connect`,
    method,
    sequence: method === "CANCEL" ? 1 : 0,
    start: new Date(x.b.starts_at),
    durationMin: x.b.duration_min,
    summary: `Alumni Connect: ${x.s.full_name} × ${x.a.full_name}`,
    description: `Topic: ${x.b.topic}\nProject: ${x.stu.project_title}\nJoin: ${x.alum.meeting_link}`,
    location: x.alum.meeting_link,
    organizerEmail: fromAddress(),
    attendees: [
      { name: x.a.full_name, email: x.a.email },
      { name: x.s.full_name, email: x.s.email },
    ],
  });
}

export async function sendBookingEmails(bookingId: string) {
  const x = await loadBooking(bookingId);
  if (!x) return;
  const ics = { method: "REQUEST" as const, content: invite(x, "REQUEST") };
  await Promise.all([
    send({
      to: x.s.email,
      subject: `Booked: ${x.a.full_name}, ${when(x.b.starts_at, x.stu.timezone)}`,
      lines: [
        `Your session with ${x.a.full_name} (${x.alum.job_title}, ${x.alum.organization}) is confirmed.`,
        ["When", when(x.b.starts_at, x.stu.timezone)],
        ["Length", `${x.b.duration_min} minutes`],
        ["Topic", x.b.topic],
        ["Join", x.alum.meeting_link],
        "The calendar invite is attached. If you can't make it, cancel from My sessions so another student can take the slot.",
      ],
      cta: { label: "Open My sessions", href: `${siteUrl()}/sessions` },
      ics,
    }),
    send({
      to: x.a.email,
      subject: `New session: ${x.s.full_name}, ${when(x.b.starts_at, x.alum.timezone)}`,
      lines: [
        `${x.s.full_name} (${[x.instName, x.stu.year_of_study, x.stu.department].filter(Boolean).join(", ")}) booked one of your slots.`,
        ["When", when(x.b.starts_at, x.alum.timezone)],
        ["Project", x.stu.project_title],
        ...(x.stu.project_summary ? [["Summary", x.stu.project_summary] as [string, string]] : []),
        ["Wants to cover", x.b.topic],
        ...(x.b.note ? [["Note", x.b.note] as [string, string]] : []),
        ["Student email", x.s.email],
        "The calendar invite uses your meeting link.",
      ],
      cta: { label: "Open Sessions", href: `${siteUrl()}/sessions` },
      ics,
    }),
  ]);
}

export async function sendCancellationEmails(bookingId: string) {
  const x = await loadBooking(bookingId);
  if (!x) return;
  const byAlumnus = x.b.cancelled_by === x.a.id;
  const by = byAlumnus ? x.a.full_name : x.b.cancelled_by === x.s.id ? x.s.full_name : "The organizer";
  const ics = { method: "CANCEL" as const, content: invite(x, "CANCEL") };
  await Promise.all([
    send({
      to: x.s.email,
      subject: `Cancelled: session with ${x.a.full_name}`,
      lines: [
        `${by} cancelled the session on ${when(x.b.starts_at, x.stu.timezone)}.`,
        byAlumnus ? "You can book another slot with them or find a different mentor." : "",
      ].filter(Boolean),
      cta: { label: "Find a mentor", href: `${siteUrl()}/find` },
      ics,
    }),
    send({
      to: x.a.email,
      subject: `Cancelled: session with ${x.s.full_name}`,
      lines: [
        `${by} cancelled the session on ${when(x.b.starts_at, x.alum.timezone)}.`,
        "If it was more than 48 hours away, the slot is open again for other students.",
      ],
      cta: { label: "Open My availability", href: `${siteUrl()}/availability` },
      ics,
    }),
  ]);
}

export async function sendReminderEmails(bookingId: string) {
  const x = await loadBooking(bookingId);
  if (!x || x.b.status !== "booked") return;
  await Promise.all([
    send({
      to: x.s.email,
      subject: `Tomorrow: session with ${x.a.full_name}`,
      lines: [
        `A reminder about your session with ${x.a.full_name}.`,
        ["When", when(x.b.starts_at, x.stu.timezone)],
        ["Topic", x.b.topic],
        ["Join", x.alum.meeting_link],
      ],
      cta: { label: "Open My sessions", href: `${siteUrl()}/sessions` },
    }),
    send({
      to: x.a.email,
      subject: `Tomorrow: session with ${x.s.full_name}`,
      lines: [
        `A reminder about your session with ${x.s.full_name}.`,
        ["When", when(x.b.starts_at, x.alum.timezone)],
        ["Project", x.stu.project_title],
        ["Wants to cover", x.b.topic],
      ],
      cta: { label: "Open Sessions", href: `${siteUrl()}/sessions` },
    }),
  ]);
}

export async function sendApprovalEmail(userId: string, institutionId: string) {
  const db = createAdminClient();
  const [{ data: p }, { data: m }, { data: inst }] = await Promise.all([
    db.from("profiles").select("full_name, email").eq("id", userId).single(),
    db.from("memberships").select("status").eq("user_id", userId).eq("institution_id", institutionId).single(),
    db.from("institutions").select("name").eq("id", institutionId).single(),
  ]);
  if (!p || m?.status !== "approved") return;
  await send({
    to: p.email,
    subject: `You're approved as a mentor for ${inst?.name ?? "your institution"}`,
    lines: [
      `Hi ${p.full_name || "there"},`,
      `Thanks for volunteering. ${inst?.name ?? "Your institution"} has approved you, and its students can now find you.`,
      "Next step: open a slot on your calendar. One hour a week is plenty, and it's only used if a student books it.",
    ],
    cta: { label: "Open my availability", href: `${siteUrl()}/availability` },
  });
}

async function adminEmails() {
  const db = createAdminClient();
  const { data } = await db.from("platform_admin_emails").select("email");
  return (data ?? []).map((r) => r.email as string);
}

export async function sendApplicationReceivedEmail(institutionId: string) {
  const db = createAdminClient();
  const { data: i } = await db
    .from("institutions")
    .select("name, city, country, website, student_domains, applicant_role, applicant_note, applicant_id")
    .eq("id", institutionId)
    .single();
  if (!i) return;
  const { data: who } = await db.from("profiles").select("full_name, email").eq("id", i.applicant_id).single();
  const lines: Mail["lines"] = [
    `${who?.full_name || who?.email || "Someone"} applied to bring ${i.name} onto Alumni Connect.`,
    ["Applicant", `${who?.full_name || ""} <${who?.email || ""}>, ${i.applicant_role}`],
    ["Location", [i.city, i.country].filter(Boolean).join(", ") || "Not given"],
    ["Website", i.website || "Not given"],
    ["Student email domains", (i.student_domains as string[]).join(", ")],
    ...(i.applicant_note ? [["Note", i.applicant_note] as [string, string]] : []),
  ];
  await Promise.all([
    ...(await adminEmails()).map((to) =>
      send({ to, subject: `New institution application: ${i.name}`, lines, cta: { label: "Review it", href: `${siteUrl()}/admin` } }),
    ),
    who?.email
      ? send({
          to: who.email,
          subject: `We received your application for ${i.name}`,
          lines: [
            `Hi ${who.full_name || "there"},`,
            `Thanks for applying to bring ${i.name} onto Alumni Connect. We check each application, usually within a couple of days, and will email you when it's approved.`,
          ],
        })
      : Promise.resolve(),
  ]);
}

export async function sendInstitutionDecisionEmail(institutionId: string) {
  const db = createAdminClient();
  const { data: i } = await db.from("institutions").select("name, slug, status, applicant_id").eq("id", institutionId).single();
  if (!i || !i.applicant_id || i.status === "pending") return;
  const { data: who } = await db.from("profiles").select("full_name, email").eq("id", i.applicant_id).single();
  if (!who?.email) return;
  if (i.status === "approved")
    await send({
      to: who.email,
      subject: `${i.name} is live on Alumni Connect`,
      lines: [
        `Hi ${who.full_name || "there"},`,
        `${i.name} is approved and you're its organizer.`,
        "Next steps: create an invite link and share it with your alumni groups, then tell students to sign in with their institution email.",
      ],
      cta: { label: "Open the organizer page", href: `${siteUrl()}/org/${i.slug}` },
    });
  else
    await send({
      to: who.email,
      subject: `About your application for ${i.name}`,
      lines: [
        `Hi ${who.full_name || "there"},`,
        `We weren't able to approve ${i.name} on Alumni Connect. Reply to this email if you think that's a mistake or want to talk it through.`,
      ],
    });
}
