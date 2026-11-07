"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ADVICE_AREAS, DURATIONS, YEARS } from "@/lib/constants";
import {
  sendApplicationReceivedEmail, sendApprovalEmail, sendBookingEmails, sendCancellationEmails, sendInstitutionDecisionEmail,
} from "@/lib/email";
import { checkBrief } from "@/lib/brief-check";
import { MIN_BRIEF_CHARS } from "@/lib/brief-rules";
import { INVITE_COOKIE } from "@/lib/invite";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

type DbError = { code?: string; message?: string } | null;

/** Turn a database error into something a person can act on. */
function friendly(e: DbError | unknown): string {
  const err = (e ?? {}) as { code?: string; message?: string };
  if (err.code === "P0001" && err.message) return err.message; // our own raised messages
  if (err.code === "23505") return "That slot was just taken. Pick another.";
  if (err.code === "23514") return "Some details aren't valid. Links must start with https://";
  console.error(e);
  return "Something went wrong. Try again in a moment.";
}

const zodError = (e: z.ZodError) => e.issues[0]?.message ?? "Check the form and try again.";
/** Accepts "meet.google.com/abc" or "http://…" and stores "https://…". */
const withHttps = (v: unknown) => {
  const t = String(v ?? "").trim();
  if (!t) return t;
  if (/^https:\/\//i.test(t)) return t;
  if (/^http:\/\//i.test(t)) return "https://" + t.slice(7);
  return "https://" + t.replace(/^\/+/, "");
};
const link = (field: string) =>
  z.preprocess(withHttps, z.string().min(1, `Add ${field.replace(/^Your /, "your ")}.`).max(500).regex(/^https:\/\/[^\s/]+\.[^\s]+$/i, `${field} doesn't look like a web address. Paste the full link, e.g. from your browser's address bar.`));

const uuid = z.string().uuid("Choose an institution.");
const revalidateAll = () => revalidatePath("/", "layout");

// ---------------------------------------------------------------- students
const studentSchema = z.object({
  institutionId: uuid,
  fullName: z.string().trim().min(1, "Add your name.").max(120),
  program: z.string().trim().max(60),
  department: z.string().trim().max(120),
  year: z.enum(YEARS, { message: "Choose your year." }),
  timezone: z.string().trim().max(64).default("UTC"),
  projectTitle: z.string().trim().min(1, "Add a project title.").max(200),
  projectSummary: z.string().trim().max(2000),
  seeking: z.string().trim().min(1, "Say what advice you're looking for.").max(2000),
});

export async function saveStudentProfile(input: z.input<typeof studentSchema>): Promise<ActionResult> {
  const parsed = studentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_student_profile", {
    p_institution: d.institutionId,
    p_full_name: d.fullName,
    p_program: d.program,
    p_department: d.department,
    p_year: d.year,
    p_project_title: d.projectTitle,
    p_project_summary: d.projectSummary,
    p_seeking: d.seeking,
    p_timezone: d.timezone || "UTC",
  });
  if (error) return { ok: false, error: friendly(error) };
  revalidateAll();
  return { ok: true };
}

// ---------------------------------------------------------------- alumni
const joinSchema = z.object({
  institutionId: uuid,
  gradYear: z.coerce
    .number({ message: "Add your graduating year." })
    .int("Add your graduating year.")
    .min(1940, "Check your graduating year.")
    .max(new Date().getFullYear() + 1, "Graduating year can't be that far in the future."),
  degree: z.string().trim().min(1, "Add your degree.").max(60),
  department: z.string().trim().max(120),
});

const alumniSchema = z.object({
  fullName: z.string().trim().min(1, "Add your name.").max(120),
  /** When signing up: the first institution to join. */
  join: joinSchema.optional(),
  jobTitle: z.string().trim().min(1, "Add your current role.").max(120),
  organization: z.string().trim().min(1, "Add your organization.").max(120),
  city: z.string().trim().max(80),
  timezone: z.string().trim().max(64),
  linkedinUrl: z.preprocess(withHttps, z.union([z.literal(""), link("Your LinkedIn URL")])),
  meetingLink: z.preprocess(withHttps, z.union([z.literal(""), link("Your meeting link")])),
  skills: z.array(z.string().trim().min(1).max(40)).max(20),
  adviceAreas: z.array(z.enum(ADVICE_AREAS)).min(1, "Pick at least one area you can advise on."),
  bio: z.string().trim().max(1200),
  visible: z.boolean(),
});

async function join(supabase: Awaited<ReturnType<typeof createClient>>, j: z.output<typeof joinSchema>) {
  const jar = await cookies();
  const invite = jar.get(INVITE_COOKIE)?.value ?? null;
  const { data, error } = await supabase.rpc("join_institution", {
    p_inst: j.institutionId,
    p_grad_year: j.gradYear,
    p_degree: j.degree,
    p_department: j.department,
    p_invite: invite,
  });
  if (!error && data === "approved" && invite) jar.delete(INVITE_COOKIE);
  return { status: data ? String(data) : "", error };
}

export async function saveAlumniProfile(input: z.input<typeof alumniSchema>): Promise<ActionResult<{ status: string }>> {
  const parsed = alumniSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_alumni_profile", {
    p_full_name: d.fullName,
    p_job_title: d.jobTitle,
    p_organization: d.organization,
    p_city: d.city,
    p_timezone: d.timezone || "UTC",
    p_linkedin_url: d.linkedinUrl,
    p_meeting_link: d.meetingLink,
    p_skills: d.skills,
    p_advice_areas: d.adviceAreas,
    p_bio: d.bio,
    p_visible: d.visible,
  });
  if (error) return { ok: false, error: friendly(error) };
  let status = "";
  if (d.join) {
    const j = await join(supabase, d.join);
    if (j.error) return { ok: false, error: friendly(j.error) };
    status = j.status;
  }
  revalidateAll();
  return { ok: true, data: { status } };
}

export async function joinInstitution(input: z.input<typeof joinSchema>): Promise<ActionResult<{ status: string }>> {
  const parsed = joinSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  const supabase = await createClient();
  const j = await join(supabase, parsed.data);
  if (j.error) return { ok: false, error: friendly(j.error) };
  revalidateAll();
  return { ok: true, data: { status: j.status } };
}

export async function leaveInstitution(institutionId: string): Promise<ActionResult> {
  if (!uuid.safeParse(institutionId).success) return { ok: false, error: "Institution not found." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("leave_institution", { p_inst: institutionId });
  if (error) return { ok: false, error: friendly(error) };
  revalidateAll();
  return { ok: true };
}

const slotSetupSchema = z.object({
  meetingLink: z.preprocess(withHttps, z.union([z.literal(""), link("Your meeting link")])),
  skills: z.array(z.string().trim().min(1).max(40)).min(1, "Add at least one skill.").max(20),
});

/** The two things a mentor needs before opening slots. */
export async function saveSlotSetup(input: z.input<typeof slotSetupSchema>): Promise<ActionResult> {
  const parsed = slotSetupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_slot_setup", { p_meeting_link: parsed.data.meetingLink, p_skills: parsed.data.skills });
  if (error) return { ok: false, error: friendly(error) };
  revalidateAll();
  return { ok: true };
}

// ---------------------------------------------------------------- slots
const slotsSchema = z.object({
  starts: z.array(z.string().datetime()).min(1).max(20),
  duration: z.union(DURATIONS.map((n) => z.literal(n)) as unknown as [z.ZodLiteral<30>, z.ZodLiteral<45>, z.ZodLiteral<60>]),
});

export async function addSlots(input: z.input<typeof slotsSchema>): Promise<ActionResult<{ added: number; skipped: number }>> {
  const parsed = slotsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pick a valid date, time and length." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_slots", { p_starts: parsed.data.starts, p_duration: parsed.data.duration });
  if (error) return { ok: false, error: friendly(error) };
  revalidatePath("/availability");
  const added = Number(data) || 0;
  return { ok: true, data: { added, skipped: parsed.data.starts.length - added } };
}

export async function removeSlot(slotId: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(slotId).success) return { ok: false, error: "Slot not found." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_slot", { p_slot: slotId });
  if (error) return { ok: false, error: friendly(error) };
  revalidatePath("/availability");
  return { ok: true };
}

// ---------------------------------------------------------------- bookings
const bookSchema = z.object({
  slotId: z.string().uuid(),
  topic: z
    .string()
    .trim()
    .min(1, "Add what you want to cover so your mentor can prepare.")
    .min(MIN_BRIEF_CHARS, "Describe what you want to cover in a sentence or two (at least 40 characters) so your mentor can prepare.")
    .max(1000),
  note: z.string().trim().max(500),
  /** Set when the student has seen the feedback and chose to book as written. */
  bookAsWritten: z.boolean().default(false),
});

export type BookResult =
  | { ok: true; bookingId: string }
  | { ok: false; error: string }
  | { ok: false; needsWork: true; feedback: string; suggestion: string };

export async function bookSlot(input: z.input<typeof bookSchema>): Promise<BookResult> {
  const parsed = bookSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  const d = parsed.data;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in again to continue." };

  // Specificity check: is the brief something a mentor can prepare from?
  let briefCheck: Record<string, unknown>;
  if (d.bookAsWritten) {
    briefCheck = { verdict: "booked_as_written", at: new Date().toISOString() };
  } else {
    const [{ data: slot }, { data: sp }] = await Promise.all([
      supabase.from("slots").select("alumni_id").eq("id", d.slotId).single(),
      supabase.from("student_profiles").select("project_title, project_summary").eq("user_id", user.id).single(),
    ]);
    if (!slot) return { ok: false, error: "That slot is no longer offered." };
    const [{ data: mp }, { data: ma }] = await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", slot.alumni_id).single(),
      supabase.from("alumni_profiles").select("job_title, organization, skills").eq("user_id", slot.alumni_id).single(),
    ]);
    const verdict = await checkBrief({
      topic: d.topic,
      project: sp?.project_title ?? "",
      summary: sp?.project_summary ?? "",
      mentor: [mp?.full_name, ma?.job_title, ma?.organization, ma?.skills?.join(", ")].filter(Boolean).join(" · "),
    });
    if (!verdict.specific) return { ok: false, needsWork: true, feedback: verdict.feedback, suggestion: verdict.suggestion };
    briefCheck = { verdict: "specific", method: verdict.method, at: new Date().toISOString() };
  }

  const { data, error } = await supabase.rpc("book_slot", {
    p_slot: d.slotId,
    p_topic: d.topic,
    p_note: d.note,
    p_brief_check: briefCheck,
  });
  if (error) return { ok: false, error: friendly(error) };
  const bookingId = String(data);
  after(() => sendBookingEmails(bookingId).catch((e) => console.error("booking email", e)));
  revalidatePath("/", "layout");
  return { ok: true, bookingId };
}

export async function cancelBooking(bookingId: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(bookingId).success) return { ok: false, error: "Session not found." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_booking", { p_booking: bookingId });
  if (error) return { ok: false, error: friendly(error) };
  after(() => sendCancellationEmails(bookingId).catch((e) => console.error("cancel email", e)));
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------- institutions
const institutionSchema = z.object({
  name: z.string().trim().min(3, "Add the institution's full name.").max(160),
  shortName: z.string().trim().max(40),
  city: z.string().trim().max(80),
  country: z.string().trim().max(80),
  website: z.preprocess((v) => { const t = String(v ?? "").trim(); return t ? withHttps(t) : ""; },
    z.union([z.literal(""), z.string().max(300).regex(/^https:\/\/[^\s/]+\.[^\s]+$/i, "The website doesn't look like a web address.")])),
  domains: z.string().trim().min(3, "Add the email domain students use, e.g. college.edu."),
});
const splitDomains = (raw: string) =>
  raw.split(/[\s,;]+/).map((x) => x.trim().toLowerCase().replace(/^@/, "")).filter(Boolean).slice(0, 10);

const applySchema = institutionSchema.extend({
  role: z.string().trim().min(3, "Tell us your role at the institution.").max(200),
  note: z.string().trim().max(1000),
});

export async function applyInstitution(input: z.input<typeof applySchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = applySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  const d = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("apply_institution", {
    p_name: d.name,
    p_short_name: d.shortName,
    p_city: d.city,
    p_country: d.country,
    p_website: d.website,
    p_domains: splitDomains(d.domains),
    p_role: d.role,
    p_note: d.note,
  });
  if (error) return { ok: false, error: friendly(error) };
  const id = String(data);
  after(() => sendApplicationReceivedEmail(id).catch((e) => console.error("application email", e)));
  revalidateAll();
  return { ok: true, data: { id } };
}

export async function adminDecideInstitution(institutionId: string, status: "approved" | "rejected"): Promise<ActionResult> {
  if (!uuid.safeParse(institutionId).success || !["approved", "rejected"].includes(status))
    return { ok: false, error: "Invalid request." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_decide_institution", { p_inst: institutionId, p_status: status });
  if (error) return { ok: false, error: friendly(error) };
  after(() => sendInstitutionDecisionEmail(institutionId).catch((e) => console.error("decision email", e)));
  revalidateAll();
  return { ok: true };
}

export async function orgUpdateInstitution(institutionId: string, input: z.input<typeof institutionSchema>): Promise<ActionResult> {
  const parsed = institutionSchema.safeParse(input);
  if (!parsed.success || !uuid.safeParse(institutionId).success)
    return { ok: false, error: parsed.success ? "Institution not found." : zodError(parsed.error) };
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("org_update_institution", {
    p_inst: institutionId,
    p_name: d.name,
    p_short_name: d.shortName,
    p_city: d.city,
    p_country: d.country,
    p_website: d.website,
    p_domains: splitDomains(d.domains),
  });
  if (error) return { ok: false, error: friendly(error) };
  revalidateAll();
  return { ok: true };
}

// ---------------------------------------------------------------- organizers
export async function orgSetMemberStatus(institutionId: string, userId: string, status: "approved" | "rejected" | "pending"): Promise<ActionResult> {
  if (!uuid.safeParse(institutionId).success || !uuid.safeParse(userId).success) return { ok: false, error: "Not found." };
  if (!["approved", "rejected", "pending"].includes(status)) return { ok: false, error: "Invalid status." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("org_set_member_status", { p_inst: institutionId, p_user: userId, p_status: status });
  if (error) return { ok: false, error: friendly(error) };
  if (status === "approved") after(() => sendApprovalEmail(userId, institutionId).catch((e) => console.error("approval email", e)));
  revalidateAll();
  return { ok: true };
}

const parseEmails = (raw: string) => {
  const parts = raw.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  const valid = parts.filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
  return { valid, invalid: parts.filter((x) => !valid.includes(x)) };
};

export async function orgAddInvites(institutionId: string, raw: string, note: string): Promise<ActionResult<{ added: number; invalid: string[] }>> {
  const { valid, invalid } = parseEmails(raw);
  if (!valid.length) return { ok: false, error: "Paste one or more email addresses." };
  if (valid.length > 200) return { ok: false, error: "Add up to 200 emails at a time." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("org_add_invites", { p_inst: institutionId, p_emails: valid, p_note: note.trim().slice(0, 200) });
  if (error) return { ok: false, error: friendly(error) };
  revalidateAll();
  return { ok: true, data: { added: Number(data) || 0, invalid } };
}

export async function orgRemoveInvite(institutionId: string, email: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("org_remove_invite", { p_inst: institutionId, p_email: email });
  if (error) return { ok: false, error: friendly(error) };
  revalidateAll();
  return { ok: true };
}

export async function orgCreateInviteLink(institutionId: string, label: string, days: number, maxUses: number): Promise<ActionResult<{ code: string }>> {
  if (!Number.isInteger(days) || days < 1 || days > 365) return { ok: false, error: "Links can last 1 to 365 days." };
  if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1000) return { ok: false, error: "Allow between 1 and 1000 sign-ups." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("org_create_invite_link", {
    p_inst: institutionId, p_label: label.trim().slice(0, 120), p_days: days, p_max_uses: maxUses,
  });
  if (error) return { ok: false, error: friendly(error) };
  revalidateAll();
  return { ok: true, data: { code: String(data) } };
}

export async function orgRevokeInviteLink(code: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("org_revoke_invite_link", { p_code: code });
  if (error) return { ok: false, error: friendly(error) };
  revalidateAll();
  return { ok: true };
}

export async function orgAllowStudentEmails(institutionId: string, raw: string, note: string): Promise<ActionResult<{ added: number; invalid: string[] }>> {
  const { valid, invalid } = parseEmails(raw);
  if (!valid.length) return { ok: false, error: "Paste one or more email addresses." };
  const supabase = await createClient();
  for (const email of valid.slice(0, 200)) {
    const { error } = await supabase.rpc("org_allow_student_email", { p_inst: institutionId, p_email: email, p_note: note.trim().slice(0, 200) });
    if (error) return { ok: false, error: friendly(error) };
  }
  revalidateAll();
  return { ok: true, data: { added: Math.min(valid.length, 200), invalid } };
}

export async function orgRemoveStudentEmail(institutionId: string, email: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("org_remove_student_email", { p_inst: institutionId, p_email: email });
  if (error) return { ok: false, error: friendly(error) };
  revalidateAll();
  return { ok: true };
}

export async function orgAddOrganizer(institutionId: string, email: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("org_add_organizer", { p_inst: institutionId, p_email: email.trim() });
  if (error) return { ok: false, error: friendly(error) };
  revalidateAll();
  return { ok: true };
}

export async function orgRemoveOrganizer(institutionId: string, userId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("org_remove_organizer", { p_inst: institutionId, p_user: userId });
  if (error) return { ok: false, error: friendly(error) };
  revalidateAll();
  return { ok: true };
}
