import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getViewer, homeFor } from "@/lib/viewer";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/invite";
import { LoginPanel } from "./LoginPanel";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string; error?: string; invite?: string; inst?: string; next?: string }>;
}) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const v = await getViewer();
  if (v) redirect(next !== "/" ? next : homeFor(v));

  let instName = "";
  if (sp.inst) {
    const supabase = await createClient();
    const { data } = await supabase.from("institutions").select("name").eq("slug", sp.inst).maybeSingle();
    instName = data?.name ?? "";
  }

  return (
    <section className="grid max-w-xl gap-4">
      <h1 className="text-[1.6rem] font-bold">Sign in</h1>
      {sp.error && (
        <p role="alert" className="rounded-lg bg-bad-soft px-4 py-3 text-[0.92rem]">
          {sp.error === "browser"
            ? "That sign-in link was opened in a different browser from the one you requested it in (email apps often use their own browser). Request a new link and open it in this browser, or copy the link from the email and paste it here."
            : "That sign-in link didn't work. Links work once and expire after an hour. Request a new one below."}
        </p>
      )}
      {sp.invite === "ok" && (
        <p role="status" className="rounded-lg bg-ok-soft px-4 py-3 text-[0.92rem]">
          You've been invited as a mentor{instName ? <> for <b>{instName}</b></> : null}. Sign in and fill in your profile,
          and you can open slots straight away, with no approval wait.
        </p>
      )}
      {sp.invite === "expired" && (
        <p role="alert" className="rounded-lg bg-amber-soft px-4 py-3 text-[0.92rem]">
          That invite link has expired or been used up. You can still sign up below; the institution's organizers will
          review your profile.
        </p>
      )}
      <LoginPanel initial={sp.as === "alumni" || sp.invite ? "alumni" : "student"} next={next} />
    </section>
  );
}
