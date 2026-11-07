import Link from "next/link";
import type { Metadata } from "next";
import { requireViewer } from "@/lib/viewer";
import { createAdminClient } from "@/lib/supabase/admin";
import { LocalTime } from "@/components/LocalTime";
import { DecideButtons } from "./DecideButtons";

export const metadata: Metadata = { title: "Platform admin" };

type AdminStats = {
  institutions_approved: number;
  institutions_pending: number;
  alumni: number;
  students: number;
  completed_sessions: number;
  upcoming_sessions: number;
  by_institution: { id: string; slug: string; name: string; alumni: number; alumni_pending: number; students: number; completed: number }[];
};

export default async function AdminPage() {
  const v = await requireViewer({ admin: true });
  const db = createAdminClient();
  const [{ data: statsData, error }, { data: apps }, { data: admins }] = await Promise.all([
    v.supabase.rpc("admin_stats"),
    db
      .from("institutions")
      .select("id, slug, name, short_name, city, country, website, student_domains, status, applicant_id, applicant_role, applicant_note, created_at")
      .neq("status", "approved")
      .order("created_at", { ascending: false }),
    db.from("platform_admin_emails").select("email"),
  ]);
  if (error) throw error;
  const st = statsData as AdminStats;
  const applicantIds = [...new Set((apps ?? []).map((a) => a.applicant_id).filter(Boolean))] as string[];
  const { data: applicants } = applicantIds.length
    ? await db.from("profiles").select("id, full_name, email").in("id", applicantIds)
    : { data: [] };
  const who = new Map((applicants ?? []).map((p) => [p.id, p]));
  const pending = (apps ?? []).filter((a) => a.status === "pending");
  const rejected = (apps ?? []).filter((a) => a.status === "rejected");

  const stats: [string, number][] = [
    ["Institutions live", st.institutions_approved],
    ["Applications waiting", st.institutions_pending],
    ["Approved alumni", st.alumni],
    ["Students", st.students],
    ["Upcoming sessions", st.upcoming_sessions],
    ["Completed sessions", st.completed_sessions],
  ];

  return (
    <>
      <section className="grid gap-3.5">
        <h1 className="text-[1.6rem] font-bold">Platform admin</h1>
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
          {stats.map(([k, n]) => (
            <div key={k} className="rounded-[10px] border border-line bg-surface px-4 py-3.5">
              <span className="label-cap">{k}</span>
              <b className="block font-mono text-[1.6rem] font-medium tabular">{n}</b>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="text-[1.25rem] font-bold">Institution applications</h2>
        {pending.length === 0 ? (
          <p className="text-muted">No applications waiting.</p>
        ) : (
          pending.map((a) => {
            const p = a.applicant_id ? who.get(a.applicant_id) : undefined;
            return (
              <article key={a.id} className="card">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-[1.08rem] font-bold">{a.name}{a.short_name ? ` (${a.short_name})` : ""}</h3>
                  <span className="font-mono text-[0.8rem] text-muted"><LocalTime iso={a.created_at} mode="day" /></span>
                </div>
                <p className="text-[0.9rem]">
                  {[a.city, a.country].filter(Boolean).join(", ") || "Location not given"}
                  {a.website && <> · <a href={a.website} target="_blank" rel="noopener noreferrer">{a.website.replace(/^https?:\/\//, "")} ↗</a></>}
                </p>
                <p className="text-[0.9rem]">
                  Student emails: <span className="font-mono">{(a.student_domains as string[]).map((d) => "@" + d).join(", ")}</span>
                </p>
                <p className="text-[0.9rem]">
                  Applicant: {p?.full_name || "—"} <span className="font-mono text-[0.82rem] text-muted">{p?.email}</span>, {a.applicant_role}
                </p>
                {a.applicant_note && <p className="text-[0.9rem] text-muted">{a.applicant_note}</p>}
                <p className="text-[0.84rem] text-muted">
                  Check that the applicant&apos;s email or role plausibly ties them to the institution and that the domains are really its own.
                </p>
                <DecideButtons institutionId={a.id} />
              </article>
            );
          })
        )}
      </section>

      <section className="grid gap-3">
        <h2 className="text-[1.25rem] font-bold">Institutions</h2>
        {st.by_institution.length === 0 ? (
          <p className="text-muted">None live yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-[10px] border border-line bg-surface">
            <table className="w-full border-collapse text-[0.88rem]">
              <thead>
                <tr>{["Institution", "Alumni", "Waiting", "Students", "Completed sessions", ""].map((h) => <th key={h} className="label-cap border-b border-line px-3 py-2 text-left">{h}</th>)}</tr>
              </thead>
              <tbody>
                {st.by_institution.map((i) => (
                  <tr key={i.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2">{i.name}</td>
                    <td className="px-3 py-2 font-mono tabular">{i.alumni}</td>
                    <td className="px-3 py-2 font-mono tabular">{i.alumni_pending}</td>
                    <td className="px-3 py-2 font-mono tabular">{i.students}</td>
                    <td className="px-3 py-2 font-mono tabular">{i.completed}</td>
                    <td className="px-3 py-2"><Link href={`/org/${i.slug}`}>Open</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {rejected.length > 0 && (
        <section className="grid gap-2">
          <h2 className="text-[1.1rem] font-bold">Not approved</h2>
          <ul className="grid gap-1 text-[0.9rem]">
            {rejected.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3">
                {a.name} <DecideButtons institutionId={a.id} reopen />
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-[0.86rem] text-muted">
        Platform admins: {(admins ?? []).map((a) => a.email).join(", ")}. To change this list, edit{" "}
        <span className="font-mono">public.platform_admin_emails</span> in Supabase.
      </p>
    </>
  );
}
