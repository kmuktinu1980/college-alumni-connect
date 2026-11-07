import type { Metadata } from "next";
import { requireViewer } from "@/lib/viewer";
import { createAdminClient } from "@/lib/supabase/admin";
import { gcalUrl } from "@/lib/time";
import { LocalTime, TzName } from "@/components/LocalTime";
import { CopyLine } from "@/components/CopyLine";
import { CancelSession } from "./CancelSession";

export const metadata: Metadata = { title: "Sessions" };

type Booking = {
  id: string;
  alumni_id: string;
  student_id: string;
  starts_at: string;
  duration_min: number;
  topic: string;
  note: string;
  status: "booked" | "cancelled";
  cancelled_by: string | null;
};

export default async function SessionsPage({ searchParams }: { searchParams: Promise<{ booked?: string }> }) {
  const v = await requireViewer();
  const isStudent = v.profile.role === "student";
  const sp = await searchParams;

  // RLS limits this to the viewer's own sessions.
  const { data } = await v.supabase
    .from("bookings")
    .select("id, alumni_id, student_id, starts_at, duration_min, topic, note, status, cancelled_by")
    .eq(isStudent ? "student_id" : "alumni_id", v.user.id)
    .order("starts_at");
  const bookings = (data ?? []) as Booking[];
  const otherIds = [...new Set(bookings.map((b) => (isStudent ? b.alumni_id : b.student_id)))];

  const now = Date.now();
  const isUpcoming = (b: Booking) => b.status === "booked" && new Date(b.starts_at).getTime() + b.duration_min * 60000 > now;
  const upcoming = bookings.filter(isUpcoming);
  const past = bookings.filter((b) => !isUpcoming(b)).reverse().slice(0, 40);

  // Private details (meeting links, student emails) via the service role,
  // limited to the people in this viewer's own bookings.
  const admin = createAdminClient();
  const [names, alumniInfo, studentInfo, emails] = await Promise.all([
    otherIds.length ? admin.from("profiles").select("id, full_name").in("id", otherIds) : Promise.resolve({ data: [] }),
    admin
      .from("alumni_profiles")
      .select("user_id, job_title, organization, meeting_link")
      .in("user_id", isStudent ? otherIds : [v.user.id]),
    !isStudent && otherIds.length
      ? admin.from("student_profiles").select("user_id, department, year_of_study, project_title, project_summary, institutions(short_name, name)").in("user_id", otherIds)
      : Promise.resolve({ data: [] }),
    !isStudent && otherIds.length ? admin.from("profiles").select("id, email").in("id", otherIds) : Promise.resolve({ data: [] }),
  ]);
  const nameOf = new Map((names.data ?? []).map((p: { id: string; full_name: string }) => [p.id, p.full_name]));
  const alum = new Map((alumniInfo.data ?? []).map((a) => [a.user_id as string, a]));
  const stu = new Map(
    (studentInfo.data ?? []).map((s: { user_id: string; institutions?: unknown }) => {
      const inst = s.institutions as { short_name: string; name: string } | null | undefined;
      return [s.user_id, { ...(s as unknown as Record<string, string>), institution: inst?.short_name || inst?.name || "" } as Record<string, string>];
    }),
  );
  const emailOf = new Map((emails.data ?? []).map((p: { id: string; email: string }) => [p.id, p.email]));

  return (
    <>
      <section className="grid gap-3.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-[1.6rem] font-bold">{isStudent ? "My sessions" : "Sessions students booked"}</h1>
          <span className="font-mono text-[0.8rem] text-muted">Times in <TzName /></span>
        </div>
        {sp.booked && upcoming.some((b) => b.id === sp.booked) && (
          <p role="status" className="rounded-lg bg-ok-soft px-4 py-3 text-[0.92rem]">
            Booked. You and your mentor will each get an email with a calendar invite.
          </p>
        )}
        {upcoming.length === 0 ? (
          <div className="empty">
            <b className="text-ink">Nothing booked yet</b>
            <span>
              {isStudent
                ? "Find a mentor and pick an open slot. It shows up here with the meeting link."
                : "When a student books one of your slots, you'll see their project brief here and get an email."}
            </span>
          </div>
        ) : (
          upcoming.map((b) => {
            const otherId = isStudent ? b.alumni_id : b.student_id;
            const other = nameOf.get(otherId) || (isStudent ? "Your mentor" : "A student");
            const a = alum.get(isStudent ? b.alumni_id : v.user.id);
            const s = stu.get(b.student_id);
            const meet = a?.meeting_link as string | undefined;
            const details = isStudent
              ? `Alumni Connect session with ${other}.\nTopic: ${b.topic}\nJoin: ${meet ?? ""}`
              : `Alumni Connect session with ${other}.\nProject: ${s?.project_title ?? ""}\nTopic: ${b.topic}\nJoin: ${meet ?? ""}`;
            const rows: [string, string][] = isStudent
              ? [["Mentor", [a?.job_title, a?.organization].filter(Boolean).join(" · ")]]
              : [
                  ["Project", s?.project_title ?? ""],
                  ["Summary", s?.project_summary ?? ""],
                  ["Student", [s?.institution, s?.year_of_study, s?.department].filter(Boolean).join(" · ")],
                ];
            if (b.note) rows.push(["Note", b.note]);
            return (
              <article key={b.id}
                className={`grid gap-x-[18px] gap-y-1 rounded-[10px] border bg-surface px-[18px] py-4 sm:grid-cols-[130px_1fr] ${
                  sp.booked === b.id ? "border-river" : "border-line"}`}>
                <div className="flex flex-wrap items-baseline gap-x-2.5 sm:grid sm:content-start sm:gap-0.5">
                  <LocalTime iso={b.starts_at} mode="day" className="font-display text-[1.02rem] font-bold" />
                  <LocalTime iso={b.starts_at} mode="timeTz" className="font-mono text-[0.86rem]" />
                  <span className="font-mono text-[0.74rem] text-muted">
                    {b.duration_min} min
                  </span>
                </div>
                <div className="grid min-w-0 gap-2">
                  <h2 className="text-[1.08rem] font-bold">{other}</h2>
                  <p className="text-[0.92rem]">{b.topic}</p>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[0.86rem]">
                    {rows.filter(([, val]) => val).map(([k, val]) => (
                      <div key={k} className="contents">
                        <dt className="text-muted">{k}</dt>
                        <dd className="min-w-0 [overflow-wrap:anywhere]">{val}</dd>
                      </div>
                    ))}
                  </dl>
                  {!isStudent && emailOf.get(b.student_id) && (
                    <div><p className="label-cap">Student email</p><CopyLine text={emailOf.get(b.student_id)!} /></div>
                  )}
                  {meet && (
                    <div>
                      <p className="label-cap">Meeting link</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <a href={meet} target="_blank" rel="noopener noreferrer">Join ↗</a>
                        <CopyLine text={meet} />
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2.5">
                    <a className="btn btn-ghost btn-sm" target="_blank" rel="noopener noreferrer"
                      href={gcalUrl(`Alumni Connect: ${other}`, b.starts_at, b.duration_min, details)}>
                      Add to Google Calendar ↗
                    </a>
                    <CancelSession bookingId={b.id} />
                  </div>
                </div>
              </article>
            );
          })
        )}
      </section>

      <section className="grid gap-2.5">
        <p className="label-cap">Past and cancelled</p>
        {past.length === 0 ? (
          <p className="text-[0.88rem] text-muted">None yet.</p>
        ) : (
          past.map((b) => (
            <div key={b.id} className="flex flex-wrap items-center gap-x-3.5 gap-y-2 rounded-lg border border-line bg-surface px-3 py-2.5">
              <LocalTime iso={b.starts_at} className="min-w-[150px] font-mono text-[0.86rem]" />
              <span className="min-w-0 flex-1 text-[0.86rem]">
                {nameOf.get(isStudent ? b.alumni_id : b.student_id) || "—"} · {b.topic}
              </span>
              <span className={`pill ${b.status === "cancelled" ? "pill-off" : "pill-open"}`}>
                {b.status === "cancelled" ? "Cancelled" : "Done"}
              </span>
            </div>
          ))
        )}
      </section>
    </>
  );
}
