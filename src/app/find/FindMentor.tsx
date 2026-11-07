"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Mentor } from "@/lib/directory";
import { bookSlot } from "@/app/actions";
import { MAX_UPCOMING_BOOKINGS, MIN_NOTICE_HOURS } from "@/lib/constants";
import { MIN_BRIEF_CHARS } from "@/lib/brief-rules";
import { batchLabel } from "@/lib/time";
import { LocalTime } from "@/components/LocalTime";
import { Field, FormError } from "@/components/Field";

type Match = { id: string; score: number; reason: string };
type Pending = { mentorId: string; slotId: string; where: "match" | "browse" };

export function FindMentor({
  mentors,
  institution,
  bookedWith,
  upcomingCount,
  smart,
  defaults,
}: {
  mentors: Mentor[];
  institution: string;
  bookedWith: Record<string, string>;
  upcomingCount: number;
  smart: boolean;
  defaults: { project: string; summary: string; seeking: string };
}) {
  const [project, setProject] = useState(defaults.project);
  const [summary, setSummary] = useState(defaults.summary);
  const [seeking, setSeeking] = useState(defaults.seeking);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "thinking" | "error">("idle");
  const [pending, setPending] = useState<Pending | null>(null);
  const [q, setQ] = useState("");
  const abort = useRef<AbortController | null>(null);

  const byId = useMemo(() => new Map(mentors.map((m) => [m.id, m])), [mentors]);
  const atLimit = upcomingCount >= MAX_UPCOMING_BOOKINGS;

  async function runMatch(e: React.FormEvent) {
    e.preventDefault();
    if (!project.trim() && !seeking.trim()) {
      setState("error");
      setNote("Add your project or what you want advice on first.");
      return;
    }
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setState("thinking");
    setPending(null);
    setNote("");
    try {
      const res = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project, summary, seeking }),
        signal: ctl.signal,
      });
      const data = await res.json();
      if (!res.ok) {
        setState("error");
        setNote(data.error ?? "Matching didn't work. Try again.");
        return;
      }
      setMatches(data.matches as Match[]);
      setNote(data.note ?? "");
      setState("idle");
    } catch (err) {
      if ((err as Error).name === "AbortError") return setState("idle");
      setState("error");
      setNote("Couldn't reach the server. Check your connection and try again.");
    }
  }

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return mentors;
    return mentors.filter((m) =>
      [m.name, m.job_title, m.organization, m.city, m.department, m.skills.join(" "), m.advice_areas.join(" "), m.bio]
        .join(" ")
        .toLowerCase()
        .includes(t),
    );
  }, [q, mentors]);

  const card = (m: Mentor, where: Pending["where"], match?: Match, top?: boolean) => (
    <MentorCard
      key={`${where}-${m.id}`}
      mentor={m}
      match={match}
      top={top}
      bookedAt={bookedWith[m.id]}
      atLimit={atLimit}
      pendingSlot={pending?.mentorId === m.id && pending.where === where ? pending.slotId : null}
      onPick={(slotId) => setPending({ mentorId: m.id, slotId, where })}
      onCancel={() => setPending(null)}
      defaultTopic={seeking}
    />
  );

  return (
    <>
      <section className="grid gap-3.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-[1.6rem] font-bold">Find a mentor</h1>
          <span className="font-mono text-[0.8rem] text-muted">
            {mentors.length} {institution} {mentors.length === 1 ? "alumnus" : "alumni"} volunteering
          </span>
        </div>
        <p className="lede">
          Start from your profile, adjust the question for this session, and get alumni ranked by how well their
          experience fits. Sessions are booked at least {MIN_NOTICE_HOURS} hours ahead so mentors have time to prepare.
        </p>
        {atLimit && (
          <p className="rounded-lg bg-amber-soft px-4 py-3 text-[0.92rem]">
            You have {MAX_UPCOMING_BOOKINGS} upcoming sessions, the most you can hold at once. You can book again after
            one is done or cancelled.
          </p>
        )}
        <form className="panel" onSubmit={runMatch} noValidate>
          <Field id="f-project" label="Project">
            <input id="f-project" className="input" value={project} onChange={(e) => setProject(e.target.value)} />
          </Field>
          <Field id="f-summary" label="Project summary">
            <textarea id="f-summary" className="input" value={summary} onChange={(e) => setSummary(e.target.value)} />
          </Field>
          <Field id="f-seeking" label="What do you want advice on?">
            <textarea id="f-seeking" className="input" value={seeking} onChange={(e) => setSeeking(e.target.value)} />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn" type="submit" disabled={state === "thinking"}>Suggest mentors</button>
            <span className="text-[0.8rem] text-muted">
              {smart ? "Reads every alumni profile against your project." : "Ranks alumni by overlap with your project and question."}
            </span>
          </div>
        </form>

        <div className="grid gap-3.5" aria-live="polite">
          {state === "thinking" && (
            <div className="flex items-center gap-3 text-muted">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-river" />
              Reading {mentors.length} alumni profiles against your project…
              <button className="btn btn-quiet btn-sm" type="button" onClick={() => abort.current?.abort()}>Stop</button>
            </div>
          )}
          {state === "error" && <p className="err">{note}</p>}
          {state === "idle" && matches && (
            <>
              {note && <p className="text-[0.86rem] text-muted">{note}</p>}
              {matches.filter((m) => byId.has(m.id)).length === 0 ? (
                <div className="empty">
                  <b className="text-ink">No strong match yet</b>
                  <span>Try a more specific question, or browse everyone below. New alumni join regularly.</span>
                </div>
              ) : (
                matches.filter((m) => byId.has(m.id)).map((m, i) => card(byId.get(m.id)!, "match", m, i === 0))
              )}
            </>
          )}
        </div>
      </section>

      <section className="grid gap-3.5">
        <h2 className="text-[1.45rem] font-bold">Browse all mentors</h2>
        <div className="field max-w-md">
          <label htmlFor="browse-q" className="label-cap">Filter</label>
          <input id="browse-q" type="search" className="input" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Name, skill, company or area" />
        </div>
        {filtered.length ? (
          <div className="grid items-start gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,310px),1fr))]">
            {filtered.map((m) => card(m, "browse"))}
          </div>
        ) : (
          <div className="empty">
            <b className="text-ink">{q ? "No alumni match that filter" : `No ${institution} alumni have joined yet`}</b>
            <span>{q ? "Try a broader word, like a field or a company." : "Once your institution's alumni sign up and open slots, they'll show here. Your organizers can share an invite link with alumni groups."}</span>
          </div>
        )}
      </section>
    </>
  );
}

function MentorCard({
  mentor: m,
  match,
  top,
  bookedAt,
  atLimit,
  pendingSlot,
  onPick,
  onCancel,
  defaultTopic,
}: {
  mentor: Mentor;
  match?: Match;
  top?: boolean;
  bookedAt?: string;
  atLimit: boolean;
  pendingSlot: string | null;
  onPick: (slotId: string) => void;
  onCancel: () => void;
  defaultTopic: string;
}) {
  const first = m.name.split(" ")[0];
  const slots = m.slots.slice(0, 8);
  const initials = m.name.split(/\s+/).slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase();
  const chosen = pendingSlot ? m.slots.find((s) => s.id === pendingSlot) : null;

  return (
    <article className={`card ${top ? "border-river" : ""}`}>
      <div className="grid grid-cols-[auto_1fr_auto] items-start gap-3">
        <div aria-hidden className="grid h-[42px] w-[42px] place-items-center rounded-full bg-river-soft font-display font-bold text-river">
          {initials}
        </div>
        <div className="grid min-w-0 gap-px">
          <h3 className="text-[1.08rem] font-bold">{m.name}</h3>
          <p className="text-[0.9rem]">{[m.job_title, m.organization].filter(Boolean).join(" · ")}</p>
          <p className="font-mono text-[0.78rem] text-muted">{batchLabel(m)}{m.city ? ` · ${m.city}` : ""}</p>
        </div>
        {match && (
          <div className="rounded-lg bg-amber-soft px-2.5 py-1 text-center leading-tight text-amber" title="How well this mentor fits your request">
            <span className="block font-mono text-lg font-medium">{match.score}</span>
            <small className="text-[0.66rem] uppercase tracking-[0.08em]">fit</small>
          </div>
        )}
      </div>
      {match?.reason && <p className="border-l-2 border-amber pl-2.5 text-[0.92rem]">{match.reason}</p>}
      {m.skills.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Skills">
          {m.skills.slice(0, 10).map((s) => <li key={s} className="chip">{s}</li>)}
        </ul>
      )}
      {m.advice_areas.length > 0 && <p className="text-[0.84rem] text-muted">Advises on {m.advice_areas.join(", ")}</p>}
      {m.bio && (
        <details>
          <summary className="cursor-pointer text-[0.84rem] font-semibold text-river">About {first}</summary>
          <p className="mt-1.5 text-[0.9rem]">{m.bio}</p>
        </details>
      )}

      {bookedAt ? (
        <p className="text-[0.86rem] text-muted">
          You're booked with {first} on <LocalTime iso={bookedAt} />. One upcoming session per mentor keeps slots open for others.
        </p>
      ) : (
        <div className="grid gap-1.5">
          <p className="label-cap">{slots.length ? "Open slots · your time" : "No open slots right now"}</p>
          {slots.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {slots.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  disabled={atLimit}
                  aria-pressed={pendingSlot === s.id}
                  onClick={() => onPick(s.id)}
                  className={`rounded-lg border px-2.5 py-1.5 text-left text-[0.8rem] leading-tight disabled:cursor-not-allowed disabled:opacity-55 ${
                    pendingSlot === s.id ? "border-river bg-river-soft" : "border-line bg-bg hover:border-river"
                  }`}
                >
                  <b className="block font-semibold"><LocalTime iso={s.starts_at} mode="day" /></b>
                  <LocalTime iso={s.starts_at} mode="time" /> · {s.duration_min}m
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {chosen && <ConfirmBooking key={chosen.id} slot={chosen} mentorFirst={first} defaultTopic={defaultTopic} onCancel={onCancel} />}

      {m.linkedin_url && (
        <a href={m.linkedin_url} target="_blank" rel="noopener noreferrer" className="justify-self-start text-[0.84rem]">
          LinkedIn ↗
        </a>
      )}
    </article>
  );
}

function ConfirmBooking({
  slot,
  mentorFirst,
  defaultTopic,
  onCancel,
}: {
  slot: Mentor["slots"][number];
  mentorFirst: string;
  defaultTopic: string;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [topic, setTopic] = useState(defaultTopic);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [review, setReview] = useState<{ feedback: string; suggestion: string; topic: string } | null>(null);
  const [busy, start] = useTransition();
  const topicRef = useRef<HTMLTextAreaElement>(null);
  const len = topic.trim().length;

  function submit(bookAsWritten: boolean) {
    setErr("");
    if (!topic.trim()) return setErr("Add what you want to cover so your mentor can prepare.");
    if (len < MIN_BRIEF_CHARS) return setErr(`Add a little more: at least ${MIN_BRIEF_CHARS} characters so your mentor can prepare.`);
    if (/\[[^\]]{3,}\]/.test(topic)) return setErr("Fill in the parts in [brackets] first.");
    start(async () => {
      const r = await bookSlot({ slotId: slot.id, topic, note, bookAsWritten });
      if (r.ok) return router.push(`/sessions?booked=${r.bookingId}`);
      if ("needsWork" in r) return setReview({ feedback: r.feedback, suggestion: r.suggestion, topic });
      setErr(r.error);
      router.refresh(); // pick up slots others just took
    });
  }

  function applySuggestion() {
    if (!review) return;
    setTopic(review.suggestion);
    setReview(null);
    // Put the cursor on the first [placeholder] so it's quick to fill in.
    requestAnimationFrame(() => {
      const el = topicRef.current;
      if (!el) return;
      el.focus();
      const i = review.suggestion.indexOf("[");
      const j = i >= 0 ? review.suggestion.indexOf("]", i) : -1;
      if (i >= 0 && j > i) el.setSelectionRange(i, j + 1);
    });
  }

  // Editing after feedback means the next submit is checked again.
  const edited = review && topic !== review.topic;

  return (
    <div className="grid gap-2.5 rounded-lg bg-river-soft p-3.5">
      <p>
        <b><LocalTime iso={slot.starts_at} mode="day" />, <LocalTime iso={slot.starts_at} mode="timeTz" /></b> · {slot.duration_min} min{" "}
      </p>
      <div className="field">
        <label htmlFor={`topic-${slot.id}`} className="field-label">What do you want to cover?</label>
        <textarea ref={topicRef} id={`topic-${slot.id}`} className="input min-h-[110px]" value={topic} autoFocus
          onChange={(e) => setTopic(e.target.value)}
          placeholder="The specific question or decision, and what you've tried so far. e.g. Our sensor's battery lasts 4 days even with duty cycling. What should I measure next to find where the power goes?" />
        <span className="hint">
          {mentorFirst} reads this to prepare. A concrete question and a line of context makes the session far more useful.
          {len > 0 && len < MIN_BRIEF_CHARS && <span className="tabular"> ({len}/{MIN_BRIEF_CHARS})</span>}
        </span>
      </div>

      {review && (
        <div role="status" className="grid gap-2.5 rounded-lg border border-amber/40 bg-amber-soft p-3.5">
          <p className="label-cap !text-amber">Make it easier to prepare for</p>
          <p className="text-[0.92rem]">{review.feedback}</p>
          {review.suggestion && (
            <>
              <p className="text-[0.84rem] text-muted">A sharper version. Fill in the parts in [brackets]:</p>
              <blockquote className="whitespace-pre-wrap rounded-md bg-surface px-3 py-2 text-[0.9rem]">{review.suggestion}</blockquote>
            </>
          )}
          <div className="flex flex-wrap gap-2.5">
            {review.suggestion && (
              <button className="btn btn-sm" type="button" onClick={applySuggestion}>Use this and edit</button>
            )}
            {!edited && (
              <button className="btn btn-quiet btn-sm" type="button" disabled={busy} onClick={() => submit(true)}>
                Book as written
              </button>
            )}
          </div>
        </div>
      )}

      <Field id={`note-${slot.id}`} label={`Note for ${mentorFirst} (optional)`}>
        <input id={`note-${slot.id}`} className="input" value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. I'll share my GitHub repo before the call" />
      </Field>
      {err && <FormError message={err} />}
      <div className="flex flex-wrap gap-2.5">
        <button className="btn" type="button" disabled={busy || (!!review && !edited)} onClick={() => submit(false)}>
          {busy ? "Checking…" : review ? "Check again and book" : "Confirm booking"}
        </button>
        <button className="btn btn-quiet" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
