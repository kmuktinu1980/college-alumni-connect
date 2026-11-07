import type { Metadata } from "next";
import { requireViewer } from "@/lib/viewer";
import { loadDirectory } from "@/lib/directory";
import { FindMentor } from "./FindMentor";

export const metadata: Metadata = { title: "Find a mentor" };

export default async function FindPage() {
  const v = await requireViewer({ role: "student" });

  const [{ data: sp }, mentors, { data: upcoming }] = await Promise.all([
    v.supabase.from("student_profiles").select("project_title, project_summary, seeking").eq("user_id", v.user.id).single(),
    loadDirectory(v.supabase, v.studentOf!.id),
    v.supabase
      .from("bookings")
      .select("alumni_id, starts_at")
      .eq("student_id", v.user.id)
      .eq("status", "booked")
      .gt("starts_at", new Date().toISOString()),
  ]);

  const bookedWith: Record<string, string> = {};
  for (const b of upcoming ?? []) bookedWith[b.alumni_id] = b.starts_at;

  return (
    <FindMentor
      mentors={mentors}
      institution={v.studentOf!.short_name || v.studentOf!.name}
      bookedWith={bookedWith}
      upcomingCount={upcoming?.length ?? 0}
      smart={!!process.env.ANTHROPIC_API_KEY}
      defaults={{ project: sp?.project_title ?? "", summary: sp?.project_summary ?? "", seeking: sp?.seeking ?? "" }}
    />
  );
}
