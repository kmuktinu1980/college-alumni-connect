import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getViewer } from "@/lib/viewer";
import { ApplyForm } from "./ApplyForm";

export const metadata: Metadata = { title: "Bring your institution" };

export default async function ApplyPage() {
  const v = await getViewer();
  if (!v) redirect("/login?as=alumni&next=/institutions/apply");
  const { data: mine } = await v.supabase
    .from("institutions")
    .select("id, name, status")
    .eq("applicant_id", v.user.id)
    .order("created_at", { ascending: false });

  return (
    <section className="grid max-w-3xl gap-4">
      <h1 className="text-[1.6rem] font-bold">Bring your institution onto Alumni Connect</h1>
      <p className="lede">
        Anyone who runs alumni or student programs can apply: a placement office, alumni relations, a faculty advisor or
        an alumni association. Once we approve it, you become its organizer: you invite alumni, confirm who joins, and
        see how mentoring is going. Students join with their institution email.
      </p>
      {(mine ?? []).length > 0 && (
        <ul className="grid gap-1 text-[0.92rem]">
          {(mine ?? []).map((i) => (
            <li key={i.id}>
              You applied for <b>{i.name}</b>:{" "}
              {i.status === "pending" ? "under review" : i.status === "approved" ? "approved" : "not approved"}.
            </li>
          ))}
        </ul>
      )}
      <ApplyForm email={v.user.email ?? ""} />
    </section>
  );
}
