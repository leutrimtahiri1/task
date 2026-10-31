"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  CalendarDays,
  Check,
  History,
  LoaderCircle,
  MessageSquareText,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";
import {
  databaseError,
  EMPTY_PARTNER,
  formatDate,
  localDate,
  STAGES,
  validatePartner,
  type Partner,
  type PartnerFields,
  type StatusHistory,
} from "@/lib/partners";

type Props = {
  partner: Partner | null;
  companies: string[];
  user: User;
  onClose: () => void;
  onSave: (fields: PartnerFields, id?: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onMessages?: () => void;
};

export function PartnerForm({
  partner,
  companies,
  user,
  onClose,
  onSave,
  onDelete,
  onMessages,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const companyList = useId();
  const [fields, setFields] = useState<PartnerFields>(
    partner ? { ...partner } : { ...EMPTY_PARTNER },
  );
  const [dates, setDates] = useState<string[]>(
    partner?.follow_up_dates.length ? partner.follow_up_dates : [""],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<StatusHistory[]>([]);
  const [historyError, setHistoryError] = useState("");

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  useEffect(() => {
    if (!partner) return;
    let active = true;
    void getSupabase()
      .from("partner_status_history")
      .select("*")
      .eq("partner_id", partner.id)
      .order("changed_at", { ascending: false })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setHistoryError(databaseError(error));
        else setHistory(data ?? []);
      });
    return () => {
      active = false;
    };
  }, [partner]);

  function update<K extends keyof PartnerFields>(
    key: K,
    value: PartnerFields[K],
  ) {
    setFields((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const followUps = [...new Set(dates.filter(Boolean))].sort();
    // Whitelist editable fields so a loaded record's id/owner cannot be updated.
    const values = Object.fromEntries(
      Object.keys(EMPTY_PARTNER).map((key) => {
        const value = fields[key as keyof PartnerFields];
        return [key, typeof value === "string" ? value.trim() : value];
      }),
    ) as PartnerFields;
    values.follow_up_dates = followUps;
    values.completed_follow_up_dates = values.completed_follow_up_dates.filter(
      (date) => followUps.includes(date),
    );
    values.reminder_completed =
      values.reminder_date === partner?.reminder_date &&
      Boolean(partner?.reminder_completed);
    const validation = validatePartner(values);
    if (validation) {
      setError(validation);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSave(values, partner?.id);
      onClose();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not save this representative.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (
      !partner ||
      !window.confirm(
        `Delete ${partner.first_name}'s record and its stage history? This cannot be undone.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await onDelete(partner.id);
      onClose();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not delete this representative.",
      );
    } finally {
      setBusy(false);
    }
  }

  function input(
    key: Exclude<
      keyof PartnerFields,
      | "status"
      | "reminder_completed"
      | "follow_up_dates"
      | "completed_follow_up_dates"
      | "is_unread"
    >,
    label: string,
    placeholder: string,
    options: {
      type?: string;
      required?: boolean;
      max?: number;
      wide?: boolean;
      list?: string;
    } = {},
  ) {
    return (
      <Field label={label} wide={options.wide}>
        <input
          name={key}
          type={options.type ?? "text"}
          value={String(fields[key] ?? "")}
          onChange={(event) =>
            update(
              key,
              event.target.value || (options.type === "date" ? null : ""),
            )
          }
          placeholder={placeholder}
          required={options.required}
          maxLength={options.max ?? 200}
          list={options.list}
          min={options.type === "date" ? "1900-01-01" : undefined}
          max={options.type === "date" ? "9999-12-31" : undefined}
        />
      </Field>
    );
  }

  return (
    <dialog
      ref={dialog}
      className="partner-dialog"
      aria-labelledby="partner-form-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit}>
        <header className="dialog-header">
          <div>
            <span className="eyebrow">PARTNER DETAILS</span>
            <h2 id="partner-form-title">
              {partner ? "Edit representative" : "Add new representative"}
            </h2>
            <p>
              {partner
                ? "Keep the conversation and next steps up to date."
                : "Start a relationship. Keep every detail in one place."}
            </p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close form"
            onClick={onClose}
            disabled={busy}
          >
            <X size={21} />
          </button>
        </header>
        <div className="dialog-body">
          <fieldset disabled={busy}>
            <legend>
              01 <span>Partner information</span>
            </legend>
            <div className="form-grid">
              {input("company_name", "Company", "Search or enter a company", {
                list: companyList,
              })}
              <datalist id={companyList}>
                {companies.map((company) => (
                  <option key={company} value={company} />
                ))}
              </datalist>
              {input("first_name", "First name *", "Enter first name", {
                required: true,
                max: 120,
              })}
              {input("last_name", "Last name", "Enter last name", { max: 120 })}
              {input("role", "Role", "e.g. Partnerships Manager")}
              <Field label="Status">
                <select
                  name="status"
                  value={fields.status}
                  onChange={(event) =>
                    update(
                      "status",
                      event.target.value as PartnerFields["status"],
                    )
                  }
                >
                  {STAGES.map((stage) => (
                    <option key={stage.value} value={stage.value}>
                      {stage.label}
                    </option>
                  ))}
                </select>
              </Field>
              {input(
                "linkedin_url",
                "LinkedIn profile URL",
                "https://www.linkedin.com/in/…",
                { type: "url", max: 2000 },
              )}
            </div>
          </fieldset>
          <fieldset disabled={busy}>
            <legend>
              02 <span>Contact details</span>
            </legend>
            <div className="form-grid">
              {input(
                "method_of_contact",
                "Method of contact",
                "e.g. Email, LinkedIn, WhatsApp",
                { max: 120 },
              )}
              {input(
                "contact_origin",
                "Contact origin",
                "e.g. Company website, referral",
              )}
              {input("email", "Email", "name@company.com", {
                type: "email",
                max: 320,
              })}
              {input("phone", "Phone number", "Enter business phone number", {
                type: "tel",
                max: 80,
              })}
              {input(
                "company_phone",
                "Company phone number",
                "Enter company number",
                { type: "tel", max: 80 },
              )}
              {input("contact_date", "Contact date", "", { type: "date" })}
            </div>
          </fieldset>
          <fieldset disabled={busy}>
            <legend>
              03 <span>Follow-up & ownership</span>
            </legend>
            <div className="form-grid">
              <div>
                {input("reminder_date", "Reminder date", "", { type: "date" })}
                <p className="field-help">
                  Appears in your follow-up queue when due.
                </p>
              </div>
              <Field label="Outcome">
                <input
                  name="outcome"
                  value={fields.outcome}
                  maxLength={2000}
                  placeholder="e.g. Interested, awaiting pricing"
                  onChange={(event) => update("outcome", event.target.value)}
                />
              </Field>
              <div className="field span-two">
                <span className="field-label">Follow-up dates</span>
                <div className="follow-up-inputs">
                  {dates.map((date, index) => (
                    <div key={index} className="follow-up-input">
                      <CalendarDays size={16} />
                      <input
                        type="date"
                        aria-label={`Follow-up date ${index + 1}`}
                        min="1900-01-01"
                        max="9999-12-31"
                        value={date}
                        onChange={(event) =>
                          setDates((current) =>
                            current.map((value, position) =>
                              position === index ? event.target.value : value,
                            ),
                          )
                        }
                      />
                      {date &&
                        fields.completed_follow_up_dates.includes(date) && (
                          <span className="completed-date" title="Completed">
                            <Check size={15} />
                          </span>
                        )}
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Remove follow-up date ${index + 1}`}
                        onClick={() =>
                          setDates((current) =>
                            current.filter((_, position) => position !== index),
                          )
                        }
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="text-button add-date"
                  disabled={dates.length >= 50}
                  onClick={() => setDates((current) => [...current, ""])}
                >
                  <Plus size={15} /> Add another date
                </button>
              </div>
              <Field label="Contacted by">
                <select
                  name="contacted_by"
                  value={fields.contacted_by ?? ""}
                  onChange={(event) =>
                    update("contacted_by", event.target.value || null)
                  }
                >
                  <option value="">Not contacted</option>
                  <option value={user.id}>Me ({user.email})</option>
                </select>
              </Field>
              <Field label="Assigned to">
                <select
                  name="assigned_to"
                  value={fields.assigned_to ?? ""}
                  onChange={(event) =>
                    update("assigned_to", event.target.value || null)
                  }
                >
                  <option value="">Unassigned</option>
                  <option value={user.id}>Me ({user.email})</option>
                </select>
              </Field>
              <label className="checkbox-field span-two">
                <input
                  type="checkbox"
                  name="is_unread"
                  checked={fields.is_unread}
                  onChange={(event) =>
                    update("is_unread", event.target.checked)
                  }
                />
                <span>
                  <strong>Mark as unread</strong>
                  <small>
                    Highlight this representative so you can come back to them.
                  </small>
                </span>
              </label>
              <Field label="Notes" wide>
                <textarea
                  name="notes"
                  rows={4}
                  maxLength={10000}
                  value={fields.notes}
                  placeholder="Conversation context, requirements, and anything to remember…"
                  onChange={(event) => update("notes", event.target.value)}
                />
              </Field>
            </div>
          </fieldset>
          {partner && (
            <details className="history">
              <summary>
                <History size={16} /> Stage history{" "}
                <span>{history.length}</span>
              </summary>
              {historyError && (
                <p className="error-message" role="alert">
                  {historyError}
                </p>
              )}
              <ol>
                {history.map((entry) => (
                  <li key={entry.id}>
                    <span className="history-dot" />
                    <div>
                      <strong>
                        {entry.from_status
                          ? `${STAGES.find((stage) => stage.value === entry.from_status)?.label} → `
                          : "Added to "}
                        {
                          STAGES.find(
                            (stage) => stage.value === entry.to_status,
                          )?.label
                        }
                      </strong>
                      <small>
                        {formatDate(localDate(new Date(entry.changed_at)))} ·{" "}
                        {new Date(entry.changed_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </small>
                    </div>
                  </li>
                ))}
              </ol>
            </details>
          )}
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="dialog-footer">
          <div className="button-row">
            {onMessages && (
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={onMessages}
              >
                <MessageSquareText size={15} />
                Messages
              </button>
            )}
            {partner && (
              <button
                type="button"
                className="danger-button"
                onClick={remove}
                disabled={busy}
              >
                <Trash2 size={16} /> Delete
              </button>
            )}
          </div>
          <div className="button-row">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <Check size={17} />
              )}
              {busy
                ? "Saving…"
                : partner
                  ? "Save changes"
                  : "Add representative"}
            </button>
          </div>
        </footer>
      </form>
    </dialog>
  );
}

function Field({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={`field${wide ? " span-two" : ""}`}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}
