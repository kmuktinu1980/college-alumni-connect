import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getViewer, homeFor } from "@/lib/viewer";
import { loadInstitutions, pendingInvite } from "@/lib/institutions";
import { MembershipsPanel } from "@/components/MembershipsPanel";

export const metadata: Metadata = { title: "Awaiting approval" };

export default async function Pending() {
  const v = await getViewer();
  if (!v) redirect("/login");
  if (v.profile.role !== "alumni" || v.mentorReady) redirect(homeFor(v));
  const [institutions, invite] = await Promise.all([loadInstitutions(v.supabase), pendingInvite(v.supabase, v.user.email ?? "")]);
  const waiting = v.memberships.some((m) => m.status === "pending");

  return (
    <section className="grid max-w-3xl gap-4">
      <h1 className="text-[1.6rem] font-bold">Thanks for volunteering</h1>
      <p className="lede">
        {waiting ? (
          <>
            Your institution&apos;s organizers confirm every new alumnus before students can see them, usually within a day
            or two. We&apos;ll email you at <span className="font-mono text-ink">{v.user.email}</span> as soon as
            you&apos;re approved, and then you can open slots on your calendar.
          </>
        ) : v.memberships.length ? (
          "None of your institutions have approved you yet. If that's a mistake, contact their organizers, or add another institution you graduated from."
        ) : (
          "Add the institution you graduated from so its students can find you."
        )}
      </p>
      <MembershipsPanel
        memberships={v.memberships}
        institutions={institutions}
        defaultInstitution={invite && !v.memberships.some((m) => m.id === invite.institutionId) ? invite.institutionId : ""}
      />
      <div className="flex flex-wrap gap-3">
        <Link href="/profile" className="btn btn-quiet">Review my profile</Link>
      </div>
    </section>
  );
}
