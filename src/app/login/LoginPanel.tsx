"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { NEXT_COOKIE, safeNext } from "@/lib/invite";

type Who = "student" | "alumni";

export function LoginPanel({ initial, next }: { initial: Who; next?: string }) {
  const [who, setWho] = useState<Who>(initial);
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const addr = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) return setErr("Enter a valid email address.");
    setBusy(true);
    // Remember where to go once the link is opened (same browser).
    const dest = safeNext(next);
    document.cookie = `${NEXT_COOKIE}=${encodeURIComponent(dest)}; path=/; max-age=3600; samesite=lax`;
    const { error } = await createClient().auth.signInWithOtp({
      email: addr,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setBusy(false);
    if (error)
      return setErr(
        /rate|too many|security purposes/i.test(error.message)
          ? "Sign-in emails are limited for now. Wait a few minutes and try again, or use a link you've already received."
          : "Couldn't send the link. Try again.",
      );
    setSentTo(addr);
  }

  if (sentTo)
    return (
      <div className="panel">
        <h2 className="text-lg font-bold">Check your inbox</h2>
        <p>
          We sent a sign-in link to <b className="font-mono text-[0.92rem]">{sentTo}</b>. Open it in this browser. It
          expires in an hour. On a phone, if the link opens in your email app, use its menu to open the page in
          Safari or Chrome instead.
        </p>
        <button className="linkbtn justify-self-start" type="button" onClick={() => setSentTo("")}>
          Use a different email
        </button>
      </div>
    );

  return (
    <div className="panel">
      <div className="inline-flex justify-self-start rounded-full border border-line bg-sunk p-0.5" role="tablist" aria-label="I am">
        {(["student", "alumni"] as const).map((w) => (
          <button
            key={w}
            type="button"
            role="tab"
            aria-selected={who === w}
            onClick={() => { setWho(w); setErr(""); }}
            className={`rounded-full px-4 py-1 text-[0.86rem] ${who === w ? "bg-surface font-semibold text-ink" : "text-muted"}`}
          >
            {w === "student" ? "Student" : "Alumni or organizer"}
          </button>
        ))}
      </div>

      <p className="text-[0.9rem] text-muted">
        {who === "student"
          ? "Use your institution email (for example name@college.edu). That's how we know which institution you belong to."
          : "Use any email you check. Alumni describe themselves in a few lines (or upload a resume) and we fill in the profile."}
      </p>

      <form onSubmit={sendLink} className="grid gap-3" noValidate>
        <div className="field">
          <label htmlFor="email" className="field-label">
            {who === "student" ? "Your institution email" : "Email"}
          </label>
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={who === "student" ? "yourname@college.edu" : "you@example.com"}
          />
        </div>
        {err && <p role="alert" className="err">{err}</p>}
        <button className="btn justify-self-start" type="submit" disabled={busy}>
          {busy ? "Sending…" : "Email me a sign-in link"}
        </button>
      </form>
    </div>
  );
}
