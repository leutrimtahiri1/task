import { searchInputSchema } from "@/lib/outreach";
import { groundedResult, searchPrompt } from "@/lib/ai-contract";
import {
  ApiError,
  apiFailure,
  authenticatedClient,
  databaseFailure,
  noStore,
  requestBody,
} from "@/lib/server/api";
import { geminiConfiguration, geminiInteraction } from "@/lib/server/gemini";

export async function POST(request: Request) {
  try {
    const { client } = await authenticatedClient(request);
    const input = await requestBody(request, searchInputSchema);
    geminiConfiguration();
    const { error } = await client.rpc("claim_ai_request", {
      p_kind: "search",
    });
    if (error) databaseFailure(error);
    const { value } = await geminiInteraction(searchPrompt(input), {
      search: true,
    });
    try {
      return Response.json(groundedResult(value), { headers: noStore });
    } catch (error) {
      throw new ApiError(
        error instanceof Error ? error.message : "No cited results returned.",
        502,
      );
    }
  } catch (error) {
    return apiFailure(error);
  }
}
