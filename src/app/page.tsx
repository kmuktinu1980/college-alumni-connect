import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer, homeFor } from "@/lib/viewer";
import { createClient } from "@/lib/supabase/server";
import { loadInstitutions } from "@/lib/institutions";

export default async function Landing() {
  const v = await getViewer();
  if (v) redirect(homeFor(v));
  const institutions = await loadInstitutions(await createClient());

  return (
    <>
      <section className="grid gap-4 pt-4">
        <p className="label-cap">Student–alumni mentoring for every college</p>
        <h1 className="max-w-[20ch] text-4xl font-bold sm:text-5xl">An hour with someone from your college who has done it.</h1>
        <p className="lede text-[1.02rem]">
          Colleges and universities bring their alumni on board. Students describe their project and what they&apos;re
          stuck on, get matched with alumni of their own institution whose experience fits, and book a slot the
          mentor has opened.
        </p>
        <div className="flex flex-wrap gap-3 pt-1">
          <Link href="/login?as=student" className="btn">I&apos;m a student</Link>
          <Link href="/login?as=alumni" className="btn btn-ghost">I&apos;m an alumnus, I want to help</Link>
          <Link href="/institutions/apply" className="btn btn-quiet">Bring my institution</Link>
        </div>
      </section>

      <section className="grid gap-4">
        <p className="label-cap">How it works</p>
        <ol className="grid gap-5 sm:grid-cols-3">
          {[
            ["Institutions join", "A placement office, alumni cell or faculty lead applies. Once approved, they invite alumni and run their own community."],
            ["Alumni open slots", "Mentors describe themselves in a few lines or upload a resume, then open an hour a week. It's only used if a student books it."],
            ["Students book", "Project plus question in, ranked mentor suggestions out. Both people get a calendar invite with the meeting link and the brief."],
          ].map(([t, d], i) => (
            <li key={t} className="grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-1">
              <span className="row-span-2 font-mono font-medium text-river">{i + 1}</span>
              <b className="font-semibold">{t}</b>
              <span className="text-[0.92rem] text-muted">{d}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="panel">
          <h2 className="text-lg font-bold">For students</h2>
          <p className="text-[0.92rem] text-muted">
            Sign in with your institution email. If your institution is on Alumni Connect, you&apos;re in straight away
            and see only your own alumni.
          </p>
        </div>
        <div className="panel">
          <h2 className="text-lg font-bold">For alumni</h2>
          <p className="text-[0.92rem] text-muted">
            Sign in with any email, describe yourself or upload a resume, and pick the institutions you graduated from.
            Each one&apos;s organizers confirm you; invite links skip the wait.
          </p>
        </div>
        <div className="panel">
          <h2 className="text-lg font-bold">For institutions</h2>
          <p className="text-[0.92rem] text-muted">
            Apply with your student email domain. Once approved, you get an organizer page with invite links, approvals
            and session analytics. It&apos;s free.
          </p>
        </div>
      </section>

      {institutions.length > 0 && (
        <section className="grid gap-3">
          <p className="label-cap">On Alumni Connect</p>
          <ul className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr))]">
            {institutions.map((i) => (
              <li key={i.id}>
                <Link href={`/i/${i.slug}`} className="panel gap-0.5 no-underline hover:border-river">
                  <b className="text-ink">{i.name}</b>
                  <span className="text-[0.84rem] text-muted">
                    {[i.city, i.country].filter(Boolean).join(", ")}
                    {i.mentors ? ` · ${i.mentors} ${i.mentors === 1 ? "mentor" : "mentors"}` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
