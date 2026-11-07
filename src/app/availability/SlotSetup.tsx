"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveSlotSetup } from "@/app/actions";
import { Field, FormError } from "@/components/Field";

/** Asked once, before a mentor's first slot: the meeting link and some skills. */
export function SlotSetup({ needLink, needSkills, skills }: { needLink: boolean; needSkills: boolean; skills: string[] }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setErr("");
    start(async () => {
      const r = await saveSlotSetup({
        meetingLink: String(f.get("meetingLink") ?? "").trim(),
        skills: String(f.get("skills") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      });
      if (!r.ok) return setErr(r.error);
      router.refresh();
    });
  }

  return (
    <form className="panel border-river/40" onSubmit={submit} noValidate>
      <div className="grid gap-1">
        <h2 className="text-lg font-bold">One step before your first slot</h2>
        <p className="text-[0.9rem] text-muted">
          {needLink && needSkills
            ? "Add the link students will join, and a few skills so they can find you."
            : needLink
              ? "Add the link students will join."
              : "Add a few skills so students can find you."}
        </p>
      </div>
      {needLink && <Field id="meetingLink" label="Your meeting link"
        hint="Only students who book you see this. A personal Zoom room or a Google Meet link you reuse works best.">
        <input className="input" id="meetingLink" name="meetingLink" type="url" inputMode="url"
          placeholder="https://meet.google.com/… or https://zoom.us/j/…" />
      </Field>}
      <Field id="skills" label="Skills and expertise" hint="Separate with commas. Matching weighs these most.">
        <input className="input" id="skills" name="skills" defaultValue={skills.join(", ")}
          placeholder="Embedded systems, Android, product strategy, fundraising" />
      </Field>
      {err && <FormError message={err} />}
      <button className="btn justify-self-start" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save and open slots"}
      </button>
    </form>
  );
}
