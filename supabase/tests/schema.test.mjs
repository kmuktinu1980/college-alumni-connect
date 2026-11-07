import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

// Applies every migration in the given directory (in filename order) to an
// in-memory Postgres with a minimal stand-in for Supabase's auth schema, then
// checks the rules as different users.
const db = new PGlite();
const dir = process.argv[2];
const migrations = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;
  grant usage on schema public to authenticated, anon;
`);
for (const f of migrations) await db.exec(fs.readFileSync(path.join(dir, f), "utf8"));

const BRIEF = "Validate the LoRa sensor design and power budget before field trials";
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = {
  kartik: id(1), sm: id(2), // platform admins
  orgA: id(10), orgB: id(11), // applicants who become organizers
  alum: id(20), alum2: id(21), invited: id(22), linked: id(23), linked2: id(24),
  stuA: id(30), stuA2: id(31), stuB: id(32), stuSub: id(33), outsider: id(34), allowed: id(35),
};
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values
  ('${U.kartik}', 'KMuktinu.UCI@gmail.com', '{}'), ('${U.sm}', 'smandumula@gmail.com', '{}'),
  ('${U.orgA}', 'placements@iitg.ac.in', '{"full_name":"Olga Org"}'), ('${U.orgB}', 'alumni@nitk.edu.in', '{}'),
  ('${U.alum}', 'asha@gmail.com', '{"full_name":"Asha Alum"}'), ('${U.alum2}', 'ben@gmail.com', '{}'),
  ('${U.invited}', 'invited@gmail.com', '{}'), ('${U.linked}', 'linked@gmail.com', '{}'), ('${U.linked2}', 'linked2@gmail.com', '{}'),
  ('${U.stuA}', 'stu@iitg.ac.in', '{}'), ('${U.stuA2}', 'stu2@iitg.ac.in', '{}'), ('${U.stuB}', 'stu@nitk.edu.in', '{}'),
  ('${U.stuSub}', 'x@cse.iitg.ac.in', '{}'), ('${U.outsider}', 'someone@gmail.com', '{}'), ('${U.allowed}', 'visiting@gmail.com', '{}')`);

let pass = 0, fail = 0;
async function as(user, sql, params = [], role = "authenticated") {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user ?? ""}', false);`);
  if (role) await db.exec(`set role ${role}`);
  try { return await db.query(sql, params); } finally { await db.exec("reset role"); }
}
const one = async (user, sql, params, role) => (await as(user, sql, params, role)).rows[0];
async function ok(name, fn) { try { await fn(); console.log("PASS", name); pass++; } catch (e) { console.log("FAIL", name, "->", e.message); fail++; } }
async function err(name, fn, re) {
  try { await fn(); console.log("FAIL", name, "-> no error"); fail++; }
  catch (e) { if (re.test(e.message)) { console.log("PASS", name, "|", e.message); pass++; } else { console.log("FAIL", name, "-> wrong error:", e.message); fail++; } }
}
const eq = (a, b, what = "") => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };

// ------------------------------------------------------------ platform admins
await ok("listed emails become platform admins on sign-up (case-insensitive)", async () => {
  const r = await db.query(`select id, is_admin from public.profiles where id in ($1, $2, $3) order by id`, [U.kartik, U.sm, U.alum]);
  eq(r.rows.map((x) => x.is_admin), [true, true, false]);
});

// ------------------------------------------------------------ institutions
const apply = (u, name, short, domains) =>
  one(u, `select public.apply_institution($1, $2, 'City', 'India', 'https://example.edu', $3, 'Alumni cell lead', '') as id`, [name, short, domains]);
let A, B;
await err("applying needs a student email domain", () => apply(U.orgA, "Indian Institute of Technology Guwahati", "IITG", ["not a domain"]), /email domain/);
await ok("anyone signed in can apply; domains are cleaned", async () => {
  A = (await apply(U.orgA, "Indian Institute of Technology Guwahati", "IITG", ["@IITG.ac.in", "https://iitg.ac.in/"])).id;
  B = (await apply(U.orgB, "NIT Karnataka", "NITK", ["nitk.edu.in"])).id;
  const r = await db.query(`select slug, status, student_domains from public.institutions where id = $1`, [A]);
  eq(r.rows[0], { slug: "iitg", status: "pending", student_domains: ["iitg.ac.in"] });
});
await err("the same institution can't apply twice", () => apply(U.alum, "indian institute of technology guwahati", "", ["iitg.ac.in"]), /already/);
await ok("anonymous visitors can't see pending institutions", async () => {
  eq((await as(null, `select count(*)::int n from public.institutions`, [], "anon")).rows[0].n, 0);
});
await err("non-admins can't approve institutions", () => as(U.orgA, `select public.admin_decide_institution($1, 'approved')`, [A]), /Platform admins/);
await err("students can't join a pending institution", () =>
  as(U.stuA, `select public.save_student_profile($1, 'Stu A', 'B.Tech', 'CSE', '3rd year', 'Flood sensor', '', 'Hardware validation')`, [A]), /isn't on Alumni Connect/);
await ok("an admin approves; the applicant becomes its organizer", async () => {
  await as(U.sm, `select public.admin_decide_institution($1, 'approved')`, [A]);
  await as(U.kartik, `select public.admin_decide_institution($1, 'approved')`, [B]);
  eq((await db.query(`select count(*)::int n from public.organizers where institution_id = $1 and user_id = $2`, [A, U.orgA])).rows[0].n, 1);
});
await ok("anonymous visitors see approved institutions and the public directory", async () => {
  eq((await as(null, `select count(*)::int n from public.institutions`, [], "anon")).rows[0].n, 2);
  eq((await as(null, `select slug from public.public_directory() order by slug`, [], "anon")).rows.map((r) => r.slug), ["iitg", "nitk"]);
});
await err("an organizer can't edit another institution", () =>
  as(U.orgB, `select public.org_update_institution($1, 'X Y Z', '', '', '', '', array['x.edu'])`, [A]), /Organizers only/);

// ------------------------------------------------------------ students
const student = (u, inst) => as(u, `select public.save_student_profile($1, 'Stu', 'B.Tech', 'CSE', '3rd year', 'Flood sensor', 'LoRa mesh', 'Hardware validation')`, [inst]);
await ok("students see the institutions their email qualifies for", async () => {
  eq((await as(U.stuA, `select slug from public.my_student_options()`)).rows.map((r) => r.slug), ["iitg"]);
  eq((await as(U.stuSub, `select slug from public.my_student_options()`)).rows.map((r) => r.slug), ["iitg"]);
  eq((await as(U.outsider, `select slug from public.my_student_options()`)).rows, []);
});
await ok("students join with their institution email (subdomains count)", async () => {
  await student(U.stuA, A); await student(U.stuA2, A); await student(U.stuSub, A); await student(U.stuB, B);
});
await err("a student can't claim another institution", () => student(U.outsider, A), /institution email/);
await err("an IITG email can't join NITK", () => student(U.stuA2, B), /institution email/);
await ok("an organizer can allow a specific non-institution email", async () => {
  await as(U.orgA, `select public.org_allow_student_email($1, 'Visiting@gmail.com', 'exchange')`, [A]);
  await student(U.allowed, A);
});
await err("clients can't check the allow-list function directly", () =>
  as(U.outsider, `select public.email_matches_institution('visiting@gmail.com', $1)`, [A]), /permission denied/);

// ------------------------------------------------------------ alumni
const profile = (u, link = "https://meet.google.com/abc", skills = ["IoT", "Embedded"]) =>
  as(u, `select public.save_alumni_profile('Mentor', 'Director', 'Acme', 'Seattle', 'UTC', '', $1, $2, array['Startups'], 'Bio', true)`, [link, skills]);
const join = async (u, inst, code = null) => (await one(u, `select public.join_institution($1, 2005, 'B.Tech', 'ECE', $2) as s`, [inst, code])).s;
await err("joining needs a mentor profile first", () => join(U.alum, A), /mentor profile/);
await ok("alumni join an institution and wait for its organizers", async () => {
  await profile(U.alum); eq(await join(U.alum, A), "pending");
});
await err("pending alumni can't open slots", () => as(U.alum, `select public.add_slots(array[now() + interval '3 days'], 30)`), /approved alumni/);
await err("another institution's organizer can't approve them", () =>
  as(U.orgB, `select public.org_set_member_status($1, $2, 'approved')`, [A, U.alum]), /Organizers only/);
await ok("their own institution's organizer approves them", () => as(U.orgA, `select public.org_set_member_status($1, $2, 'approved')`, [A, U.alum]));
await ok("an alumnus can belong to several institutions", async () => { eq(await join(U.alum, B), "pending"); });
await ok("re-saving details keeps the status", async () => { eq(await join(U.alum, A), "approved"); });

// ------------------------------------------------------------ visibility
await ok("students only see mentors approved at their own institution", async () => {
  eq((await as(U.stuA, `select count(*)::int n from public.alumni_profiles where user_id = $1`, [U.alum])).rows[0].n, 1);
  eq((await as(U.stuB, `select count(*)::int n from public.alumni_profiles where user_id = $1`, [U.alum])).rows[0].n, 0);
});
await ok("students see a mentor's approved memberships at their institution only", async () => {
  eq((await as(U.stuA, `select institution_id from public.memberships where user_id = $1`, [U.alum])).rows.map((r) => r.institution_id), [A]);
});
await err("nobody but the server reads emails", () => as(U.stuA, `select email from public.profiles where id = $1`, [U.alum]), /permission denied/);
await err("nobody but the server reads meeting links", () => as(U.stuA, `select meeting_link from public.alumni_profiles`), /permission denied/);
await ok("organizers see their own students and alumni, not other institutions'", async () => {
  eq((await as(U.orgA, `select count(*)::int n from public.student_profiles`)).rows[0].n, 4);
  eq((await as(U.orgB, `select count(*)::int n from public.student_profiles`)).rows[0].n, 1);
  eq((await as(U.orgB, `select count(*)::int n from public.profiles where id = $1`, [U.stuA])).rows[0].n, 0);
  eq((await as(U.orgB, `select count(*)::int n from public.memberships where user_id = $1`, [U.alum])).rows[0].n, 1);
});

// ------------------------------------------------------------ slots and booking
let slots = [];
await ok("approved alumni open slots (past, inside-48h and overlapping skipped)", async () => {
  const r = await one(U.alum, `select public.add_slots(array[now() + interval '3 days', now() + interval '3 days 15 minutes',
    now() - interval '1 day', now() + interval '30 hours', now() + interval '4 days', now() + interval '5 days'], 30) as n`);
  eq(r.n, 3);
  slots = (await db.query(`select id from public.slots order by starts_at`)).rows.map((x) => x.id);
});
await ok("students of another institution don't see the mentor's slots", async () => {
  eq((await as(U.stuB, `select count(*)::int n from public.slots`)).rows[0].n, 0);
  eq((await as(U.stuA, `select count(*)::int n from public.slots`)).rows[0].n, 3);
});
await err("they can't book them either", () => as(U.stuB, `select public.book_slot($1, $2, '')`, [slots[0], BRIEF]), /not taking bookings/);
await err("a one-word brief is refused", () => as(U.stuA, `select public.book_slot($1, 'Career', '')`, [slots[0]]), /40 characters/);
let b1;
await ok("a student books a slot; the booking records their institution", async () => {
  b1 = (await one(U.stuA, `select public.book_slot($1, $2, '', '{"verdict":"specific"}'::jsonb) as id`, [slots[0], BRIEF])).id;
  eq((await db.query(`select institution_id from public.bookings where id = $1`, [b1])).rows[0].institution_id, A);
});
await err("one booking per slot", () => as(U.stuA2, `select public.book_slot($1, $2, '')`, [slots[0], BRIEF]), /just taken/);
await err("one upcoming session per mentor", () => as(U.stuA, `select public.book_slot($1, $2, '')`, [slots[1], BRIEF]), /already have an upcoming/);
await ok("after being approved at NITK, NITK students can book the same mentor", async () => {
  await as(U.orgB, `select public.org_set_member_status($1, $2, 'approved')`, [B, U.alum]);
  await as(U.stuB, `select public.book_slot($1, $2, '')`, [slots[1], BRIEF]);
});
await ok("the mentor sees the booking student's project", async () => {
  eq((await as(U.alum, `select count(*)::int n from public.student_profiles`)).rows[0].n, 2);
});
await ok("each organizer sees only their institution's sessions", async () => {
  eq((await as(U.orgA, `select count(*)::int n from public.bookings`)).rows[0].n, 1);
  eq((await as(U.orgB, `select count(*)::int n from public.bookings`)).rows[0].n, 1);
});
await err("another institution's organizer can't cancel a session", () => as(U.orgB, `select public.cancel_booking($1)`, [b1]), /not found/);
await ok("the institution's organizer can cancel it; the slot reopens", async () => {
  await as(U.orgA, `select public.cancel_booking($1)`, [b1]);
  eq((await db.query(`select is_booked from public.slots where id = $1`, [slots[0]])).rows[0].is_booked, false);
});
await ok("removing an alumnus from an institution hides them from its students", async () => {
  await as(U.orgB, `select public.org_set_member_status($1, $2, 'rejected')`, [B, U.alum]);
  eq((await as(U.stuB, `select count(*)::int n from public.slots`)).rows[0].n, 0);
});

// ------------------------------------------------------------ invites
await ok("pre-approved emails skip review at that institution only", async () => {
  await as(U.orgA, `select public.org_add_invites($1, array['INVITED@gmail.com'])`, [A]);
  await profile(U.invited, "", []);
  eq(await join(U.invited, A), "approved");
  eq(await join(U.invited, B), "pending");
});
await ok("inviting someone already pending approves them", async () => {
  await profile(U.alum2); eq(await join(U.alum2, A), "pending");
  await as(U.orgA, `select public.org_add_invites($1, array['ben@gmail.com'])`, [A]);
  eq((await db.query(`select status from public.memberships where user_id = $1`, [U.alum2])).rows[0].status, "approved");
});
await ok("invite links approve up to their limit, for their institution only", async () => {
  const code = (await one(U.orgA, `select public.org_create_invite_link($1, 'Sail', 30, 1) as c`, [A])).c;
  eq((await as(null, `select slug from public.invite_link_info($1)`, [code], "anon")).rows.map((r) => r.slug), ["iitg"]);
  await profile(U.linked); await profile(U.linked2);
  eq(await join(U.linked, B, code), "pending"); // wrong institution: not used up
  eq(await join(U.linked, A, code), "approved");
  eq(await join(U.linked2, A, code), "pending"); // limit reached
  eq((await as(null, `select count(*)::int n from public.invite_link_info($1)`, [code], "anon")).rows[0].n, 0);
});
await err("another institution's organizer can't revoke a link", async () => {
  const code = (await one(U.orgA, `select public.org_create_invite_link($1, 'x', 5, 5) as c`, [A])).c;
  await as(U.orgB, `select public.org_revoke_invite_link($1)`, [code]);
}, /Organizers only/);
await ok("slot setup asks for a meeting link and skills first", async () => {
  eq((await one(U.invited, `select public.slot_setup_missing() as m`)).m, ["meeting_link", "skills"]);
  await as(U.invited, `select public.save_slot_setup('https://zoom.us/j/1', array['VLSI'])`);
  eq((await one(U.invited, `select public.add_slots(array[now() + interval '6 days'], 60) as n`)).n, 1);
});

// ------------------------------------------------------------ organizers
await err("adding an organizer needs an existing account", () => as(U.orgA, `select public.org_add_organizer($1, 'nobody@x.com')`, [A]), /sign in once/);
await ok("organizers add co-organizers", async () => {
  await as(U.orgA, `select public.org_add_organizer($1, 'ASHA@gmail.com')`, [A]);
  eq((await as(U.alum, `select count(*)::int n from public.student_profiles where institution_id = $1`, [A])).rows[0].n, 4);
});
await err("the last organizer can't remove themselves", () => as(U.orgB, `select public.org_remove_organizer($1, $2)`, [B, U.orgB]), /at least one organizer/);

// ------------------------------------------------------------ analytics
await ok("a past session counts as completed in that institution's stats only", async () => {
  const s = await one(U.stuA2, `select public.book_slot($1, $2, '') as id`, [slots[2], BRIEF]);
  await db.exec(`update public.bookings set starts_at = now() - interval '2 hours' where id = '${s.id}'`);
  const a = (await one(U.orgA, `select public.org_stats($1) as s`, [A])).s;
  const b = (await one(U.orgB, `select public.org_stats($1) as s`, [B])).s;
  eq([a.completed_sessions, a.cancelled_sessions, a.completed_minutes, a.students], [1, 1, 30, 4]);
  eq([b.completed_sessions, b.upcoming_sessions], [0, 1]);
});
await err("organizers can't read another institution's stats", () => as(U.orgB, `select public.org_stats($1)`, [A]), /Organizers only/);
await ok("platform admins see every institution", async () => {
  const s = (await one(U.kartik, `select public.admin_stats() as s`)).s;
  eq([s.institutions_approved, s.students, s.completed_sessions, s.by_institution.length], [2, 5, 1, 2]);
  eq((await one(U.kartik, `select public.org_stats($1) as s`, [B])).s.students, 1);
});
await err("others can't read platform stats", () => as(U.orgA, `select public.admin_stats()`), /Platform admins/);
await err("clients can't write tables directly", () => as(U.orgA, `update public.memberships set status = 'approved'`), /permission denied/);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
