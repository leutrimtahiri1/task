import type { PartnerMessage } from "./outreach";

export const STAGES = [
  { value: "found", label: "Found", color: "slate" },
  { value: "contacted", label: "Contacted", color: "blue" },
  { value: "replied", label: "Replied", color: "amber" },
  { value: "in_talks", label: "In talks", color: "purple" },
  { value: "signed", label: "Signed", color: "green" },
] as const;

export type Stage = (typeof STAGES)[number]["value"];

export type PartnerFields = {
  company_name: string;
  first_name: string;
  last_name: string;
  role: string;
  status: Stage;
  linkedin_url: string;
  method_of_contact: string;
  contact_origin: string;
  email: string;
  phone: string;
  company_phone: string;
  contact_date: string | null;
  reminder_date: string | null;
  reminder_completed: boolean;
  follow_up_dates: string[];
  completed_follow_up_dates: string[];
  outcome: string;
  contacted_by: string | null;
  assigned_to: string | null;
  is_unread: boolean;
  notes: string;
};

export type Partner = PartnerFields & {
  id: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
};

export type StatusHistory = {
  id: string;
  partner_id: string;
  owner_id: string;
  from_status: Stage | null;
  to_status: Stage;
  changed_at: string;
};

export type Database = {
  public: {
    Tables: {
      partners: {
        Row: Partner;
        Insert: PartnerFields & { owner_id: string };
        Update: Partial<PartnerFields>;
        Relationships: [];
      };
      partner_status_history: {
        Row: StatusHistory;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      partner_messages: {
        Row: PartnerMessage;
        Insert: Omit<PartnerMessage, "id" | "created_at">;
        Update: Partial<Pick<PartnerMessage, "subject" | "body" | "sent_at">>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      claim_ai_request: { Args: { p_kind: string }; Returns: undefined };
      record_partner_message_sent: {
        Args: {
          p_message_id: string;
          p_subject: string;
          p_body: string;
          p_sent_at: string;
          p_contact_date: string;
        };
        Returns: PartnerMessage;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export const EMPTY_PARTNER: PartnerFields = {
  company_name: "",
  first_name: "",
  last_name: "",
  role: "",
  status: "found",
  linkedin_url: "",
  method_of_contact: "",
  contact_origin: "",
  email: "",
  phone: "",
  company_phone: "",
  contact_date: null,
  reminder_date: null,
  reminder_completed: false,
  follow_up_dates: [],
  completed_follow_up_dates: [],
  outcome: "",
  contacted_by: null,
  assigned_to: null,
  is_unread: false,
  notes: "",
};

// Calendar dates stay as YYYY-MM-DD strings. Parsing them as UTC timestamps
// would move reminders to the previous day in some time zones.
export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function formatDate(value: string | null): string {
  if (!value) return "Not scheduled";
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return year >= 1900 && year <= 9999 && localDate(date) === value;
}

export function pendingDates(partner: PartnerFields): string[] {
  const dates = partner.follow_up_dates.filter(
    (date) => !partner.completed_follow_up_dates.includes(date),
  );
  if (partner.reminder_date && !partner.reminder_completed)
    dates.push(partner.reminder_date);
  return [...new Set(dates)].sort();
}

export function nextFollowUp(partner: PartnerFields): string | null {
  return pendingDates(partner)[0] ?? null;
}

export function completeDate(
  partner: PartnerFields,
  date: string,
): Partial<PartnerFields> {
  return {
    reminder_completed:
      partner.reminder_completed || partner.reminder_date === date,
    completed_follow_up_dates: [
      ...new Set([
        ...partner.completed_follow_up_dates,
        ...(partner.follow_up_dates.includes(date) ? [date] : []),
      ]),
    ],
  };
}

export function validatePartner(fields: PartnerFields): string | null {
  if (!fields.first_name.trim()) return "First name is required.";
  if (!STAGES.some((stage) => stage.value === fields.status))
    return "Choose a valid stage.";
  const limits: Partial<Record<keyof PartnerFields, number>> = {
    first_name: 120,
    last_name: 120,
    company_name: 200,
    role: 200,
    linkedin_url: 2000,
    method_of_contact: 120,
    contact_origin: 200,
    email: 320,
    phone: 80,
    company_phone: 80,
    outcome: 2000,
    notes: 10000,
  };
  for (const [key, limit] of Object.entries(limits)) {
    if (String(fields[key as keyof PartnerFields]).length > limit)
      return `${key.replaceAll("_", " ")} must be ${limit} characters or fewer.`;
  }
  if (fields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email))
    return "Enter a valid email address.";
  if (fields.linkedin_url) {
    try {
      const url = new URL(fields.linkedin_url);
      if (
        url.protocol !== "https:" ||
        !(
          url.hostname === "linkedin.com" ||
          url.hostname.endsWith(".linkedin.com")
        )
      ) {
        return "Enter a LinkedIn URL starting with https://linkedin.com or https://www.linkedin.com.";
      }
    } catch {
      return "Enter a valid LinkedIn profile URL.";
    }
  }
  const dates = [
    fields.contact_date,
    fields.reminder_date,
    ...fields.follow_up_dates,
  ].filter((date): date is string => Boolean(date));
  if (dates.some((date) => !isCalendarDate(date)))
    return "Enter valid calendar dates (1900–9999).";
  if (fields.follow_up_dates.length > 50)
    return "You can schedule up to 50 follow-up dates.";
  return null;
}

export function databaseError(error: {
  message: string;
  code?: string;
}): string {
  if (["PGRST205", "42P01"].includes(error.code ?? "")) {
    return "The partner tables are not set up yet. Apply the Supabase migration, then refresh.";
  }
  return error.message;
}
