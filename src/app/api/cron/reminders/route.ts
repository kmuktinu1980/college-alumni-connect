import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendReminderEmails } from "@/lib/email";

export const maxDuration = 60;

// Vercel Cron calls this once a day (see vercel.json) with
// "Authorization: Bearer $CRON_SECRET". It emails both people about every
// session in the next 24 hours that hasn't had a reminder yet.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createAdminClient();
  const now = new Date();
  const until = new Date(now.getTime() + 24 * 3600 * 1000);
  const { data, error } = await db
    .from("bookings")
    .select("id")
    .eq("status", "booked")
    .is("reminder_sent_at", null)
    .gt("starts_at", now.toISOString())
    .lte("starts_at", until.toISOString())
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = 0;
  for (const { id } of data ?? []) {
    try {
      await sendReminderEmails(id);
      await db.from("bookings").update({ reminder_sent_at: new Date().toISOString() }).eq("id", id);
      sent++;
    } catch (e) {
      console.error("reminder failed", id, e);
    }
  }
  return NextResponse.json({ sent });
}
