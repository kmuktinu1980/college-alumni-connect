"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addSlots, removeSlot } from "@/app/actions";
import { DURATIONS, MIN_NOTICE_HOURS } from "@/lib/constants";
import { dayKey } from "@/lib/time";
import { LocalTime, TzName } from "@/components/LocalTime";
import { Field, FormError } from "@/components/Field";

export type SlotRow = { id: string; starts_at: string; duration_min: number; booked: boolean; bookedBy: string | null };

const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function SlotManager({ rows, hidden }: { rows: SlotRow[]; hidden: boolean }) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [minDate, setMinDate] = useState("");
  const [time, setTime] = useState("19:30");
  const [duration, setDuration] = useState<number>(30);
  const [repeat, setRepeat] = useState(1);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, start] = useTransition();

  // Dates depend on the viewer's clock, so set them after mount.
  useEffect(() => {
    const t = new Date();
    const first = new Date(t.getTime() + MIN_NOTICE_HOURS * 3600 * 1000);
    const suggested = new Date(t);
    suggested.setDate(t.getDate() + Math.ceil(MIN_NOTICE_HOURS / 24) + 1);
    setMinDate(isoDate(first));
    setDate((d) => d || isoDate(suggested));
  }, []);


  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setMsg("");
    const base = new Date(`${date}T${time}`);
    if (isNaN(base.getTime())) return setErr("Pick a date and start time.");
    const starts: string[] = [];
    for (let i = 0; i < repeat; i++) {
      const d = new Date(base);
      d.setDate(d.getDate() + 7 * i); // keeps local wall-clock time across daylight-saving changes
      starts.push(d.toISOString());
    }
    start(async () => {
      const r = await addSlots({ starts, duration: duration as 30 | 45 | 60 });
      if (!r.ok) return setErr(r.error);
      const { added = 0, skipped = 0 } = r.data ?? {};
      if (!added)
        return setErr(`Those times are less than ${MIN_NOTICE_HOURS} hours away or overlap slots you already have. Students book at least ${MIN_NOTICE_HOURS} hours ahead.`);
      setMsg(`Added ${added} ${added === 1 ? "slot" : "slots"}.${skipped ? ` Skipped ${skipped} that clashed or were less than ${MIN_NOTICE_HOURS} hours away.` : ""}`);
      router.refresh();
    });
  }

  const upcoming = rows.filter((r) => new Date(r.starts_at).getTime() + r.duration_min * 60000 > Date.now());
  const booked = upcoming.filter((r) => r.booked).length;

  return (
    <>
      <section className="grid gap-3.5">
        <h1 className="text-[1.6rem] font-bold">My availability</h1>
        <p className="lede">
          Open a few slots each month. Students book them first come, first served, at least {MIN_NOTICE_HOURS} hours
          ahead, so you'll always have time to read their brief. Each booking arrives by email with the project brief and
          a calendar invite.
        </p>
        {hidden && (
          <p className="rounded-lg bg-amber-soft px-4 py-3 text-[0.92rem]">
            You're hidden from students. Turn on “Show me to students” in <Link href="/profile">My profile</Link> to get bookings.
          </p>
        )}
        <form className="panel" onSubmit={submit} noValidate>
          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            <Field id="sl-date" label="Date">
              <input id="sl-date" type="date" className="input" min={minDate} value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field id="sl-time" label="Start time">
              <input id="sl-time" type="time" className="input" step={900} value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
            <Field id="sl-dur" label="Length">
              <select id="sl-dur" className="input" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                {DURATIONS.map((n) => <option key={n} value={n}>{n} minutes</option>)}
              </select>
            </Field>
            <Field id="sl-rep" label="Repeat">
              <select id="sl-rep" className="input" value={repeat} onChange={(e) => setRepeat(Number(e.target.value))}>
                <option value={1}>Just this once</option>
                {[2, 4, 6, 8].map((n) => <option key={n} value={n}>Weekly for {n} weeks</option>)}
              </select>
            </Field>
          </div>
          <p className="text-[0.84rem] text-muted">
            Times are in <TzName />. Students see them in their own time zone.
          </p>
          {err && <FormError message={err} />}
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn" type="submit" disabled={busy}>{busy ? "Adding…" : "Add slots"}</button>
            {msg && <span role="status" className="text-[0.88rem] text-ok">{msg}</span>}
          </div>
        </form>
      </section>

      <section className="grid gap-3.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="label-cap">Upcoming slots</p>
          {upcoming.length > 0 && (
            <span className="font-mono text-[0.8rem] text-muted">{upcoming.length - booked} open · {booked} booked</span>
          )}
        </div>
        {upcoming.length === 0 ? (
          <div className="empty">
            <b className="text-ink">No upcoming slots</b>
            <span>Add a slot above. Weekday evenings and weekend mornings in your students' time zone get booked fastest.</span>
          </div>
        ) : (
          <DayGroups rows={upcoming} />
        )}
      </section>
    </>
  );
}

function DayGroups({ rows }: { rows: SlotRow[] }) {
  // Group by the viewer's local day (computed client-side after mount).
  const [groups, setGroups] = useState<SlotRow[][] | null>(null);
  useEffect(() => {
    const days = new Map<string, SlotRow[]>();
    for (const r of rows) {
      const k = dayKey(new Date(r.starts_at));
      days.set(k, [...(days.get(k) ?? []), r]);
    }
    setGroups([...days.values()]);
  }, [rows]);

  return (
    <div className="grid gap-4">
      {(groups ?? [rows]).map((list) => (
        <div key={list[0].id} className="grid gap-1.5">
          {groups && <h2 className="text-[0.95rem] font-bold"><LocalTime iso={list[0].starts_at} mode="day" /></h2>}
          {list.map((r) => <SlotLine key={r.id} row={r} />)}
        </div>
      ))}
    </div>
  );
}

function SlotLine({ row }: { row: SlotRow }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [err, setErr] = useState("");
  const [busy, start] = useTransition();
  const [tooSoon, setTooSoon] = useState(false);
  useEffect(() => {
    setTooSoon(!row.booked && new Date(row.starts_at).getTime() < Date.now() + MIN_NOTICE_HOURS * 3600 * 1000);
  }, [row]);

  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 rounded-lg border border-line bg-surface px-3 py-2.5">
      <span className="min-w-[150px] font-mono text-[0.88rem]">
        <LocalTime iso={row.starts_at} mode="timeTz" /> · {row.duration_min}m
      </span>
      <span className="min-w-0 flex-1 text-[0.86rem]">{row.bookedBy ?? ""}</span>
      {row.booked ? (
        <span className="pill pill-booked">Booked</span>
      ) : tooSoon ? (
        <span className="pill bg-sunk text-muted" title={`Students can't book less than ${MIN_NOTICE_HOURS} hours ahead`}>Closed for booking</span>
      ) : (
        <span className="pill pill-open">Open</span>
      )}
      {row.booked ? (
        <Link href="/sessions" className="text-[0.86rem]">See brief</Link>
      ) : asking ? (
        <span className="flex items-center gap-2">
          <button className="btn btn-danger btn-sm" type="button" disabled={busy}
            onClick={() => start(async () => {
              const r = await removeSlot(row.id);
              if (!r.ok) { setErr(r.error); setAsking(false); }
              router.refresh();
            })}>
            Remove
          </button>
          <button className="btn btn-quiet btn-sm" type="button" onClick={() => setAsking(false)}>Keep</button>
        </span>
      ) : (
        <button className="linkbtn text-[0.86rem]" type="button" onClick={() => setAsking(true)}>Remove</button>
      )}
      {err && <span role="alert" className="err w-full">{err}</span>}
    </div>
  );
}
