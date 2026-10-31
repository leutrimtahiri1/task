import "server-only";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "../partners";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export const noStore = { "Cache-Control": "no-store, private" };

export async function authenticatedClient(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer "))
    throw new ApiError("Sign in to use this feature.", 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new ApiError("Supabase is not configured on the server.", 503);
  const client = createClient<Database>(url, key, {
    global: { headers: { Authorization: authorization } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const {
    data: { user },
    error,
  } = await client.auth.getUser(authorization.slice(7));
  if (error || !user)
    throw new ApiError("Your session has expired. Sign in again.", 401);
  return { client, user };
}

export async function requestBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  // Bound bytes before JSON parsing, including requests without Content-Length.
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError("A JSON request is required.", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 24000) {
        await reader.cancel();
        throw new ApiError("Request is too large.", 413);
      }
      chunks.push(value);
    }
    const text = Buffer.concat(chunks).toString("utf8");
    return schema.parse(JSON.parse(text));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("Check your input and try again.", 400);
  } finally {
    reader.releaseLock();
  }
}

export function apiFailure(error: unknown): Response {
  // Provider responses and request bodies may contain private partner notes or
  // credentials. Only intentional public errors are exposed, without logging.
  const known = error instanceof ApiError;
  return Response.json(
    {
      error: known
        ? error.message
        : "The request could not be completed. Please try again.",
    },
    { status: known ? error.status : 500, headers: noStore },
  );
}

export function databaseFailure(error: {
  code?: string;
  message: string;
}): never {
  if (error.message.includes("AI_RATE_LIMIT"))
    throw new ApiError(
      "AI request limit reached. Wait a minute before trying again (maximum 50 requests per day).",
      429,
    );
  if (["PGRST205", "42P01", "PGRST202"].includes(error.code ?? ""))
    throw new ApiError(
      "The AI messaging migration has not been applied yet.",
      503,
    );
  throw new ApiError(
    "Could not save or load the message. Refresh and try again.",
    500,
  );
}
