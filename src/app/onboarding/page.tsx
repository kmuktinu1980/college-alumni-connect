import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getViewer, homeFor } from "@/lib/viewer";
import { loadInstitutions, pendingInvite } from "@/lib/institutions";
import { StudentProfileForm } from "@/components/StudentProfileForm";
import { AlumniProfileEditor } from "@/components/AlumniProfileEditor";
import type { InstitutionOption } from "@/components/InstitutionFields";

export const metadata: Metadata = { title: "Join" };

function Stepper({ active, invited }: { active: 1 | 2; invited: boolean }) {
  const steps = invited ? ["Your profile", "Open slots"] : ["Your profile", "Institution approval", "Open slots"];
  return (
    <ol className="flex flex-wrap gap-x-5 gap-y-2 text-[0.86rem] text-muted" aria-label="Alumni setup">
      {steps.map((l, i) => (
        <li key={l} className={`inline-flex items-center gap-2 ${i + 1 === active ? "font-semibold text-ink" : ""}`}
          aria-current={i + 1 === active ? "step" : undefined}>
          <span className={`grid h-[22px] w-[22px] place-items-center rounded-full border font-mono text-[0.76rem] ${
            i + 1 === active ? "border-river bg-river text-river-ink" : "border-line"}`}>{i + 1}</span>
          {l}
        </li>
      ))}
    </ol>
  );
}

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ as?: string }> }) {
  const v = await getViewer();
  if (!v) redirect("/login");
  const { profile } = v;
  // Already set up: students with an institution, and alumni (who add institutions from /profile).
  if ((profile.role === "student" && v.studentOf) || profile.role === "alumni") redirect(homeFor(v));

  const email = v.user.email ?? "";
  const domain = email.split("@")[1] ?? "";
  const [{ data: opts }, institutions, invite] = await Promise.all([
    v.supabase.rpc("my_student_options"),
    loadInstitutions(v.supabase),
    pendingInvite(v.supabase, email),
  ]);
  const studentOptions = (opts ?? []) as InstitutionOption[];
  const sp = await searchParams;
  const as =
    sp.as === "student" || sp.as === "alumni" ? sp.as : studentOptions.length && !invite ? "student" : "alumni";
  const metaName = String(v.user.user_metadata?.full_name ?? v.user.user_metadata?.name ?? "");
  const isOrganizerOnly = profile.is_admin || v.organizes.length > 0;

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-[1.6rem] font-bold">{as === "student" ? "Your student profile" : "Your alumni profile"}</h1>
        <span className="text-[0.84rem] text-muted">
          Signed in as <span className="font-mono">{email}</span>
        </span>
      </div>

      {isOrganizerOnly && (
        <p className="rounded-lg bg-sunk px-4 py-3 text-[0.9rem]">
          You {profile.is_admin ? "run the platform" : "organize an institution"}, so you don't need a profile.{" "}
          <Link href={profile.is_admin ? "/admin" : `/org/${v.organizes[0].slug}`}>Go to the organizer view</Link>, or
          create a mentor profile below if you're also an alumnus.
        </p>
      )}

      {as === "student" && !studentOptions.length ? (
        <div className="empty">
          <b className="text-ink">
            {domain ? <>No institution on Alumni Connect uses <span className="font-mono">@{domain}</span> emails yet</> : "No institution found for your email"}
          </b>
          <span>
            Sign out and sign back in with your institution email. If your institution isn&apos;t on Alumni Connect yet,
            ask your placement office or alumni cell to apply, or ask its organizers to add your email.
          </span>
          <div className="flex flex-wrap gap-3">
            <Link href="/institutions/apply">Bring your institution on board</Link>
            <Link href="/onboarding?as=alumni">I&apos;m an alumnus</Link>
          </div>
        </div>
      ) : as === "student" ? (
        <>
          <p className="lede">Tell alumni what you&apos;re working on. The clearer your question, the better your matches.</p>
          <StudentProfileForm
            isNew
            institutions={studentOptions}
            initial={{
              institutionId: studentOptions.length === 1 ? studentOptions[0].id : "",
              fullName: metaName, program: "", department: "", year: "", projectTitle: "", projectSummary: "", seeking: "",
            }}
          />
          <p className="text-[0.9rem] text-muted">
            Graduated already? <Link href="/onboarding?as=alumni">Set up a mentor profile instead</Link>
          </p>
        </>
      ) : (
        <>
          <Stepper active={1} invited={!!invite} />
          <p className="lede">
            Describe yourself in a few lines, or upload your resume, and we&apos;ll fill in the form. Then check the
            details. Students of your institution see this when they&apos;re matched with you.{" "}
            {invite
              ? `You've been invited by ${invite.name}, so you can open slots as soon as you save.`
              : "Your institution's organizers confirm new alumni, then you open slots on your calendar."}
          </p>
          {institutions.length ? (
            <AlumniProfileEditor
              isNew
              institutions={institutions}
              defaultInstitution={invite?.institutionId ?? ""}
              initial={{
                fullName: metaName, gradYear: "", degree: "", department: "", jobTitle: "", organization: "", city: "",
                linkedinUrl: "", meetingLink: "", skills: [], adviceAreas: [], bio: "", visible: true,
              }}
            />
          ) : (
            <div className="empty">
              <b className="text-ink">No institutions have joined yet</b>
              <span>Alumni Connect opens to alumni once their institution is on board.</span>
            </div>
          )}
          {studentOptions.length > 0 && (
            <p className="text-[0.9rem] text-muted">
              Current student? <Link href="/onboarding?as=student">Create a student profile instead</Link>
            </p>
          )}
        </>
      )}
      <p className="text-[0.9rem] text-muted">
        Institution not listed? <Link href="/institutions/apply">Apply to bring it onto Alumni Connect</Link>.
      </p>
    </section>
  );
}
