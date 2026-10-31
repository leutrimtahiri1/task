import { z } from "zod";

export const CHANNELS = ["email", "linkedin", "whatsapp"] as const;
export type Channel = (typeof CHANNELS)[number];
export type MessageKind = "initial" | "follow_up";
export const CHANNEL_LABELS: Record<Channel, string> = {
  email: "Email",
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp",
};

export const draftSchema = z.object({
  channel: z.enum(CHANNELS),
  kind: z.enum(["initial", "follow_up"]),
  subject: z.string().trim().max(300),
  body: z.string().trim().min(1).max(6000),
});
export type Draft = z.infer<typeof draftSchema>;
export type PartnerMessage = Draft & {
  id: string;
  owner_id: string;
  partner_id: string;
  generation_id: string;
  extra_prompt: string;
  model: string;
  sent_at: string | null;
  created_at: string;
};

export const messagePlanSchema = z.object({
  messages: z
    .array(draftSchema)
    .length(6)
    .refine(
      (messages) =>
        new Set(messages.map((message) => `${message.channel}:${message.kind}`))
          .size === 6,
      "Expected one initial and one follow-up for each channel.",
    ),
});

export const searchInputSchema = z.object({
  query: z.string().trim().min(3).max(600),
  partnerType: z.enum(["any", "lead_vendor", "bpo"]),
  market: z.string().trim().max(120),
  insurance: z.string().trim().max(120),
});
export type SearchInput = z.infer<typeof searchInputSchema>;
export type SearchSource = { url: string; title: string };
export type SearchResult = {
  text: string;
  sources: SearchSource[];
  suggestions: string[];
  searchedAt: string;
};

export const generateInputSchema = z.object({
  partnerId: z.uuid(),
  extraPrompt: z.string().trim().max(4000).default(""),
});

export const sentInputSchema = z.object({
  messageId: z.uuid(),
  subject: z.string().trim().max(300),
  body: z.string().trim().min(1).max(6000),
  sentAt: z.iso.datetime({ offset: true }),
  contactDate: z.iso.date(),
});

export function safeWebUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function messageText(
  message: Pick<Draft, "channel" | "subject" | "body">,
): string {
  return message.channel === "email" && message.subject.trim()
    ? `Subject: ${message.subject.trim()}\n\n${message.body.trim()}`
    : message.body.trim();
}
