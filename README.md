# Alumni Connect

A mentoring site for any college or university. Institutions bring their alumni on board; students book one-on-one time with alumni **of their own institution**, matched to their project and the advice they want. Both people get an email with a calendar invite and the meeting link.

It grew out of [IITG Alumni Connect](https://github.com/kmuktinu1980/iitg-alumni-connect), generalized to many institutions.

**Stack:** Next.js 15 (App Router) · Supabase (Postgres, Auth, row-level security) · Vercel (hosting + daily cron) · Resend (email) · Claude API (matching, profile autofill, brief check).

---

## Who does what

| Who | How they get in | What they can do |
|---|---|---|
| **Platform admins** | Their email is in `public.platform_admin_emails` (seeded with `kmuktinu.uci@gmail.com` and `smandumula@gmail.com`) | Approve or reject institution applications; see every institution; act as organizer anywhere (`/admin`) |
| **Organizers** | Apply to bring an institution on board (`/institutions/apply`); approved by a platform admin. Organizers can add co-organizers | Run their institution at `/org/<slug>`: approve alumni, invite links, pre-approved emails, extra student emails, details and student email domains, sessions and analytics |
| **Alumni** | Any email. Describe themselves in a few lines (or upload a resume/LinkedIn PDF) and Claude fills in the profile. Then join one or more institutions | Approved by each institution's organizers, or straight away via that institution's invite link or pre-approved email. Open weekly slots |
| **Students** | Their institution email: the domain decides the institution (subdomains count). Organizers can allow specific other emails | See and book only their own institution's approved alumni |

Every institution also gets a public page, `/i/<slug>`, to share with its students and alumni.

### Rules the database enforces
- Students see only mentors approved at **their** institution; a mentor approved at several institutions serves all of them.
- Bookings at least **48 hours** ahead; briefs at least 40 characters; one booking per slot; one upcoming session per student–mentor pair; at most 3 upcoming sessions per student.
- Each booking records the student's institution, so organizers see only their own sessions and stats.
- Emails and meeting links are never readable by other users (column privacy); the server reads them with the service-role key after its own checks.
- All writes go through `SECURITY DEFINER` database functions; clients can only read what row-level security allows.

## Repository layout

```
supabase/migrations/0001_schema.sql   Schema, security rules and all write logic
supabase/tests/schema.test.mjs        54 rule tests against an in-memory Postgres
tests/api/                            Steel threads over the real Supabase API (22 tests)
tests/stack/                          Local Supabase (Auth + PostgREST) for the API tests
src/app/                              Pages: / /login /onboarding /pending /find /sessions
                                      /availability /profile /institutions/apply
                                      /i/[slug] (public) /org/[slug] (organizers) /admin (platform)
src/app/actions.ts                    Server actions (each calls a database function)
src/lib/                              Matching, autofill, brief check, email, calendar invites
```

---

## Setup (about 45 minutes)

### 1. Supabase
1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor**: run `supabase/migrations/0001_schema.sql`. To change the platform admins, edit the `insert into public.platform_admin_emails` line first (or the table afterwards).
3. **Authentication → URL Configuration**: Site URL = your production URL; add `https://YOUR-DOMAIN/auth/callback` and `http://localhost:3000/auth/callback` to Redirect URLs.
4. **Authentication → Emails → SMTP Settings**: turn on custom SMTP (Resend, or Gmail with an app password for a pilot). Supabase's built-in sender allows only 2 sign-in emails an hour. Then raise **Authentication → Rate Limits → emails per hour**.
5. **Recommended:** once SMTP is on, edit the **Magic Link** and **Confirm signup** templates so the link is `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email`. It then works when opened from a phone's mail app.
6. **Project Settings → API**: copy the project URL, the anon key and the service_role key.

### 2. Vercel
Import this repo at [vercel.com/new](https://vercel.com/new) and add the variables from `.env.example`:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role key (secret) |
| `NEXT_PUBLIC_SITE_URL` | Your production URL |
| `ANTHROPIC_API_KEY` | Claude API key, created inside a workspace (optional: matching falls back to keywords, autofill is off) |
| `RESEND_API_KEY`, `EMAIL_FROM` | Booking emails and invites (optional: skipped without them) |
| `CRON_SECRET` | Any long random string; protects the daily reminder job |

`NEXT_PUBLIC_*` values are read at build time, so redeploy after changing them.

### 3. First run
1. Sign in on the live site with a platform admin email. You land on **Platform admin**.
2. Apply for your first institution at `/institutions/apply` (or have its organizer apply), then approve it on `/admin`.
3. On `/org/<slug>`, create an invite link and share it with alumni groups. Students just sign in with their institution email.

---

## Tests

| Command | What it covers |
|---|---|
| `npm run test:db` | Institutions, approvals, visibility across institutions, booking rules, invites, analytics (in-memory Postgres; needs nothing) |
| `npm run test:api` | Seven steel threads as real signed-in users over the Supabase API: institution onboarding, alumni registration, student sign-up, booking, calendars, analytics, invites |

Run the API tests locally against a throwaway Supabase (needs Postgres 16 on port 54322):

```bash
bash tests/stack/start.sh
set -a && . tests/stack/.env.test && set +a
npm run test:api
```

Or point `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY` and `TEST_SUPABASE_SERVICE_ROLE_KEY` at a Supabase project. Each run tags what it creates with a run id and deletes it afterwards. CI (`.github/workflows/tests.yml`) runs type-check, the database tests and the API steel threads on every push; a manual job runs the steel threads against production using the `PROD_SUPABASE_*` repository secrets.

## Local development

```bash
npm install
cp .env.example .env.local   # Supabase keys required; email and Claude optional
npm run dev                  # http://localhost:3000
```
