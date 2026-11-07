// Test harness for the API steel threads.
//
// Talks to a real Supabase project over HTTP, exactly as the site does:
// people sign in and call the same tables and database functions (RPCs),
// with row-level security applied. The service-role key is used only for
// test setup and clean-up: creating throwaway accounts (no emails are sent),
// moving a session into the past to simulate it finishing, and deleting
// everything the run created.
//
// Required environment:
//   TEST_SUPABASE_URL                 e.g. https://<project>.supabase.co
//   TEST_SUPABASE_ANON_KEY            the publishable / anon key
//   TEST_SUPABASE_SERVICE_ROLE_KEY    the secret / service-role key
// Use a separate test project if you can. Against production, every record
// the run creates is tagged with a unique run id and deleted afterwards.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";

export const env = {
  url: process.env.TEST_SUPABASE_URL?.trim().replace(/\/+$/, "") ?? "",
  anon: process.env.TEST_SUPABASE_ANON_KEY?.trim() ?? "",
  service: process.env.TEST_SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "",
};
export const configured = Boolean(env.url && env.anon && env.service);

/** Short id that tags everything this run creates. */
export const RUN = `st${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;

const opts = { auth: { persistSession: false, autoRefreshToken: false } } as const;
export const service = () => createClient(env.url, env.service, opts);

export type Person = { id: string; email: string; client: SupabaseClient };

const created: string[] = [];

/** Create a confirmed account and return a client signed in as that person. */
export async function newPerson(label: string, domain = "example.com", fullName = `Test ${label}`): Promise<Person> {
  const email = `${RUN}-${label}@${domain}`.toLowerCase();
  return newPersonWithEmail(email, fullName);
}

export async function newPersonWithEmail(email: string, fullName = "Test person"): Promise<Person> {
  const password = `${randomUUID()}Aa1!`;
  const admin = service();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // no confirmation email is sent
    user_metadata: { full_name: fullName, steel_thread_run: RUN },
  });
  if (error || !data.user) throw new Error(`createUser(${email}) failed: ${error?.message}`);
  created.push(data.user.id);

  const client = createClient(env.url, env.anon, opts);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`sign-in as ${email} failed: ${signInError.message}`);
  return { id: data.user.id, email, client };
}

/** Make a throwaway account a platform admin (production admins come from platform_admin_emails). */
export async function makePlatformAdmin(p: Person) {
  const { error } = await service().from("profiles").update({ is_admin: true }).eq("id", p.id);
  if (error) throw error;
}

/** Call a database function as this person; throws with the database's own message. */
export async function rpc<T = unknown>(p: Person, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await p.client.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

/** Expect an RPC to be refused, returning the refusal message. */
export async function rpcRefused(p: Person, fn: string, args: Record<string, unknown> = {}): Promise<string> {
  const { error } = await p.client.rpc(fn, args);
  if (!error) throw new Error(`${fn} was expected to be refused but succeeded`);
  return error.message;
}

/** A whole-minute time h hours from now (slots in the app are always on whole minutes). */
export const inHours = (h: number) => {
  const d = new Date(Date.now() + h * 3600_000);
  d.setUTCSeconds(0, 0);
  return d;
};

/**
 * Delete everything this run created. Institutions are named with the run id;
 * deleting them removes their memberships, invites, links and bookings, and
 * deleting the accounts removes profiles and slots.
 */
export async function cleanUp() {
  if (!configured) return;
  const admin = service();
  await admin.from("institutions").delete().ilike("name", `%${RUN}%`);
  for (const id of created.splice(0)) await admin.auth.admin.deleteUser(id).catch(() => {});
}
