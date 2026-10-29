import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./partners";

let client: SupabaseClient<Database> | null = null;

// This application currently accesses Supabase from Client Components only.
// The publishable key is public; database RLS enforces access using the session.
export function getSupabase(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new Error(
      "Add the Supabase project URL and publishable key to .env.local, then restart the development server.",
    );
  client ??= createClient<Database>(url, key);
  return client;
}
