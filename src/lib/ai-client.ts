import { getSupabase } from "./supabase";

export async function aiRequest<T>(path: string, body: unknown): Promise<T> {
  const {
    data: { session },
    error,
  } = await getSupabase().auth.getSession();
  if (error || !session) throw new Error("Sign in again to continue.");
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "The request failed. Please try again.");
  return result as T;
}
