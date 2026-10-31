"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Check,
  Copy,
  History,
  LoaderCircle,
  Mail,
  MessageCircle,
  Save,
  Sparkles,
  X,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { aiRequest } from "@/lib/ai-client";
import {
  CHANNELS,
  CHANNEL_LABELS,
  messageText,
  type Channel,
  type PartnerMessage,
} from "@/lib/outreach";
import { databaseError, localDate, type Partner } from "@/lib/partners";

type Props = {
  partner: Partner;
  onClose: () => void;
  onPartnerChange: (partner: Partner) => void;
};

export function OutreachDialog({ partner, onClose, onPartnerChange }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [messages, setMessages] = useState<PartnerMessage[]>([]);
  const [extraPrompt, setExtraPrompt] = useState("");
  const [channel, setChannel] = useState<Channel>("email");
  const [history, setHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sentTarget, setSentTarget] = useState<PartnerMessage | null>(null);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const rows: PartnerMessage[] = [];
        for (let offset = 0; ; offset += 500) {
          const { data, error } = await getSupabase()
            .from("partner_messages")
            .select("*")
            .eq("partner_id", partner.id)
            .order("created_at", { ascending: false })
            .order("id")
            .range(offset, offset + 499);
          if (error) throw new Error(databaseError(error));
          rows.push(...(data ?? []));
          if ((data?.length ?? 0) < 500) break;
        }
        if (active) setMessages(rows);
      } catch (error) {
        if (active) setError((error as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [partner.id]);

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGenerating(true);
    setError("");
    setNotice("");
    try {
      const result = await aiRequest<{ messages: PartnerMessage[] }>(
        "/api/messages/generate",
        { partnerId: partner.id, extraPrompt },
      );
      setMessages((current) => [...result.messages, ...current]);
      setHistory(false);
      setNotice("Six drafts saved. Review and edit each before using it.");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  function updated(message: PartnerMessage) {
    setMessages((current) =>
      current.map((item) => (item.id === message.id ? message : item)),
    );
  }
  async function recorded(message: PartnerMessage) {
    updated(message);
    setSentTarget(null);
    setNotice("Final message recorded as sent. Nothing was sent by the app.");
    const { data, error } = await getSupabase()
      .from("partners")
      .select("*")
      .eq("id", partner.id)
      .single();
    if (error)
      setError(
        "Message recorded, but the pipeline could not refresh. Refresh the Partners page.",
      );
    else if (data) onPartnerChange(data);
  }

  const latestGeneration = messages[0]?.generation_id;
  const drafts = messages
    .filter(
      (message) =>
        message.generation_id === latestGeneration &&
        message.channel === channel,
    )
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "initial" ? -1 : 1));
  const sentMessages = messages
    .filter((message) => message.sent_at)
    .sort((a, b) => (b.sent_at ?? "").localeCompare(a.sent_at ?? ""));
  const otherDrafts = messages.filter(
    (message) => message.generation_id !== latestGeneration && !message.sent_at,
  );

  return (
    <dialog
      ref={dialog}
      className="partner-dialog outreach-dialog"
      aria-labelledby="outreach-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!generating && !sentTarget) onClose();
      }}
    >
      <header className="dialog-header">
        <div>
          <span className="eyebrow">HUMAN-REVIEWED OUTREACH</span>
          <h2 id="outreach-title">A thoughtful first hello</h2>
          <p>
            {partner.first_name} {partner.last_name}
            {partner.company_name ? ` · ${partner.company_name}` : ""}
          </p>
        </div>
        <button
          className="icon-button"
          aria-label="Close messages"
          disabled={generating || Boolean(sentTarget)}
          onClick={onClose}
        >
          <X size={21} />
        </button>
      </header>
      <div className="outreach-body" inert={Boolean(sentTarget)}>
        <div className="partner-context">
          <span>
            <strong>Role</strong>
            {partner.role || "Not added"}
          </span>
          <span>
            <strong>Company</strong>
            {partner.company_name || "Not added"}
          </span>
          <span>
            <strong>Context</strong>
            {partner.notes ||
              partner.outcome ||
              "Add notes to the partner for more personal drafts."}
          </span>
        </div>
        <form className="outreach-brief" onSubmit={generate}>
          <label className="field">
            <span className="field-label">
              Your brief <span className="optional">optional</span>
            </span>
            <textarea
              rows={3}
              maxLength={4000}
              value={extraPrompt}
              onChange={(event) => setExtraPrompt(event.target.value)}
              disabled={generating}
              placeholder="Add your company, what you're looking for, sender name, tone, or language. e.g. We're exploring US life insurance lead partnerships. Keep it warm and under 80 words."
            />
          </label>
          <div>
            <p>
              Uses saved partner details and this brief. Review factual claims
              and replace any [placeholders].
            </p>
            <button className="primary-button" disabled={generating || loading}>
              {generating ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Sparkles size={16} />
              )}
              {generating
                ? "Writing drafts…"
                : messages.length
                  ? "Generate new versions"
                  : "Generate messages"}
            </button>
          </div>
        </form>
        <div className="message-navigation">
          <div role="group" aria-label="Message channel">
            {CHANNELS.map((item) => (
              <button
                key={item}
                className={!history && channel === item ? "selected" : ""}
                onClick={() => {
                  setChannel(item);
                  setHistory(false);
                }}
              >
                {item === "email" ? (
                  <Mail size={15} />
                ) : (
                  <MessageCircle size={15} />
                )}
                {CHANNEL_LABELS[item]}
              </button>
            ))}
          </div>
          <button
            className={history ? "selected" : ""}
            onClick={() => setHistory(true)}
          >
            <History size={15} /> History <span>{sentMessages.length}</span>
          </button>
        </div>
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="success-message" role="status">
            {notice}
          </p>
        )}
        {loading ? (
          <div className="message-empty">
            <LoaderCircle className="spin" size={24} />
            <p>Loading saved messages…</p>
          </div>
        ) : history ? (
          <div className="message-history">
            <h3>Sent messages</h3>
            <p className="field-help">
              The final text and actual sent time, recorded by you. Sent records
              are read-only.
            </p>
            {sentMessages.length === 0 && (
              <p className="message-empty">No messages recorded as sent yet.</p>
            )}
            {sentMessages.map((message) => (
              <MessageCard
                key={message.id}
                message={message}
                onUpdate={updated}
                onSent={setSentTarget}
                onError={setError}
              />
            ))}
            {otherDrafts.length > 0 && (
              <details className="previous-drafts">
                <summary>Previous drafts ({otherDrafts.length})</summary>
                {otherDrafts.map((message) => (
                  <MessageCard
                    key={message.id}
                    message={message}
                    onUpdate={updated}
                    onSent={setSentTarget}
                    onError={setError}
                  />
                ))}
              </details>
            )}
          </div>
        ) : (
          <div>
            {channel === "whatsapp" && (
              <p className="channel-notice">
                Use WhatsApp only when the recipient has agreed to receive your
                outreach. A published phone number alone is not permission.
              </p>
            )}
            {drafts.length === 0 ? (
              <div className="message-empty">
                <Sparkles size={25} />
                <h3>Make it personal, keep it in your hands.</h3>
                <p>
                  Generate an initial message and a follow-up for Email,
                  LinkedIn, and WhatsApp.
                </p>
              </div>
            ) : (
              drafts.map((message) => (
                <MessageCard
                  key={message.id}
                  message={message}
                  onUpdate={updated}
                  onSent={setSentTarget}
                  onError={setError}
                />
              ))
            )}
          </div>
        )}
        <p className="outreach-footnote">
          Copying or generating a draft never marks a partner as contacted. Only
          record a message as sent after you have sent it yourself.
        </p>
      </div>
      {sentTarget && (
        <SentConfirmation
          message={sentTarget}
          onCancel={() => setSentTarget(null)}
          onRecorded={recorded}
        />
      )}
    </dialog>
  );
}

type CardProps = {
  message: PartnerMessage;
  onUpdate: (message: PartnerMessage) => void;
  onSent: (message: PartnerMessage) => void;
  onError: (error: string) => void;
};

function MessageCard({ message, onUpdate, onSent, onError }: CardProps) {
  const [subject, setSubject] = useState(message.subject);
  const [body, setBody] = useState(message.body);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const dirty = subject !== message.subject || body !== message.body;
  const isSent = Boolean(message.sent_at);

  async function save() {
    if (!body.trim()) {
      onError("A message cannot be empty.");
      return;
    }
    setBusy(true);
    onError("");
    try {
      const { data, error } = await getSupabase()
        .from("partner_messages")
        .update({ subject: subject.trim(), body: body.trim() })
        .eq("id", message.id)
        .select()
        .single();
      if (error) throw new Error(databaseError(error));
      setSubject(data.subject);
      setBody(data.body);
      onUpdate(data);
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        messageText({ channel: message.channel, subject, body }),
      );
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      onError(
        "Clipboard access was blocked. Select the message text and copy it manually.",
      );
    }
  }

  return (
    <article className={`message-card${isSent ? " sent" : ""}`}>
      <header>
        <div>
          <span className="message-kind">
            {message.kind === "initial"
              ? "01 · FIRST MESSAGE"
              : "02 · FOLLOW-UP"}
          </span>
          <span className="message-channel">
            {CHANNEL_LABELS[message.channel]}
          </span>
        </div>
        <span className={isSent ? "sent-badge" : "draft-badge"}>
          {isSent ? (
            <>
              <Check size={12} /> Recorded as sent
            </>
          ) : (
            "Draft · review before use"
          )}
        </span>
      </header>
      {message.channel === "email" && (
        <label className="field">
          <span className="field-label">Subject</span>
          <input
            value={subject}
            maxLength={300}
            onChange={(event) => {
              setSubject(event.target.value);
              setCopied(false);
            }}
            readOnly={isSent}
            disabled={busy}
          />
        </label>
      )}
      <label className="field">
        <span className="sr-only">
          {CHANNEL_LABELS[message.channel]}{" "}
          {message.kind === "initial" ? "initial message" : "follow-up"}
        </span>
        <textarea
          rows={6}
          value={body}
          maxLength={6000}
          onChange={(event) => {
            setBody(event.target.value);
            setCopied(false);
          }}
          readOnly={isSent}
          disabled={busy}
        />
      </label>
      <footer>
        <span>
          {isSent
            ? `Sent ${new Date(message.sent_at!).toLocaleString()}`
            : dirty
              ? "Unsaved edits"
              : "Draft saved"}
        </span>
        <div className="button-row">
          {!isSent && dirty && (
            <button
              className="secondary-button"
              disabled={busy || !body.trim()}
              onClick={() => void save()}
            >
              {busy ? (
                <LoaderCircle className="spin" size={14} />
              ) : (
                <Save size={14} />
              )}{" "}
              Save draft
            </button>
          )}
          <button
            className="secondary-button"
            onClick={() => void copy()}
            disabled={!body.trim()}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy"}
          </button>
          {!isSent && (
            <button
              className="primary-button"
              disabled={busy || !body.trim()}
              onClick={() =>
                onSent({
                  ...message,
                  subject: subject.trim(),
                  body: body.trim(),
                })
              }
            >
              <Check size={14} /> Record as sent
            </button>
          )}
        </div>
      </footer>
    </article>
  );
}

function SentConfirmation({
  message,
  onCancel,
  onRecorded,
}: {
  message: PartnerMessage;
  onCancel: () => void;
  onRecorded: (message: PartnerMessage) => Promise<void>;
}) {
  const now = new Date();
  const [sentAt, setSentAt] = useState(
    `${localDate(now)}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const region = useRef<HTMLDivElement>(null);
  useEffect(() => {
    region.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    region.current?.focus();
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const date = new Date(sentAt);
      if (Number.isNaN(date.getTime()) || date.getTime() > Date.now() + 60000)
        throw new Error(
          "Choose a valid date and time that is not in the future.",
        );
      const result = await aiRequest<{ message: PartnerMessage }>(
        "/api/messages/sent",
        {
          messageId: message.id,
          subject: message.subject,
          body: message.body,
          sentAt: date.toISOString(),
          contactDate: localDate(date),
        },
      );
      await onRecorded(result.message);
    } catch (error) {
      setError((error as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="sent-confirmation" ref={region} tabIndex={-1}>
      <form onSubmit={submit}>
        <h3>Have you sent this message yourself?</h3>
        <p>
          This records the final text shown above and updates the pipeline. The
          app will not send anything.
        </p>
        <pre className="sent-preview">{messageText(message)}</pre>
        <label className="field">
          <span className="field-label">
            Actual sent date & time (your local time)
          </span>
          <input
            autoFocus
            type="datetime-local"
            required
            value={sentAt}
            onChange={(event) => setSentAt(event.target.value)}
            disabled={busy}
          />
        </label>
        <label className="sent-review-check">
          <input type="checkbox" required disabled={busy} /> I reviewed this
          message and already sent it manually.
        </label>
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        <div className="button-row">
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button className="primary-button" disabled={busy}>
            {busy ? (
              <LoaderCircle className="spin" size={15} />
            ) : (
              <Check size={15} />
            )}
            {busy ? "Recording…" : "Confirm and record"}
          </button>
        </div>
      </form>
    </div>
  );
}
