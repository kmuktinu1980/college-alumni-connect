import type { Metadata } from "next";
import { requireViewer } from "@/lib/viewer";
import { SlotManager, type SlotRow } from "./SlotManager";
import { SlotSetup } from "./SlotSetup";

export const metadata: Metadata = { title: "My availability" };

export default async function AvailabilityPage() {
  const v = await requireViewer({ role: "alumni" });
  const nowIso = new Date().toISOString();

  const [{ data: slots }, { data: bookings }, { data: me }, { data: missing }] = await Promise.all([
    v.supabase
      .from("slots")
      .select("id, starts_at, duration_min, is_booked")
      .eq("alumni_id", v.user.id)
      .gt("starts_at", new Date(Date.now() - 60 * 60000).toISOString())
      .order("starts_at"),
    v.supabase
      .from("bookings")
      .select("slot_id, student_id")
      .eq("alumni_id", v.user.id)
      .eq("status", "booked")
      .gt("starts_at", nowIso),
    v.supabase.from("alumni_profiles").select("visible, skills").eq("user_id", v.user.id).single(),
    v.supabase.rpc("slot_setup_missing"),
  ]);
  const need = new Set((missing as string[] | null) ?? []);
  if (need.size)
    return (
      <section className="grid gap-3.5">
        <h1 className="text-[1.6rem] font-bold">My availability</h1>
        <SlotSetup needLink={need.has("meeting_link")} needSkills={need.has("skills")} skills={(me?.skills as string[] | null) ?? []} />
      </section>
    );

  const studentIds = [...new Set((bookings ?? []).map((b) => b.student_id))];
  const [{ data: names }, { data: projects }] = studentIds.length
    ? await Promise.all([
        v.supabase.from("profiles").select("id, full_name").in("id", studentIds),
        v.supabase.from("student_profiles").select("user_id, project_title").in("user_id", studentIds),
      ])
    : [{ data: [] }, { data: [] }];
  const nameOf = new Map((names ?? []).map((n) => [n.id, n.full_name]));
  const projOf = new Map((projects ?? []).map((p) => [p.user_id, p.project_title]));
  const bySlot = new Map((bookings ?? []).map((b) => [b.slot_id, b.student_id]));

  const rows: SlotRow[] = (slots ?? []).map((s) => {
    const sid = bySlot.get(s.id);
    return {
      id: s.id,
      starts_at: s.starts_at,
      duration_min: s.duration_min,
      booked: s.is_booked,
      bookedBy: sid ? `${nameOf.get(sid) || "A student"}${projOf.get(sid) ? " · " + projOf.get(sid) : ""}` : null,
    };
  });

  return <SlotManager rows={rows} hidden={me?.visible === false} />;
}
