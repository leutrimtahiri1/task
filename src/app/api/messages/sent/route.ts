import { sentInputSchema, type PartnerMessage } from "@/lib/outreach";
import {
  ApiError,
  apiFailure,
  authenticatedClient,
  databaseFailure,
  noStore,
  requestBody,
} from "@/lib/server/api";

export async function POST(request: Request) {
  try {
    const { client } = await authenticatedClient(request);
    const input = await requestBody(request, sentInputSchema);
    if (Date.parse(input.sentAt) > Date.now() + 60000)
      throw new ApiError("Choose a sent time that is not in the future.", 400);
    const { data: message, error } = await client
      .rpc("record_partner_message_sent", {
        p_message_id: input.messageId,
        p_subject: input.subject,
        p_body: input.body,
        p_sent_at: input.sentAt,
        p_contact_date: input.contactDate,
      })
      .single<PartnerMessage>();
    if (error) {
      if (error.message.includes("read-only"))
        throw new ApiError(
          "This message has already been recorded as sent. Refresh the message history.",
          409,
        );
      databaseFailure(error);
    }
    return Response.json({ message }, { headers: noStore });
  } catch (error) {
    return apiFailure(error);
  }
}
