import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getViewer } from "@/lib/viewer";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadInstitutions, pendingInvite } from "@/lib/institutions";
import { StudentProfileForm } from "@/components/StudentProfileForm";
import { AlumniProfileEditor } from "@/components/AlumniProfileEditor";
import { MembershipsPanel } from "@/components/MembershipsPanel";
import type { InstitutionOption } from "@/components/InstitutionFields";

export const metadata: Metadata = { title: "My profile" };

export default async function ProfilePage() {
  const v = await getViewer();
  if (!v) redirect("/login");
  const { profile } = v;
  if (!profile.role || (profile.role === "student" && !v.studentOf)) redirect("/onboarding");

  if (profile.role === "student") {
    const [{ data: s }, { data: opts }] = await Promise.all([
      v.supabase
        .from("student_profiles")
        .select("institution_id, program, department, year_of_study, project_title, project_summary, seeking")
        .eq("user_id", v.user.id)
        .single(),
      v.supabase.rpc("my_student_options"),
    ]);
    const options = (opts ?? []) as InstitutionOption[];
    // Keep their current institution selectable even if their email no longer matches it.
    if (v.studentOf && !options.some((o) => o.id === v.studentOf!.id)) options.unshift(v.studentOf);
    return (
      <section className="grid gap-3.5">
        <h1 className="text-[1.6rem] font-bold">My profile</h1>
        <p className="lede">Alumni see this when you book them. Keep your project current so they can prepare.</p>
        <StudentProfileForm
          isNew={false}
          institutions={options}
          initial={{
            institutionId: s?.institution_id ?? "",
            fullName: profile.full_name,
            program: s?.program ?? "",
            department: s?.department ?? "",
            year: s?.year_of_study ?? "",
            projectTitle: s?.project_title ?? "",
            projectSummary: s?.project_summary ?? "",
            seeking: s?.seeking ?? "",
          }}
        />
      </section>
    );
  }

  // The meeting link isn't readable through the user's own client (column privacy), so read it server-side.
  const [{ data: a }, institutions, invite] = await Promise.all([
    createAdminClient().from("alumni_profiles").select("*").eq("user_id", v.user.id).single(),
    loadInstitutions(v.supabase),
    pendingInvite(v.supabase, v.user.email ?? ""),
  ]);

  return (
    <section className="grid gap-3.5">
      <h1 className="text-[1.6rem] font-bold">My profile</h1>
      <p className="lede">
        {v.mentorReady
          ? "This is what students see when you're suggested as a mentor."
          : "Your institution's organizers are reviewing your profile. You can still make changes."}
      </p>
      <MembershipsPanel
        memberships={v.memberships}
        institutions={institutions}
        defaultInstitution={invite && !v.memberships.some((m) => m.id === invite.institutionId) ? invite.institutionId : ""}
      />
      <AlumniProfileEditor
        isNew={false}
        initial={{
          fullName: profile.full_name,
          gradYear: "",
          degree: "",
          department: "",
          jobTitle: a?.job_title ?? "",
          organization: a?.organization ?? "",
          city: a?.city ?? "",
          linkedinUrl: a?.linkedin_url ?? "",
          meetingLink: a?.meeting_link ?? "",
          skills: a?.skills ?? [],
          adviceAreas: a?.advice_areas ?? [],
          bio: a?.bio ?? "",
          visible: a?.visible ?? true,
        }}
      />
    </section>
  );
}
