import "server-only";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { INVITE_COOKIE } from "@/lib/invite";
import type { InstitutionOption } from "@/components/InstitutionFields";

export type DirectoryRow = InstitutionOption & {
  short_name: string;
  city: string;
  country: string;
  website: string;
  mentors: number;
};

/** Approved institutions with mentor counts (public). */
export async function loadInstitutions(supabase: SupabaseClient): Promise<DirectoryRow[]> {
  const { data } = await supabase.rpc("public_directory");
  return ((data ?? []) as DirectoryRow[]).map((r) => ({ ...r, mentors: Number(r.mentors) || 0 }));
}

/** The institution a pending invite (link cookie or pre-approved email) points to, if any. */
export async function pendingInvite(supabase: SupabaseClient, email: string) {
  const code = (await cookies()).get(INVITE_COOKIE)?.value;
  if (code) {
    const { data } = await supabase.rpc("invite_link_info", { p_code: code });
    const row = (data as { institution_id: string; name: string; slug: string }[] | null)?.[0];
    if (row) return { institutionId: row.institution_id, name: row.name, via: "link" as const };
  }
  if (email) {
    const { data } = await createAdminClient()
      .from("alumni_invites")
      .select("institution_id, institutions(name)")
      .eq("email", email.toLowerCase())
      .limit(1)
      .maybeSingle();
    if (data)
      return {
        institutionId: data.institution_id as string,
        name: (data.institutions as unknown as { name: string } | null)?.name ?? "",
        via: "email" as const,
      };
  }
  return null;
}
