import { randomUUID } from "node:crypto";
import { generateInputSchema, messagePlanSchema } from "@/lib/outreach";
import {
  interactionText,
  messagesJsonSchema,
  messagesPrompt,
} from "@/lib/ai-contract";
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
    const { client, user } = await authenticatedClient(request);
    const input = await requestBody(request, generateInputSchema);
    const { data: partner, error } = await client
      .from("partners")
      .select("*")
      .eq("id", input.partnerId)
      .single();
    if (error || !partner)
      throw new ApiError("Partner not found or not accessible.", 404);
    geminiConfiguration();
    const { error: quotaError } = await client.rpc("claim_ai_request", {
      p_kind: "messages",
    });
    if (quotaError) databaseFailure(quotaError);
    const { value, model } = await geminiInteraction(
      messagesPrompt(partner, input.extraPrompt),
      { schema: messagesJsonSchema },
    );
    let plan;
    try {
      plan = messagePlanSchema.parse(JSON.parse(interactionText(value).text));
    } catch {
      throw new ApiError(
        "Gemini returned an incomplete message plan. No drafts were saved; try again.",
        502,
      );
    }
    const generationId = randomUUID();
    const { data: messages, error: saveError } = await client
      .from("partner_messages")
      .insert(
        plan.messages.map((message) => ({
          ...message,
          subject: message.channel === "email" ? message.subject : "",
          owner_id: user.id,
          partner_id: partner.id,
          generation_id: generationId,
          extra_prompt: input.extraPrompt,
          model,
          sent_at: null,
        })),
      )
      .select();
    if (saveError) databaseFailure(saveError);
    return Response.json({ messages }, { headers: noStore });
  } catch (error) {
    return apiFailure(error);
  }
}
