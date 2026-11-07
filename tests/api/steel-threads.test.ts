// API steel threads for Alumni Connect (multi-institution).
//
//   0. Institution onboarding   apply -> platform admin approves -> applicant runs it; public directory lists it
//   1. Alumni registration      sign up -> mentor profile -> join institution -> organizer approves -> listed
//   2. Student sign-up          institution email domain or allow-listed email; other institutions' students isolated
//   3. Student booking          alumnus opens slots -> student books -> rules hold
//   4. Calendars                booking shows for both people; invite (.ics) and Google Calendar link are right
//   5. Analytics                finished session counted for its institution's organizers and the platform admin
//   6. Invites                  pre-approved emails and invite links skip review, per institution
//
// Run:  TEST_SUPABASE_URL=… TEST_SUPABASE_ANON_KEY=… TEST_SUPABASE_SERVICE_ROLE_KEY=… npm run test:api
// See tests/api/harness.ts for what the service-role key is (and isn't) used for.

import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { buildIcs } from "@/lib/ics";
import { gcalUrl } from "@/lib/time";
import {
  RUN, cleanUp, configured, env, inHours, makePlatformAdmin, newPerson, rpc, rpcRefused, service, type Person,
} from "./harness";

const BRIEF =
  "Our LoRa flood sensor drains its battery in 4 days even with duty cycling. What should I measure next to find where the power goes?";
const MEET = "https://meet.google.com/abc-defg-hij";
const DOMAIN_A = `${RUN}-a.edu`;
const DOMAIN_B = `${RUN}-b.edu`;

let admin: Person, orgA: Person, orgB: Person, alum: Person, student: Person, student2: Person, studentB: Person, outsider: Person;
let instA = "", instB = "";
let slotIds: string[] = [];
let bookingId = "";
let bookedSlot: { id: string; starts_at: string; duration_min: number };

const anon = () => createClient(env.url, env.anon, { auth: { persistSession: false } });
const studentProfile = (p: Person, inst: string) =>
  rpc(p, "save_student_profile", {
    p_institution: inst, p_full_name: "Arjun Das", p_program: "B.Tech", p_department: "Electronics",
    p_year: "3rd year", p_project_title: "LoRa flood sensor", p_project_summary: "Mesh of river-level sensors.",
    p_seeking: "Power budget and field validation", p_timezone: "Asia/Kolkata",
  });
const mentorProfile = (p: Person, meeting = MEET, skills = ["Embedded systems", "Power optimization"]) =>
  rpc(p, "save_alumni_profile", {
    p_full_name: "Priya Raman", p_job_title: "Engineering Manager", p_organization: "Qualcomm", p_city: "Bengaluru",
    p_timezone: "Asia/Kolkata", p_linkedin_url: "https://www.linkedin.com/in/example", p_meeting_link: meeting,
    p_skills: skills, p_advice_areas: ["Embedded systems & IoT"], p_bio: "Low-power IoT firmware.", p_visible: true,
  });
const join = (p: Person, inst: string, code: string | null = null) =>
  rpc<string>(p, "join_institution", { p_inst: inst, p_grad_year: 2012, p_degree: "B.Tech", p_department: "ECE", p_invite: code });

describe.skipIf(!configured)(`API steel threads (run ${RUN})`, () => {
  beforeAll(async () => {
    admin = await newPerson("platform-admin");
    await makePlatformAdmin(admin);
  });
  afterAll(cleanUp);

  // ----------------------------------------------------------------- 0
  describe("0. Institution onboarding", () => {
    test("anyone signed in can apply; the application is private until approved", async () => {
      orgA = await newPerson("org-a", DOMAIN_A, "Olga Organizer");
      orgB = await newPerson("org-b", DOMAIN_B);
      instA = await rpc<string>(orgA, "apply_institution", {
        p_name: `Test Institute A ${RUN}`, p_short_name: `A${RUN}`, p_city: "Guwahati", p_country: "India",
        p_website: "https://example.edu", p_domains: [DOMAIN_A], p_role: "Alumni cell lead", p_note: "",
      });
      instB = await rpc<string>(orgB, "apply_institution", {
        p_name: `Test Institute B ${RUN}`, p_short_name: "", p_city: "", p_country: "",
        p_website: "", p_domains: [DOMAIN_B], p_role: "Placement office", p_note: "",
      });
      const { data } = await anon().from("institutions").select("id").in("id", [instA, instB]);
      expect(data).toEqual([]);
    });

    test("only a platform admin can approve; the applicant becomes its organizer", async () => {
      expect(await rpcRefused(orgA, "admin_decide_institution", { p_inst: instA, p_status: "approved" })).toMatch(/Platform admins/);
      await rpc(admin, "admin_decide_institution", { p_inst: instA, p_status: "approved" });
      await rpc(admin, "admin_decide_institution", { p_inst: instB, p_status: "approved" });
      const { data } = await orgA.client.from("organizers").select("institution_id").eq("user_id", orgA.id);
      expect(data?.map((r) => r.institution_id)).toEqual([instA]);
    });

    test("approved institutions appear in the public directory", async () => {
      const { data } = await anon().rpc("public_directory");
      const ids = (data as { id: string }[]).map((r) => r.id);
      expect(ids).toEqual(expect.arrayContaining([instA, instB]));
    });

    test("organizers can't manage another institution", async () => {
      expect(await rpcRefused(orgB, "org_create_invite_link", { p_inst: instA, p_label: RUN, p_days: 5, p_max_uses: 5 })).toMatch(/Organizers only/);
    });
  });

  // ----------------------------------------------------------------- 1
  describe("1. Alumni registration", () => {
    test("a new mentor saves a profile and joins an institution, pending review", async () => {
      alum = await newPerson("alum", "example.com", "Priya Raman");
      await mentorProfile(alum);
      expect(await join(alum, instA)).toBe("pending");
    });

    test("pending alumni can't open slots", async () => {
      expect(await rpcRefused(alum, "add_slots", { p_starts: [inHours(72).toISOString()], p_duration: 30 })).toMatch(/approved alumni/);
    });

    test("only that institution's organizers can approve them", async () => {
      expect(await rpcRefused(orgB, "org_set_member_status", { p_inst: instA, p_user: alum.id, p_status: "approved" })).toMatch(/Organizers only/);
      await rpc(orgA, "org_set_member_status", { p_inst: instA, p_user: alum.id, p_status: "approved" });
      const { data } = await alum.client.from("memberships").select("status").eq("institution_id", instA).single();
      expect(data?.status).toBe("approved");
    });
  });

  // ----------------------------------------------------------------- 2
  describe("2. Student sign-up", () => {
    test("students join with their institution's email domain", async () => {
      student = await newPerson("student", DOMAIN_A, "Arjun Das");
      student2 = await newPerson("student2", `cse.${DOMAIN_A}`);
      studentB = await newPerson("student-b", DOMAIN_B);
      const { data } = await student.client.rpc("my_student_options");
      expect((data as { id: string }[]).map((r) => r.id)).toEqual([instA]);
      await studentProfile(student, instA);
      await studentProfile(student2, instA);
      await studentProfile(studentB, instB);
    });

    test("other emails are refused unless an organizer allows them", async () => {
      outsider = await newPerson("outsider", "gmail-test.com");
      expect(await rpcRefused(outsider, "save_student_profile", {
        p_institution: instA, p_full_name: "X", p_program: "", p_department: "", p_year: "1st year",
        p_project_title: "X", p_project_summary: "", p_seeking: "X",
      })).toMatch(/institution email/);
      await rpc(orgA, "org_allow_student_email", { p_inst: instA, p_email: outsider.email, p_note: RUN });
      await studentProfile(outsider, instA);
    });

    test("students see their own institution's mentors only, without emails or meeting links", async () => {
      expect((await student.client.from("alumni_profiles").select("user_id").eq("user_id", alum.id)).data).toHaveLength(1);
      expect((await studentB.client.from("alumni_profiles").select("user_id").eq("user_id", alum.id)).data).toHaveLength(0);
      expect((await student.client.from("profiles").select("email").eq("id", alum.id)).error?.message).toMatch(/permission denied/);
      expect((await student.client.from("alumni_profiles").select("meeting_link")).error?.message).toMatch(/permission denied/);
    });
  });

  // ----------------------------------------------------------------- 3
  describe("3. Student booking", () => {
    test("approved alumni open slots; ones inside 48 hours are skipped", async () => {
      const added = await rpc<number>(alum, "add_slots", {
        p_starts: [inHours(24), inHours(72), inHours(96), inHours(120)].map((d) => d.toISOString()),
        p_duration: 30,
      });
      expect(added).toBe(3);
      const { data } = await student.client.from("slots").select("id, starts_at, duration_min").eq("alumni_id", alum.id).order("starts_at");
      slotIds = (data ?? []).map((s) => s.id);
      bookedSlot = data![0];
      expect(slotIds).toHaveLength(3);
    });

    test("students of another institution can't see or book them", async () => {
      expect((await studentB.client.from("slots").select("id").eq("alumni_id", alum.id)).data).toHaveLength(0);
      expect(await rpcRefused(studentB, "book_slot", { p_slot: slotIds[0], p_topic: BRIEF, p_note: "" })).toMatch(/not taking bookings/);
    });

    test("a one-line brief is refused", async () => {
      expect(await rpcRefused(student, "book_slot", { p_slot: slotIds[0], p_topic: "Career advice", p_note: "" })).toMatch(/40 characters/);
    });

    test("booking works once per slot and once per mentor", async () => {
      bookingId = await rpc<string>(student, "book_slot", { p_slot: slotIds[0], p_topic: BRIEF, p_note: "", p_brief_check: { verdict: "specific" } });
      expect(await rpcRefused(student2, "book_slot", { p_slot: slotIds[0], p_topic: BRIEF, p_note: "" })).toMatch(/just taken/);
      expect(await rpcRefused(student, "book_slot", { p_slot: slotIds[1], p_topic: BRIEF, p_note: "" })).toMatch(/already have an upcoming/);
    });
  });

  // ----------------------------------------------------------------- 4
  describe("4. Calendars", () => {
    test("the session shows for the student, the mentor and the organizer, and nobody else", async () => {
      for (const p of [student, alum, orgA]) expect((await p.client.from("bookings").select("id").eq("id", bookingId)).data).toHaveLength(1);
      for (const p of [student2, studentB, orgB]) expect((await p.client.from("bookings").select("id").eq("id", bookingId)).data).toHaveLength(0);
    });

    test("the mentor sees the student's project brief", async () => {
      const { data } = await alum.client.from("student_profiles").select("project_title").eq("user_id", student.id).single();
      expect(data?.project_title).toBe("LoRa flood sensor");
    });

    test("the calendar invite and Google Calendar link carry the right time and people", async () => {
      const ics = buildIcs({
        uid: `booking-${bookingId}@alumni-connect`, method: "REQUEST", sequence: 0,
        start: new Date(bookedSlot.starts_at), durationMin: bookedSlot.duration_min,
        summary: "Alumni Connect: Arjun Das × Priya Raman", description: `Topic: ${BRIEF}`, location: MEET,
        organizerEmail: "connect@example.org",
        attendees: [{ name: "Priya Raman", email: alum.email }, { name: "Arjun Das", email: student.email }],
      });
      const stamp = new Date(bookedSlot.starts_at).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
      expect(ics).toContain(`DTSTART:${stamp}`);
      expect(ics.replace(/\r\n /g, "")).toContain(alum.email);
      expect(gcalUrl("Alumni Connect", bookedSlot.starts_at, 30, BRIEF)).toContain(stamp);
    });

    test("cancelling removes it for both and reopens the slot", async () => {
      const second = await rpc<string>(student2, "book_slot", { p_slot: slotIds[2], p_topic: BRIEF, p_note: "" });
      await rpc(student2, "cancel_booking", { p_booking: second });
      const { data } = await student.client.from("slots").select("is_booked").eq("id", slotIds[2]).single();
      expect(data?.is_booked).toBe(false);
    });
  });

  // ----------------------------------------------------------------- 5
  describe("5. Analytics", () => {
    test("a finished session counts as completed for its institution only", async () => {
      const db = service();
      await db.from("bookings").update({ starts_at: new Date(Date.now() - 2 * 3600_000).toISOString() }).eq("id", bookingId);
      const a = await rpc<{ completed_sessions: number; cancelled_sessions: number; completed_minutes: number; students: number }>(orgA, "org_stats", { p_inst: instA });
      expect(a).toMatchObject({ completed_sessions: 1, cancelled_sessions: 1, completed_minutes: 30, students: 3 });
      const b = await rpc<{ completed_sessions: number; students: number }>(orgB, "org_stats", { p_inst: instB });
      expect(b).toMatchObject({ completed_sessions: 0, students: 1 });
      expect(await rpcRefused(orgB, "org_stats", { p_inst: instA })).toMatch(/Organizers only/);
    });

    test("the platform admin sees every institution", async () => {
      const s = await rpc<{ by_institution: { id: string; completed: number }[] }>(admin, "admin_stats");
      expect(s.by_institution.find((i) => i.id === instA)?.completed).toBe(1);
      expect(await rpcRefused(orgA, "admin_stats")).toMatch(/Platform admins/);
    });
  });

  // ----------------------------------------------------------------- 6
  describe("6. Invites", () => {
    test("a pre-approved email skips review at that institution only", async () => {
      const m = await newPerson("invited");
      await rpc(orgA, "org_add_invites", { p_inst: instA, p_emails: [m.email.toUpperCase()], p_note: RUN });
      await mentorProfile(m, "", []);
      expect(await join(m, instA)).toBe("approved");
      expect(await join(m, instB)).toBe("pending");
      expect(await rpc<string[]>(m, "slot_setup_missing")).toEqual(["meeting_link", "skills"]);
    });

    test("an invite link approves up to its limit; anyone can check it", async () => {
      const code = await rpc<string>(orgB, "org_create_invite_link", { p_inst: instB, p_label: RUN, p_days: 30, p_max_uses: 1 });
      const info = (await anon().rpc("invite_link_info", { p_code: code })).data as { institution_id: string }[];
      expect(info[0].institution_id).toBe(instB);
      const m1 = await newPerson("linked1"), m2 = await newPerson("linked2");
      await mentorProfile(m1); await mentorProfile(m2);
      expect(await join(m1, instA, code)).toBe("pending"); // a link only works for its own institution
      expect(await join(m1, instB, code)).toBe("approved");
      expect(await join(m2, instB, code)).toBe("pending");
      expect((await anon().rpc("invite_link_info", { p_code: code })).data).toEqual([]);
    });
  });
});
