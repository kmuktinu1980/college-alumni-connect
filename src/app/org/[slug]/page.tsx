import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireOrganizer } from "@/lib/viewer";
import { createAdminClient } from "@/lib/supabase/admin";
import { batchLabel } from "@/lib/time";
import { minNoticeCutoff } from "@/lib/constants";
import { LocalTime } from "@/components/LocalTime";
import { CopyLine } from "@/components/CopyLine";
import { StatusButtons } from "./StatusButtons";
import { InviteManager, type InviteRow, type LinkRow } from "./InviteManager";
import { InstitutionDetails, Organizers, StudentAllowlist, type AllowRow, type OrganizerRow } from "./OrgSettings";

export const metadata: Metadata = { title: "Organizer" };

type Stats = {
  alumni_approved: number;
  alumni_pending: number;
  students: number;
  open_slots: number;
  upcoming_sessions: number;
  completed_sessions: number;
  cancelled_sessions: number;
  completed_minutes: number;
  match_searches: number;
  completed_by_mentor: { alumni_id: string; name: string; sessions: number }[];
};

const statusWord = (s: string) => (s === "approved" ? "Approved" : s === "pending" ? "Awaiting review" : "Not approved");

export default async function OrgPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { v, inst } = await requireOrganizer(slug);
  if (!inst) notFound();

  if (inst.status !== "approved")
    return (
      <section className="grid max-w-2xl gap-3">
        <h1 className="text-[1.6rem] font-bold">{inst.name}</h1>
        <p className="lede">
          {inst.status === "pending"
            ? "This institution is waiting for a platform admin to approve it. You'll get an email when it's live."
            : "This institution wasn't approved."}
        </p>
      </section>
    );

  const db = createAdminClient();
  const nowIso = new Date().toISOString();
  const [
    { data: statsData, error: statsError },
    { data: mems },
    { data: studentRows },
    { data: bookings },
    { data: inviteRows },
    { data: linkRows },
    { data: allowRows },
    { data: orgRows },
  ] = await Promise.all([
    v.supabase.rpc("org_stats", { p_inst: inst.id }),
    db.from("memberships").select("user_id, grad_year, degree, department, status, approved_via, created_at").eq("institution_id", inst.id),
    db.from("student_profiles").select("user_id, program, department, year_of_study, project_title").eq("institution_id", inst.id),
    db.from("bookings").select("id, alumni_id, student_id, starts_at, duration_min, topic, status").eq("institution_id", inst.id).order("starts_at"),
    db.from("alumni_invites").select("email, note, created_at").eq("institution_id", inst.id).order("created_at", { ascending: false }),
    db.from("invite_links").select("code, label, expires_at, max_uses, uses, revoked, created_at").eq("institution_id", inst.id).order("created_at", { ascending: false }).limit(20),
    db.from("student_email_allowlist").select("email, note").eq("institution_id", inst.id).order("created_at", { ascending: false }),
    db.from("organizers").select("user_id").eq("institution_id", inst.id),
  ]);
  if (statsError) throw statsError;
  const st = statsData as Stats;

  const alumniIds = (mems ?? []).map((m) => m.user_id as string);
  const studentIds = (studentRows ?? []).map((s) => s.user_id as string);
  const orgIds = (orgRows ?? []).map((o) => o.user_id as string);
  const peopleIds = [...new Set([...alumniIds, ...studentIds, ...orgIds])];
  const [{ data: people }, { data: alumniProfiles }, { data: openSlots }] = await Promise.all([
    peopleIds.length ? db.from("profiles").select("id, full_name, email, created_at").in("id", peopleIds) : Promise.resolve({ data: [] }),
    alumniIds.length
      ? db.from("alumni_profiles").select("user_id, job_title, organization, city, linkedin_url, skills, bio, visible").in("user_id", alumniIds)
      : Promise.resolve({ data: [] }),
    alumniIds.length
      ? db.from("slots").select("alumni_id").eq("is_booked", false).gt("starts_at", minNoticeCutoff().toISOString()).in("alumni_id", alumniIds)
      : Promise.resolve({ data: [] }),
  ]);
  type Person = { id: string; full_name: string; email: string; created_at: string };
  type AlumniProfile = { user_id: string; job_title: string; organization: string; city: string; linkedin_url: string; skills: string[]; bio: string; visible: boolean };
  const person = new Map(((people ?? []) as Person[]).map((p) => [p.id, p]));
  const prof = new Map(((alumniProfiles ?? []) as AlumniProfile[]).map((a) => [a.user_id, a]));
  const openBy = new Map<string, number>();
  for (const s of (openSlots ?? []) as { alumni_id: string }[]) openBy.set(s.alumni_id, (openBy.get(s.alumni_id) ?? 0) + 1);

  const all = bookings ?? [];
  const upcoming = all.filter((b) => b.status === "booked" && new Date(b.starts_at).getTime() + b.duration_min * 60000 > Date.now());
  const recent = all
    .filter((b) => b.status === "booked" && new Date(b.starts_at).getTime() + b.duration_min * 60000 <= Date.now())
    .reverse()
    .slice(0, 25);
  const sessionsBy = new Map<string, number>();
  const studentSessions = new Map<string, { upcoming: number; done: number }>();
  for (const b of all) {
    if (b.status !== "booked") continue;
    sessionsBy.set(b.alumni_id, (sessionsBy.get(b.alumni_id) ?? 0) + 1);
    const c = studentSessions.get(b.student_id) ?? { upcoming: 0, done: 0 };
    if (b.starts_at > nowIso) c.upcoming++;
    else c.done++;
    studentSessions.set(b.student_id, c);
  }

  const memberships = (mems ?? []) as { user_id: string; grad_year: number; degree: string; department: string; status: string; approved_via: string; created_at: string }[];
  const pending = memberships.filter((m) => m.status === "pending").sort((a, b) => a.created_at.localeCompare(b.created_at));
  const reviewed = memberships.filter((m) => m.status !== "pending").sort((a, b) => a.grad_year - b.grad_year);
  const byEmail = new Map(((people ?? []) as Person[]).map((p) => [p.email.toLowerCase(), p]));
  const memberOf = new Map(memberships.map((m) => [m.user_id, m]));
  const invites: InviteRow[] = (inviteRows ?? []).map((i) => {
    const p = byEmail.get(i.email);
    const m = p ? memberOf.get(p.id) : undefined;
    return { email: i.email, note: i.note, joined: p && m ? `${p.full_name || "Signed up"} · ${statusWord(m.status)}` : null };
  });
  const students = ((studentRows ?? []) as { user_id: string; program: string; department: string; year_of_study: string; project_title: string }[])
    .map((s) => ({ ...s, p: person.get(s.user_id) }))
    .sort((a, b) => (b.p?.created_at ?? "").localeCompare(a.p?.created_at ?? ""));
  const studentEmails = new Set(students.map((s) => s.p?.email.toLowerCase()));
  const allow: AllowRow[] = (allowRows ?? []).map((r) => ({ email: r.email, note: r.note, joined: studentEmails.has(r.email) }));
  const organizers: OrganizerRow[] = orgIds.map((id) => ({ user_id: id, name: person.get(id)?.full_name ?? "", email: person.get(id)?.email ?? "" }));
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  const nameOf = (id: string) => person.get(id)?.full_name || "—";

  const stats: [string, number][] = [
    ["Alumni approved", st.alumni_approved],
    ["Awaiting review", st.alumni_pending],
    ["Students", st.students],
    ["Open slots", st.open_slots],
    ["Upcoming sessions", st.upcoming_sessions],
    ["Completed sessions", st.completed_sessions],
    ["Mentoring hours", Math.round((st.completed_minutes / 60) * 10) / 10],
    ["Match searches", st.match_searches],
  ];

  return (
    <>
      <section className="grid gap-3.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-[1.6rem] font-bold">{inst.name}</h1>
          <Link href={`/i/${inst.slug}`} className="text-[0.88rem]">Public page ↗</Link>
        </div>
        <div className="grid gap-1 text-[0.9rem] text-muted">
          <span>Share your public page with students and alumni:</span>
          <CopyLine text={`${site}/i/${inst.slug}`} />
        </div>
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(140px,1fr))]">
          {stats.map(([k, n]) => (
            <div key={k} className="rounded-[10px] border border-line bg-surface px-4 py-3.5">
              <span className="label-cap">{k}</span>
              <b className="block font-mono text-[1.6rem] font-medium tabular">{n}</b>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="text-[1.25rem] font-bold">Alumni awaiting review</h2>
        {pending.length === 0 ? (
          <p className="text-muted">Nobody is waiting. New alumni who choose {inst.short_name || inst.name} appear here.</p>
        ) : (
          pending.map((m) => {
            const p = person.get(m.user_id);
            const a = prof.get(m.user_id);
            return (
              <article key={m.user_id} className="card">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-[1.08rem] font-bold">{p?.full_name}</h3>
                  <span className="font-mono text-[0.8rem] text-muted">{p?.email}</span>
                </div>
                <p className="text-[0.9rem]">
                  <span className="font-mono">{batchLabel(m)}</span>
                  {a && <> · {[a.job_title, a.organization].filter(Boolean).join(" · ")}{a.city ? ` · ${a.city}` : ""}</>}
                </p>
                {a && a.skills.length > 0 && <p className="text-[0.86rem] text-muted">{a.skills.join(", ")}</p>}
                {a?.bio && <p className="text-[0.9rem]">{a.bio}</p>}
                {a?.linkedin_url && (
                  <a href={a.linkedin_url} target="_blank" rel="noopener noreferrer" className="justify-self-start text-[0.86rem]">
                    Check LinkedIn ↗
                  </a>
                )}
                <StatusButtons institutionId={inst.id} userId={m.user_id} current="pending" />
              </article>
            );
          })
        )}
      </section>

      <section className="grid gap-3">
        <h2 className="text-[1.25rem] font-bold">Invite alumni</h2>
        <InviteManager
          institutionId={inst.id}
          site={site}
          invites={invites}
          links={(linkRows ?? []) as LinkRow[]}
          defaultLabel={`${inst.short_name || inst.name} alumni group`}
        />
      </section>

      <section className="grid gap-3">
        <h2 className="text-[1.25rem] font-bold">Upcoming sessions</h2>
        {upcoming.length === 0 ? (
          <p className="text-muted">No sessions booked yet.</p>
        ) : (
          <SessionTable rows={upcoming} nameOf={nameOf} />
        )}
      </section>

      <section className="grid gap-3">
        <h2 className="text-[1.25rem] font-bold">Completed sessions</h2>
        {recent.length === 0 ? (
          <p className="text-muted">None yet. Sessions show up here once their end time has passed.</p>
        ) : (
          <SessionTable rows={recent} nameOf={nameOf} />
        )}
        {st.completed_by_mentor.length > 0 && (
          <p className="text-[0.86rem] text-muted">
            Most sessions: {st.completed_by_mentor.slice(0, 5).map((m) => `${m.name} (${m.sessions})`).join(", ")}
          </p>
        )}
      </section>

      <section className="grid gap-3">
        <h2 className="text-[1.25rem] font-bold">Alumni</h2>
        {reviewed.length === 0 ? (
          <p className="text-muted">No reviewed alumni yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-[10px] border border-line bg-surface">
            <table className="w-full border-collapse text-[0.88rem]">
              <thead>
                <tr>{["Name", "Batch", "Role", "Open slots", "Sessions", "Status"].map((h) => <th key={h} className="label-cap border-b border-line px-3 py-2 text-left">{h}</th>)}</tr>
              </thead>
              <tbody>
                {reviewed.map((m) => {
                  const p = person.get(m.user_id);
                  const a = prof.get(m.user_id);
                  return (
                    <tr key={m.user_id} className="border-b border-line last:border-0 align-top">
                      <td className="px-3 py-2">{p?.full_name}<div className="font-mono text-[0.76rem] text-muted">{p?.email}</div></td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono">{batchLabel(m)}</td>
                      <td className="px-3 py-2">{a ? [a.job_title, a.organization].filter(Boolean).join(" · ") : "—"}</td>
                      <td className="px-3 py-2 font-mono tabular">{openBy.get(m.user_id) ?? 0}</td>
                      <td className="px-3 py-2 font-mono tabular">{sessionsBy.get(m.user_id) ?? 0}</td>
                      <td className="px-3 py-2">
                        <div className="grid gap-1.5">
                          <span className={`pill justify-self-start ${m.status === "approved" ? (a?.visible === false ? "pill-booked" : "pill-open") : "pill-off"}`}>
                            {m.status === "approved" ? (a?.visible === false ? "Hidden by self" : "Approved") : "Not approved"}
                          </span>
                          {m.approved_via && m.approved_via !== "organizer" && (
                            <span className="text-[0.76rem] text-muted">{m.approved_via.startsWith("link:") ? "Via invite link" : "Pre-approved email"}</span>
                          )}
                          <StatusButtons institutionId={inst.id} userId={m.user_id} current={m.status as "approved" | "rejected"} compact />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="grid gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[1.25rem] font-bold">Students</h2>
          <span className="font-mono text-[0.8rem] text-muted">{students.length} signed up</span>
        </div>
        {students.length === 0 ? (
          <p className="text-muted">
            No students yet. Students join by signing in with an address at{" "}
            <span className="font-mono">{inst.student_domains.map((d: string) => "@" + d).join(", ")}</span>.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-[10px] border border-line bg-surface">
            <table className="w-full border-collapse text-[0.88rem]">
              <thead>
                <tr>{["Name", "Program", "Project", "Sessions", "Joined"].map((h) => <th key={h} className="label-cap border-b border-line px-3 py-2 text-left">{h}</th>)}</tr>
              </thead>
              <tbody>
                {students.map((s) => {
                  const c = studentSessions.get(s.user_id);
                  return (
                    <tr key={s.user_id} className="border-b border-line last:border-0 align-top">
                      <td className="px-3 py-2">
                        {s.p?.full_name || "—"}
                        <div className="font-mono text-[0.76rem] text-muted">{s.p?.email}</div>
                      </td>
                      <td className="px-3 py-2">{[s.program, s.department, s.year_of_study].filter(Boolean).join(" · ") || "—"}</td>
                      <td className="px-3 py-2">{s.project_title || "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono tabular">{c ? `${c.upcoming} upcoming · ${c.done} done` : "0"}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono tabular">{s.p && <LocalTime iso={s.p.created_at} mode="day" />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="grid gap-3">
        <h2 className="text-[1.25rem] font-bold">Settings</h2>
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <InstitutionDetails inst={inst} />
          <div className="grid gap-4">
            <Organizers institutionId={inst.id} rows={organizers} me={v.user.id} />
            <StudentAllowlist institutionId={inst.id} rows={allow} />
          </div>
        </div>
      </section>
    </>
  );
}

function SessionTable({
  rows,
  nameOf,
}: {
  rows: { id: string; starts_at: string; alumni_id: string; student_id: string; topic: string }[];
  nameOf: (id: string) => string;
}) {
  return (
    <div className="overflow-x-auto rounded-[10px] border border-line bg-surface">
      <table className="w-full border-collapse text-[0.88rem]">
        <thead>
          <tr>{["When", "Mentor", "Student", "Topic"].map((h) => <th key={h} className="label-cap border-b border-line px-3 py-2 text-left">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.id} className="border-b border-line last:border-0 align-top">
              <td className="whitespace-nowrap px-3 py-2 font-mono tabular"><LocalTime iso={b.starts_at} /></td>
              <td className="px-3 py-2">{nameOf(b.alumni_id)}</td>
              <td className="px-3 py-2">{nameOf(b.student_id)}</td>
              <td className="px-3 py-2">{b.topic}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
