-- Alumni Connect (multi-institution): schema, security rules and booking logic.
--
-- Model
--   * Institutions apply to join; platform admins approve them. The applicant
--     becomes the institution's first organizer.
--   * Organizers run their own institution: they approve its alumni, invite
--     mentors (pre-approved emails, invite links), allow extra student emails
--     and add other organizers.
--   * An alumnus has one mentor profile and can belong to several
--     institutions (one membership each, approved by that institution).
--   * A student belongs to one institution, proven by email domain (or an
--     organizer's allow-list), and only sees that institution's alumni.
--
-- Security
--   * Clients only READ, through row-level security (RLS).
--   * Every WRITE goes through a SECURITY DEFINER function below that checks
--     who is calling. Clients have no direct insert/update/delete.
--   * Emails and meeting links are never readable by other users; the server
--     reads them with the service-role key after its own checks.

-- ---------------------------------------------------------------- types
create type public.user_role as enum ('student', 'alumni');
create type public.review_status as enum ('pending', 'approved', 'rejected');
create type public.booking_status as enum ('booked', 'cancelled');

-- ---------------------------------------------------------------- settings
create or replace function public.min_notice() returns interval
language sql immutable set search_path = '' as $$ select interval '48 hours' $$;

-- Platform admins, by email. Anyone signing up with one of these is an admin.
create table public.platform_admin_emails (
  email text primary key check (email = lower(email))
);
insert into public.platform_admin_emails (email) values ('kmuktinu.uci@gmail.com'), ('smandumula@gmail.com');

-- ---------------------------------------------------------------- tables
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text not null default '',
  role        public.user_role,
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.institutions (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  name             text not null check (char_length(name) between 3 and 160),
  short_name       text not null default '' check (char_length(short_name) <= 40),
  city             text not null default '',
  country          text not null default '',
  website          text not null default '' check (website = '' or website ~* '^https?://'),
  -- Student emails end in one of these (subdomains count), e.g. {iitg.ac.in}.
  student_domains  text[] not null default '{}',
  status           public.review_status not null default 'pending',
  applicant_id     uuid references public.profiles (id) on delete set null,
  applicant_role   text not null default '' check (char_length(applicant_role) <= 200),
  applicant_note   text not null default '' check (char_length(applicant_note) <= 1000),
  decided_by       uuid references public.profiles (id) on delete set null,
  decided_at       timestamptz,
  created_at       timestamptz not null default now()
);

create table public.organizers (
  institution_id  uuid not null references public.institutions (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  added_by        uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  primary key (institution_id, user_id)
);

-- One mentor profile per alumnus, shared across their institutions.
create table public.alumni_profiles (
  user_id       uuid primary key references public.profiles (id) on delete cascade,
  job_title     text not null default '',
  organization  text not null default '',
  city          text not null default '',
  timezone      text not null default 'UTC',
  linkedin_url  text not null default '' check (linkedin_url = '' or linkedin_url ~* '^https://'),
  meeting_link  text not null default '' check (meeting_link = '' or meeting_link ~* '^https://'),
  skills        text[] not null default '{}',
  advice_areas  text[] not null default '{}',
  bio           text not null default '' check (char_length(bio) <= 1200),
  visible       boolean not null default true,
  updated_at    timestamptz not null default now()
);

-- An alumnus's tie to one institution, approved by that institution.
create table public.memberships (
  user_id         uuid not null references public.alumni_profiles (user_id) on delete cascade,
  institution_id  uuid not null references public.institutions (id) on delete cascade,
  grad_year       int not null check (grad_year between 1940 and 2100),
  degree          text not null check (char_length(degree) between 1 and 60),
  department      text not null default '' check (char_length(department) <= 120),
  status          public.review_status not null default 'pending',
  approved_via    text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (user_id, institution_id)
);
create index memberships_inst_idx on public.memberships (institution_id, status);

create table public.student_profiles (
  user_id          uuid primary key references public.profiles (id) on delete cascade,
  institution_id   uuid not null references public.institutions (id) on delete cascade,
  program          text not null default '' check (char_length(program) <= 60),
  department       text not null default '' check (char_length(department) <= 120),
  year_of_study    text not null default '',
  timezone         text not null default 'UTC',
  project_title    text not null check (char_length(project_title) between 1 and 200),
  project_summary  text not null default '' check (char_length(project_summary) <= 2000),
  seeking          text not null check (char_length(seeking) between 1 and 2000),
  updated_at       timestamptz not null default now()
);
create index student_profiles_inst_idx on public.student_profiles (institution_id);

-- Extra student emails an organizer lets in (e.g. a student whose institute email isn't working).
create table public.student_email_allowlist (
  institution_id  uuid not null references public.institutions (id) on delete cascade,
  email           text not null check (email = lower(email)),
  note            text not null default '',
  added_by        uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  primary key (institution_id, email)
);

-- Pre-approved alumni emails, per institution.
create table public.alumni_invites (
  institution_id  uuid not null references public.institutions (id) on delete cascade,
  email           text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  note            text not null default '',
  invited_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  primary key (institution_id, email)
);

-- Shareable invite links, per institution. Alumni who join through a valid link are approved.
create table public.invite_links (
  code            text primary key check (code ~ '^[a-z0-9]{8,32}$'),
  institution_id  uuid not null references public.institutions (id) on delete cascade,
  label           text not null default '' check (char_length(label) <= 120),
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  max_uses        int not null check (max_uses between 1 and 1000),
  uses            int not null default 0,
  revoked         boolean not null default false
);

create table public.slots (
  id            uuid primary key default gen_random_uuid(),
  alumni_id     uuid not null references public.alumni_profiles (user_id) on delete cascade,
  starts_at     timestamptz not null,
  duration_min  int not null check (duration_min in (30, 45, 60)),
  is_booked     boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (alumni_id, starts_at)
);
create index slots_open_idx on public.slots (alumni_id, starts_at) where not is_booked;

create table public.bookings (
  id                uuid primary key default gen_random_uuid(),
  slot_id           uuid references public.slots (id) on delete set null,
  institution_id    uuid not null references public.institutions (id) on delete cascade,
  alumni_id         uuid not null references public.profiles (id) on delete cascade,
  student_id        uuid not null references public.profiles (id) on delete cascade,
  starts_at         timestamptz not null,
  duration_min      int not null,
  topic             text not null check (char_length(topic) between 1 and 1000),
  note              text not null default '' check (char_length(note) <= 500),
  brief_check       jsonb,
  status            public.booking_status not null default 'booked',
  cancelled_by      uuid references public.profiles (id) on delete set null,
  cancelled_at      timestamptz,
  reminder_sent_at  timestamptz,
  created_at        timestamptz not null default now()
);
-- The real guarantee against double booking: one active booking per slot.
create unique index bookings_one_active_per_slot on public.bookings (slot_id) where status = 'booked';
create index bookings_student_idx on public.bookings (student_id, starts_at);
create index bookings_alumni_idx on public.bookings (alumni_id, starts_at);
create index bookings_inst_idx on public.bookings (institution_id, starts_at);

create table public.match_requests (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.profiles (id) on delete cascade,
  query       jsonb not null,
  results     jsonb not null default '[]',
  method      text not null,
  created_at  timestamptz not null default now()
);
create index match_requests_student_idx on public.match_requests (student_id, created_at);

-- ---------------------------------------------------------------- helpers
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false) $$;

create or replace function public.is_organizer(p_inst uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (select 1 from public.organizers where institution_id = p_inst and user_id = auth.uid()) $$;

-- Institutions the caller organizes (all of them for platform admins).
create or replace function public.my_organized() returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from public.institutions where public.is_admin()
  union
  select institution_id from public.organizers where user_id = auth.uid() $$;

-- The institution the calling student belongs to.
create or replace function public.my_student_institution() returns uuid
language sql stable security definer set search_path = public as $$
  select institution_id from public.student_profiles where user_id = auth.uid() $$;

-- Can the calling student see (and book) this mentor?
create or replace function public.mentor_visible_to_me(p_alumni uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.student_profiles s
    join public.memberships m on m.institution_id = s.institution_id and m.status = 'approved'
    join public.alumni_profiles a on a.user_id = m.user_id and a.visible
    join public.institutions i on i.id = s.institution_id and i.status = 'approved'
    where s.user_id = auth.uid() and m.user_id = p_alumni
  ) $$;

-- Is this person an alumnus or student of an institution the caller organizes?
create or replace function public.in_my_institutions(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships where user_id = p_user and institution_id in (select public.my_organized()))
      or exists (select 1 from public.student_profiles where user_id = p_user and institution_id in (select public.my_organized()))
      or exists (select 1 from public.institutions where applicant_id = p_user and id in (select public.my_organized()))
      or exists (select 1 from public.organizers where user_id = p_user and institution_id in (select public.my_organized())) $$;

create or replace function public.shares_booking(p_other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.bookings b
    where (b.student_id = auth.uid() and b.alumni_id = p_other)
       or (b.alumni_id = auth.uid() and b.student_id = p_other)
  ) $$;

-- Does this email belong to the institution's students (domain or allow-list)?
create or replace function public.email_matches_institution(p_email text, p_inst uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.institutions i, unnest(i.student_domains) d
    where i.id = p_inst
      and (split_part(lower(p_email), '@', 2) = d or split_part(lower(p_email), '@', 2) like '%.' || d)
  ) or exists (select 1 from public.student_email_allowlist a where a.institution_id = p_inst and a.email = lower(trim(p_email))) $$;

-- Approved institutions whose students the caller can be (by email).
create or replace function public.my_student_options() returns table (id uuid, name text, slug text)
language sql stable security definer set search_path = public as $$
  select i.id, i.name, i.slug from public.institutions i, public.profiles p
  where p.id = auth.uid() and i.status = 'approved' and public.email_matches_institution(p.email, i.id)
  order by i.name $$;

create or replace function public.slugify(p text) returns text
language sql immutable set search_path = '' as $$
  select left(trim(both '-' from regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]+', '-', 'g')), 50) $$;

create or replace function public.clean_domains(p text[]) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(array_agg(distinct d order by d), '{}')
  from (select regexp_replace(lower(trim(x)), '^@|^https?://|/.*$', '', 'g') as d from unnest(coalesce(p, '{}')) x) t
  where d ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$' $$;

-- New sign-up -> profile row (and admin flag for platform admin emails).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, is_admin)
  values (
    new.id,
    lower(coalesce(new.email, '')),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    exists (select 1 from public.platform_admin_emails where email = lower(coalesce(new.email, '')))
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- institutions
create or replace function public.apply_institution(
  p_name text, p_short_name text, p_city text, p_country text, p_website text,
  p_domains text[], p_role text, p_note text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare me public.profiles; base text; s text; n int := 1; new_id uuid;
begin
  select * into me from public.profiles where id = auth.uid();
  if not found then raise exception 'Please sign in again.'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 3 then raise exception 'Add the institution''s full name.'; end if;
  if coalesce(array_length(public.clean_domains(p_domains), 1), 0) = 0 then
    raise exception 'Add the email domain students use, e.g. iitg.ac.in.';
  end if;
  if char_length(trim(coalesce(p_role, ''))) < 3 then raise exception 'Tell us your role at the institution.'; end if;
  if (select count(*) from public.institutions where applicant_id = me.id and status = 'pending') >= 3 then
    raise exception 'You already have 3 applications waiting. We''ll review them soon.';
  end if;
  if exists (select 1 from public.institutions where lower(name) = lower(trim(p_name)) and status <> 'rejected') then
    raise exception 'That institution is already on Alumni Connect or has applied. Ask its organizers to add you.';
  end if;

  base := public.slugify(coalesce(nullif(trim(p_short_name), ''), p_name));
  if base = '' then base := 'institution'; end if;
  s := base;
  while exists (select 1 from public.institutions where slug = s) loop
    n := n + 1; s := base || '-' || n;
  end loop;

  insert into public.institutions (slug, name, short_name, city, country, website, student_domains,
                                   applicant_id, applicant_role, applicant_note)
  values (s, trim(p_name), trim(coalesce(p_short_name, '')), trim(coalesce(p_city, '')), trim(coalesce(p_country, '')),
          trim(coalesce(p_website, '')), public.clean_domains(p_domains), me.id,
          trim(p_role), trim(coalesce(p_note, '')))
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.admin_decide_institution(p_inst uuid, p_status public.review_status) returns void
language plpgsql security definer set search_path = public as $$
declare inst public.institutions;
begin
  if not public.is_admin() then raise exception 'Platform admins only.'; end if;
  select * into inst from public.institutions where id = p_inst for update;
  if not found then raise exception 'Institution not found.'; end if;
  update public.institutions set status = p_status, decided_by = auth.uid(), decided_at = now() where id = p_inst;
  if p_status = 'approved' and inst.applicant_id is not null then
    insert into public.organizers (institution_id, user_id, added_by) values (p_inst, inst.applicant_id, auth.uid())
    on conflict do nothing;
  end if;
end $$;

create or replace function public.org_update_institution(
  p_inst uuid, p_name text, p_short_name text, p_city text, p_country text, p_website text, p_domains text[]
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_organizer(p_inst) then raise exception 'Organizers only.'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 3 then raise exception 'Add the institution''s full name.'; end if;
  if coalesce(array_length(public.clean_domains(p_domains), 1), 0) = 0 then
    raise exception 'Keep at least one student email domain.';
  end if;
  update public.institutions
     set name = trim(p_name), short_name = trim(coalesce(p_short_name, '')), city = trim(coalesce(p_city, '')),
         country = trim(coalesce(p_country, '')), website = trim(coalesce(p_website, '')),
         student_domains = public.clean_domains(p_domains)
   where id = p_inst;
end $$;

create or replace function public.org_add_organizer(p_inst uuid, p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare who uuid;
begin
  if not public.is_organizer(p_inst) then raise exception 'Organizers only.'; end if;
  select id into who from public.profiles where email = lower(trim(p_email));
  if who is null then raise exception 'No account with that email yet. Ask them to sign in once, then add them.'; end if;
  insert into public.organizers (institution_id, user_id, added_by) values (p_inst, who, auth.uid()) on conflict do nothing;
end $$;

create or replace function public.org_remove_organizer(p_inst uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_organizer(p_inst) then raise exception 'Organizers only.'; end if;
  if (select count(*) from public.organizers where institution_id = p_inst) <= 1 and not public.is_admin() then
    raise exception 'Every institution needs at least one organizer.';
  end if;
  delete from public.organizers where institution_id = p_inst and user_id = p_user;
end $$;

-- ---------------------------------------------------------------- students
create or replace function public.save_student_profile(
  p_institution uuid, p_full_name text, p_program text, p_department text, p_year text,
  p_project_title text, p_project_summary text, p_seeking text, p_timezone text default 'UTC'
) returns void
language plpgsql security definer set search_path = public as $$
declare me public.profiles;
begin
  select * into me from public.profiles where id = auth.uid();
  if not found then raise exception 'Please sign in again.'; end if;
  if me.role = 'alumni' then raise exception 'This account is set up as an alumnus. Use your institution email for a student account.'; end if;
  if not exists (select 1 from public.institutions where id = p_institution and status = 'approved') then
    raise exception 'That institution isn''t on Alumni Connect yet.';
  end if;
  if not public.email_matches_institution(me.email, p_institution) then
    raise exception 'Student accounts need your institution email. Sign in with it, or ask an organizer to add your email.';
  end if;
  if coalesce(trim(p_full_name), '') = '' then raise exception 'Add your name.'; end if;

  update public.profiles set full_name = trim(p_full_name), role = 'student', updated_at = now() where id = me.id;

  insert into public.student_profiles (user_id, institution_id, program, department, year_of_study, timezone,
                                       project_title, project_summary, seeking)
  values (me.id, p_institution, trim(coalesce(p_program, '')), trim(coalesce(p_department, '')), coalesce(p_year, ''),
          coalesce(nullif(p_timezone, ''), 'UTC'), trim(p_project_title), trim(coalesce(p_project_summary, '')), trim(p_seeking))
  on conflict (user_id) do update set
    institution_id = excluded.institution_id, program = excluded.program, department = excluded.department,
    year_of_study = excluded.year_of_study, timezone = excluded.timezone, project_title = excluded.project_title,
    project_summary = excluded.project_summary, seeking = excluded.seeking, updated_at = now();
end $$;

create or replace function public.org_allow_student_email(p_inst uuid, p_email text, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare clean text := lower(trim(coalesce(p_email, '')));
begin
  if not public.is_organizer(p_inst) then raise exception 'Organizers only.'; end if;
  if clean !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'That isn''t an email address.'; end if;
  insert into public.student_email_allowlist (institution_id, email, note, added_by)
  values (p_inst, clean, left(coalesce(p_note, ''), 200), auth.uid()) on conflict do nothing;
end $$;

create or replace function public.org_remove_student_email(p_inst uuid, p_email text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_organizer(p_inst) then raise exception 'Organizers only.'; end if;
  delete from public.student_email_allowlist where institution_id = p_inst and email = lower(trim(p_email));
end $$;

-- ---------------------------------------------------------------- alumni
create or replace function public.save_alumni_profile(
  p_full_name text, p_job_title text, p_organization text, p_city text, p_timezone text,
  p_linkedin_url text, p_meeting_link text, p_skills text[], p_advice_areas text[],
  p_bio text, p_visible boolean
) returns void
language plpgsql security definer set search_path = public as $$
declare me public.profiles;
begin
  select * into me from public.profiles where id = auth.uid();
  if not found then raise exception 'Please sign in again.'; end if;
  if me.role = 'student' then raise exception 'This account is set up as a student.'; end if;
  if coalesce(trim(p_full_name), '') = '' then raise exception 'Add your name.'; end if;
  if coalesce(array_length(p_advice_areas, 1), 0) = 0 then raise exception 'Pick at least one area you can advise on.'; end if;
  if trim(coalesce(p_meeting_link, '')) = '' and exists (
       select 1 from public.slots where alumni_id = me.id and starts_at > now()) then
    raise exception 'Keep a meeting link while you have upcoming slots. Students use it to join.';
  end if;

  update public.profiles set full_name = trim(p_full_name), role = 'alumni', updated_at = now() where id = me.id;

  insert into public.alumni_profiles (user_id, job_title, organization, city, timezone, linkedin_url, meeting_link,
                                      skills, advice_areas, bio, visible)
  values (me.id, trim(coalesce(p_job_title, '')), trim(coalesce(p_organization, '')), trim(coalesce(p_city, '')),
          coalesce(nullif(p_timezone, ''), 'UTC'), trim(coalesce(p_linkedin_url, '')), trim(coalesce(p_meeting_link, '')),
          coalesce(p_skills[1:20], '{}'), p_advice_areas, trim(coalesce(p_bio, '')), coalesce(p_visible, true))
  on conflict (user_id) do update set
    job_title = excluded.job_title, organization = excluded.organization, city = excluded.city,
    timezone = excluded.timezone, linkedin_url = excluded.linkedin_url, meeting_link = excluded.meeting_link,
    skills = excluded.skills, advice_areas = excluded.advice_areas, bio = excluded.bio,
    visible = excluded.visible, updated_at = now();
end $$;

-- Join (or update details for) one institution. Returns the membership status.
create or replace function public.join_institution(
  p_inst uuid, p_grad_year int, p_degree text, p_department text, p_invite text default null
) returns public.review_status
language plpgsql security definer set search_path = public as $$
declare me public.profiles; cur public.memberships; new_status public.review_status := 'pending'; via text := '';
        v_code text := lower(trim(coalesce(p_invite, '')));
begin
  select * into me from public.profiles where id = auth.uid();
  if not found then raise exception 'Please sign in again.'; end if;
  if me.role is distinct from 'alumni' or not exists (select 1 from public.alumni_profiles where user_id = me.id) then
    raise exception 'Save your mentor profile first.';
  end if;
  if not exists (select 1 from public.institutions where id = p_inst and status = 'approved') then
    raise exception 'That institution isn''t on Alumni Connect yet.';
  end if;
  if p_grad_year is null or p_grad_year < 1940 or p_grad_year > extract(year from now())::int + 1 then
    raise exception 'Add your graduating year.';
  end if;
  if coalesce(trim(p_degree), '') = '' then raise exception 'Add your degree.'; end if;

  select * into cur from public.memberships where user_id = me.id and institution_id = p_inst;
  if found then
    new_status := cur.status;
  else
    if exists (select 1 from public.alumni_invites where institution_id = p_inst and email = me.email) then
      new_status := 'approved'; via := 'invite:' || me.email;
    elsif v_code <> '' then
      update public.invite_links l set uses = l.uses + 1
       where l.code = v_code and l.institution_id = p_inst and not l.revoked and l.expires_at > now() and l.uses < l.max_uses;
      if found then new_status := 'approved'; via := 'link:' || v_code; end if;
    end if;
  end if;

  insert into public.memberships (user_id, institution_id, grad_year, degree, department, status, approved_via)
  values (me.id, p_inst, p_grad_year, trim(p_degree), trim(coalesce(p_department, '')), new_status, via)
  on conflict (user_id, institution_id) do update set
    grad_year = excluded.grad_year, degree = excluded.degree, department = excluded.department, updated_at = now();
  return new_status;
end $$;

create or replace function public.leave_institution(p_inst uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.memberships where user_id = auth.uid() and institution_id = p_inst;
end $$;

create or replace function public.org_set_member_status(p_inst uuid, p_user uuid, p_status public.review_status) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_organizer(p_inst) then raise exception 'Organizers only.'; end if;
  update public.memberships
     set status = p_status, updated_at = now(),
         approved_via = case when p_status = 'approved' and approved_via = '' then 'organizer' else approved_via end
   where institution_id = p_inst and user_id = p_user;
  if not found then raise exception 'Alumnus not found.'; end if;
end $$;

-- ---------------------------------------------------------------- invites
create or replace function public.invite_link_info(p_code text) returns table (institution_id uuid, name text, slug text)
language sql stable security definer set search_path = public as $$
  select i.id, i.name, i.slug from public.invite_links l join public.institutions i on i.id = l.institution_id
  where l.code = lower(trim(coalesce(p_code, ''))) and not l.revoked and l.expires_at > now() and l.uses < l.max_uses
    and i.status = 'approved' $$;

create or replace function public.org_add_invites(p_inst uuid, p_emails text[], p_note text default '') returns int
language plpgsql security definer set search_path = public as $$
declare e text; n int := 0; clean text;
begin
  if not public.is_organizer(p_inst) then raise exception 'Organizers only.'; end if;
  foreach e in array coalesce(p_emails, '{}') loop
    clean := lower(trim(e));
    continue when clean !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$';
    insert into public.alumni_invites (institution_id, email, note, invited_by)
    values (p_inst, clean, left(coalesce(p_note, ''), 200), auth.uid()) on conflict do nothing;
    if found then n := n + 1; end if;
    -- Someone already waiting for approval with this email is approved now.
    update public.memberships m set status = 'approved', approved_via = 'invite:' || clean, updated_at = now()
      from public.profiles p
     where p.id = m.user_id and p.email = clean and m.institution_id = p_inst and m.status = 'pending';
  end loop;
  return n;
end $$;

create or replace function public.org_remove_invite(p_inst uuid, p_email text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_organizer(p_inst) then raise exception 'Organizers only.'; end if;
  delete from public.alumni_invites where institution_id = p_inst and email = lower(trim(p_email));
end $$;

create or replace function public.org_create_invite_link(p_inst uuid, p_label text, p_days int, p_max_uses int) returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not public.is_organizer(p_inst) then raise exception 'Organizers only.'; end if;
  if not exists (select 1 from public.institutions where id = p_inst and status = 'approved') then
    raise exception 'The institution must be approved first.';
  end if;
  if p_days not between 1 and 365 then raise exception 'Links can last 1 to 365 days.'; end if;
  if p_max_uses not between 1 and 1000 then raise exception 'Allow between 1 and 1000 sign-ups.'; end if;
  c := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  insert into public.invite_links (code, institution_id, label, created_by, expires_at, max_uses)
  values (c, p_inst, left(trim(coalesce(p_label, '')), 120), auth.uid(), now() + make_interval(days => p_days), p_max_uses);
  return c;
end $$;

create or replace function public.org_revoke_invite_link(p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare inst uuid;
begin
  select institution_id into inst from public.invite_links where code = lower(trim(p_code));
  if inst is null or not public.is_organizer(inst) then raise exception 'Organizers only.'; end if;
  update public.invite_links set revoked = true where code = lower(trim(p_code));
end $$;

-- ---------------------------------------------------------------- availability
create or replace function public.slot_setup_missing() returns text[]
language sql stable security definer set search_path = public as $$
  select array_remove(array[
    case when coalesce(a.meeting_link, '') = '' then 'meeting_link' end,
    case when coalesce(array_length(a.skills, 1), 0) = 0 then 'skills' end
  ], null)
  from public.profiles p left join public.alumni_profiles a on a.user_id = p.id
  where p.id = auth.uid() $$;

create or replace function public.save_slot_setup(p_meeting_link text, p_skills text[]) returns void
language plpgsql security definer set search_path = public as $$
declare me public.profiles; link text;
begin
  select * into me from public.profiles where id = auth.uid();
  if not found or me.role is distinct from 'alumni' then raise exception 'Only alumni can do this.'; end if;
  select coalesce(nullif(trim(coalesce(p_meeting_link, '')), ''), meeting_link) into link
    from public.alumni_profiles where user_id = me.id;
  if coalesce(link, '') !~* '^https://[^\s/]+\.[^\s]+$' then raise exception 'Add your meeting link.'; end if;
  if coalesce(array_length(p_skills, 1), 0) = 0 then raise exception 'Add at least one skill.'; end if;
  update public.alumni_profiles set meeting_link = link, skills = p_skills[1:20], updated_at = now() where user_id = me.id;
end $$;

create or replace function public.add_slots(p_starts timestamptz[], p_duration int) returns int
language plpgsql security definer set search_path = public as $$
declare a public.alumni_profiles; s timestamptz; added int := 0; future_count int;
begin
  select * into a from public.alumni_profiles where user_id = auth.uid();
  if not found or not exists (select 1 from public.memberships where user_id = a.user_id and status = 'approved') then
    raise exception 'Only approved alumni can open slots.';
  end if;
  if coalesce(a.meeting_link, '') = '' then raise exception 'Add your meeting link before opening slots.'; end if;
  if coalesce(array_length(a.skills, 1), 0) = 0 then raise exception 'Add a few skills before opening slots, so students can find you.'; end if;
  if p_duration not in (30, 45, 60) then raise exception 'Slots are 30, 45 or 60 minutes.'; end if;

  foreach s in array p_starts loop
    -- Students need 48 hours' notice, so a slot inside that window could never be booked.
    continue when s < now() + public.min_notice();
    continue when exists (
      select 1 from public.slots x
      where x.alumni_id = a.user_id
        and s < x.starts_at + make_interval(mins => x.duration_min)
        and x.starts_at < s + make_interval(mins => p_duration)
    );
    insert into public.slots (alumni_id, starts_at, duration_min) values (a.user_id, s, p_duration);
    added := added + 1;
  end loop;

  select count(*) into future_count from public.slots where alumni_id = a.user_id and starts_at > now();
  if future_count > 60 then raise exception 'You can have up to 60 upcoming slots. Remove some first.'; end if;
  return added;
end $$;

create or replace function public.remove_slot(p_slot uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s public.slots;
begin
  select * into s from public.slots where id = p_slot for update;
  if not found or s.alumni_id <> auth.uid() then raise exception 'Slot not found.'; end if;
  if s.is_booked then raise exception 'A student has booked this slot. Cancel the session first.'; end if;
  delete from public.slots where id = p_slot;
end $$;

-- ---------------------------------------------------------------- booking
create or replace function public.book_slot(p_slot uuid, p_topic text, p_note text, p_brief_check jsonb default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare me public.profiles; inst uuid; s public.slots; new_id uuid;
begin
  select * into me from public.profiles where id = auth.uid();
  select institution_id into inst from public.student_profiles where user_id = auth.uid();
  if me.id is null or me.role is distinct from 'student' or inst is null then
    raise exception 'Only signed-in students can book sessions.';
  end if;
  if char_length(trim(coalesce(p_topic, ''))) < 40 then
    raise exception 'Describe what you want to cover in a sentence or two (at least 40 characters) so your mentor can prepare.';
  end if;

  -- Row lock: concurrent bookings of the same slot queue here.
  select * into s from public.slots where id = p_slot for update;
  if not found then raise exception 'That slot is no longer offered.'; end if;
  if s.is_booked then raise exception 'That slot was just taken. Pick another.'; end if;
  if s.starts_at < now() + public.min_notice() then
    raise exception 'Sessions need to be booked at least 48 hours ahead. Pick a later slot.';
  end if;
  if not public.mentor_visible_to_me(s.alumni_id) then raise exception 'This mentor is not taking bookings right now.'; end if;

  if exists (select 1 from public.bookings
             where student_id = me.id and alumni_id = s.alumni_id and status = 'booked' and starts_at > now()) then
    raise exception 'You already have an upcoming session with this mentor.';
  end if;
  if (select count(*) from public.bookings where student_id = me.id and status = 'booked' and starts_at > now()) >= 3 then
    raise exception 'You can hold up to 3 upcoming sessions. Cancel one or wait until one is done.';
  end if;

  insert into public.bookings (slot_id, institution_id, alumni_id, student_id, starts_at, duration_min, topic, note, brief_check)
  values (s.id, inst, s.alumni_id, me.id, s.starts_at, s.duration_min, trim(p_topic), trim(coalesce(p_note, '')), p_brief_check)
  returning id into new_id;

  update public.slots set is_booked = true where id = s.id;
  return new_id;
end $$;

create or replace function public.cancel_booking(p_booking uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b public.bookings;
begin
  select * into b from public.bookings where id = p_booking for update;
  if not found or not (b.student_id = auth.uid() or b.alumni_id = auth.uid() or public.is_organizer(b.institution_id)) then
    raise exception 'Session not found.';
  end if;
  if b.status <> 'booked' then raise exception 'This session is already cancelled.'; end if;
  if b.starts_at + make_interval(mins => b.duration_min) < now() then raise exception 'This session has already happened.'; end if;

  update public.bookings set status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now() where id = b.id;
  -- Reopen the slot only if another student could still book it.
  update public.slots set is_booked = false where id = b.slot_id and starts_at > now() + public.min_notice();
end $$;

-- ---------------------------------------------------------------- analytics
-- A session counts as "completed" once it was booked (not cancelled) and its end time has passed.
create or replace function public.org_stats(p_inst uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.is_organizer(p_inst) then raise exception 'Organizers only.'; end if;
  with b as (
    select bk.*, bk.starts_at + make_interval(mins => bk.duration_min) as ends_at
    from public.bookings bk where bk.institution_id = p_inst
  )
  select jsonb_build_object(
    'alumni_approved',    (select count(*) from public.memberships where institution_id = p_inst and status = 'approved'),
    'alumni_pending',     (select count(*) from public.memberships where institution_id = p_inst and status = 'pending'),
    'students',           (select count(*) from public.student_profiles where institution_id = p_inst),
    'open_slots',         (select count(*) from public.slots s
                             join public.memberships m on m.user_id = s.alumni_id and m.institution_id = p_inst and m.status = 'approved'
                             join public.alumni_profiles a on a.user_id = s.alumni_id and a.visible
                            where not s.is_booked and s.starts_at > now() + public.min_notice()),
    'upcoming_sessions',  (select count(*) from b where status = 'booked' and ends_at > now()),
    'completed_sessions', (select count(*) from b where status = 'booked' and ends_at <= now()),
    'cancelled_sessions', (select count(*) from b where status = 'cancelled'),
    'completed_minutes',  (select coalesce(sum(duration_min), 0) from b where status = 'booked' and ends_at <= now()),
    'match_searches',     (select count(*) from public.match_requests r
                             join public.student_profiles sp on sp.user_id = r.student_id
                            where sp.institution_id = p_inst and r.method <> 'autofill'),
    'completed_by_mentor', coalesce((
      select jsonb_agg(x order by x.sessions desc, x.name) from (
        select b.alumni_id, p.full_name as name, count(*) as sessions
        from b join public.profiles p on p.id = b.alumni_id
        where b.status = 'booked' and b.ends_at <= now()
        group by b.alumni_id, p.full_name) x), '[]'::jsonb)
  ) into result;
  return result;
end $$;

create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Platform admins only.'; end if;
  return jsonb_build_object(
    'institutions_approved', (select count(*) from public.institutions where status = 'approved'),
    'institutions_pending',  (select count(*) from public.institutions where status = 'pending'),
    'alumni',                (select count(distinct user_id) from public.memberships where status = 'approved'),
    'students',              (select count(*) from public.student_profiles),
    'completed_sessions',    (select count(*) from public.bookings
                               where status = 'booked' and starts_at + make_interval(mins => duration_min) <= now()),
    'upcoming_sessions',     (select count(*) from public.bookings
                               where status = 'booked' and starts_at + make_interval(mins => duration_min) > now()),
    'by_institution', coalesce((
      select jsonb_agg(x order by x.name) from (
        select i.id, i.slug, i.name, i.status,
               (select count(*) from public.memberships m where m.institution_id = i.id and m.status = 'approved') as alumni,
               (select count(*) from public.memberships m where m.institution_id = i.id and m.status = 'pending') as alumni_pending,
               (select count(*) from public.student_profiles s where s.institution_id = i.id) as students,
               (select count(*) from public.bookings b where b.institution_id = i.id and b.status = 'booked'
                   and b.starts_at + make_interval(mins => b.duration_min) <= now()) as completed
        from public.institutions i where i.status = 'approved') x), '[]'::jsonb)
  );
end $$;

-- Public numbers for the home page and institution pages (no personal data).
create or replace function public.public_directory() returns table (
  id uuid, slug text, name text, short_name text, city text, country text, website text, mentors bigint
)
language sql stable security definer set search_path = public as $$
  select i.id, i.slug, i.name, i.short_name, i.city, i.country, i.website,
         (select count(*) from public.memberships m join public.alumni_profiles a on a.user_id = m.user_id and a.visible
           where m.institution_id = i.id and m.status = 'approved')
  from public.institutions i where i.status = 'approved' order by i.name $$;

-- ---------------------------------------------------------------- row-level security
alter table public.platform_admin_emails   enable row level security;
alter table public.profiles                enable row level security;
alter table public.institutions            enable row level security;
alter table public.organizers              enable row level security;
alter table public.alumni_profiles         enable row level security;
alter table public.memberships             enable row level security;
alter table public.student_profiles        enable row level security;
alter table public.student_email_allowlist enable row level security;
alter table public.alumni_invites          enable row level security;
alter table public.invite_links            enable row level security;
alter table public.slots                   enable row level security;
alter table public.bookings                enable row level security;
alter table public.match_requests          enable row level security;

create policy profiles_read on public.profiles for select to authenticated using (
  id = auth.uid() or public.is_admin() or public.in_my_institutions(id)
  or public.mentor_visible_to_me(id) or public.shares_booking(id)
);
create policy institutions_read on public.institutions for select to anon, authenticated using (
  status = 'approved' or applicant_id = auth.uid() or public.is_admin()
);
create policy organizers_read on public.organizers for select to authenticated using (
  user_id = auth.uid() or public.is_organizer(institution_id)
);
create policy alumni_read on public.alumni_profiles for select to authenticated using (
  user_id = auth.uid() or public.is_admin() or public.in_my_institutions(user_id)
  or public.mentor_visible_to_me(user_id) or public.shares_booking(user_id)
);
create policy memberships_read on public.memberships for select to authenticated using (
  user_id = auth.uid() or public.is_organizer(institution_id)
  or (status = 'approved' and institution_id = public.my_student_institution())
);
create policy students_read on public.student_profiles for select to authenticated using (
  user_id = auth.uid() or public.is_organizer(institution_id) or public.shares_booking(user_id)
);
create policy allowlist_read on public.student_email_allowlist for select to authenticated using (public.is_organizer(institution_id));
create policy invites_read on public.alumni_invites for select to authenticated using (public.is_organizer(institution_id));
create policy links_read on public.invite_links for select to authenticated using (public.is_organizer(institution_id));
create policy slots_read on public.slots for select to authenticated using (
  alumni_id = auth.uid() or public.is_admin() or public.mentor_visible_to_me(alumni_id)
);
create policy bookings_read on public.bookings for select to authenticated using (
  student_id = auth.uid() or alumni_id = auth.uid() or public.is_organizer(institution_id)
);
create policy match_read on public.match_requests for select to authenticated using (
  student_id = auth.uid() or public.is_admin()
);

-- No write policies: clients cannot insert/update/delete directly.
-- Column-level privacy: other users never see emails or meeting links.
revoke all on all tables in schema public from anon, authenticated;

grant select (id, full_name, role, is_admin, created_at) on public.profiles to authenticated;
grant select (id, slug, name, short_name, city, country, website, student_domains, status, created_at)
  on public.institutions to anon, authenticated;
grant select (applicant_id, applicant_role, applicant_note, decided_at) on public.institutions to authenticated;
grant select (user_id, job_title, organization, city, timezone, linkedin_url, skills, advice_areas, bio, visible, updated_at)
  on public.alumni_profiles to authenticated;
grant select on public.organizers, public.memberships, public.student_profiles, public.student_email_allowlist,
                public.alumni_invites, public.invite_links, public.slots, public.bookings, public.match_requests
  to authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
revoke execute on function public.handle_new_user(), public.email_matches_institution(text, uuid) from authenticated;
grant execute on function public.invite_link_info(text), public.public_directory(), public.is_admin() to anon;
