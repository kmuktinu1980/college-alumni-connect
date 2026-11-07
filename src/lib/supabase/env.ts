// Supabase settings, tolerant of stray whitespace or a trailing slash pasted
// into the hosting dashboard. NEXT_PUBLIC_ values are inlined at build time.
export const supabaseUrl = () => (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
export const supabaseAnonKey = () => (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
