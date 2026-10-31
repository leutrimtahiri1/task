"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import type { Session, User } from "@supabase/supabase-js";
import {
  ArrowDownUp,
  ArrowRight,
  Bell,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Inbox,
  LayoutGrid,
  LoaderCircle,
  LogOut,
  Eye,
  EyeOff,
  Pencil,
  MessageSquareText,
  Network,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import {
  completeDate,
  databaseError,
  formatDate,
  localDate,
  nextFollowUp,
  pendingDates,
  STAGES,
  type Partner,
  type PartnerFields,
  type Stage,
} from "@/lib/partners";
import { PartnerForm } from "./partner-form";
import { LeadSearch } from "./lead-search";
import { OutreachDialog } from "./outreach-dialog";

type View = "all" | "due" | "unread";

export default function PartnerTracker({
  section = "partners",
}: {
  section?: "partners" | "search";
}) {
  const [{ client, setupError }] = useState(() => {
    try {
      return { client: getSupabase(), setupError: "" };
    } catch (error) {
      return { client: null, setupError: (error as Error).message };
    }
  });
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    if (!client) return;
    let active = true;
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (active) {
        setSession(nextSession);
        setReady(true);
      }
    });
    void client.auth.getSession().then(({ error }) => {
      if (active && error) {
        setAuthError(error.message);
        setReady(true);
      }
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [client]);

  if (!client)
    return (
      <div className="auth-page">
        <div className="auth-card">
          <Brand />
          <h1>Connect your workspace</h1>
          <p>{setupError}</p>
        </div>
      </div>
    );
  if (!ready)
    return (
      <div className="loading-page">
        <Brand />
        <LoaderCircle size={24} className="spin" />
        <span>Opening your workspace…</span>
      </div>
    );
  if (!session) return <AuthScreen initialError={authError} />;
  return (
    <Workspace key={session.user.id} user={session.user} section={section} />
  );
}

function Brand() {
  return (
    <div className="brand">
      <span className="brand-icon">
        <Network size={23} strokeWidth={2.2} />
      </span>
      <span>
        partner<span className="brand-light">flow</span>
        <span className="brand-period">.</span>
      </span>
    </div>
  );
}

function AuthScreen({ initialError }: { initialError: string }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);
  const [notice, setNotice] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email")).trim();
    const password = String(form.get("password"));
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { data, error } =
        mode === "signin"
          ? await getSupabase().auth.signInWithPassword({ email, password })
          : await getSupabase().auth.signUp({ email, password });
      if (error) throw error;
      if (!data.session)
        setNotice(
          "Account created. Sign in with your email and password to continue.",
        );
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <section className="auth-story">
        <Brand />
        <div className="auth-story-copy">
          <span className="auth-kicker">
            GOOD RELATIONSHIPS. GREAT PARTNERSHIPS.
          </span>
          <h1>
            A little follow-up.
            <br />A lot of possibility.
          </h1>
          <p>
            Bring every partner, conversation, and next step into one thoughtful
            workspace.
          </p>
          <div className="auth-pipeline">
            {STAGES.map((stage, index) => (
              <div key={stage.value}>
                <span className={`stage-dot ${stage.color}`} />
                <span>{stage.label}</span>
                {index < STAGES.length - 1 && <ArrowRight size={14} />}
              </div>
            ))}
          </div>
          <div className="auth-note">
            <ShieldCheck size={19} />
            <span>
              Your contacts stay private to your account.
              <br />
              Every conversation stays in your hands.
            </span>
          </div>
        </div>
        <span className="auth-bottom">
          Built for the people behind the partnerships.
        </span>
      </section>
      <section className="auth-panel">
        <form className="auth-card" onSubmit={submit}>
          <span className="eyebrow">YOUR PARTNER WORKSPACE</span>
          <h2>{mode === "signin" ? "Welcome back" : "Start your pipeline"}</h2>
          <p>
            {mode === "signin"
              ? "Sign in to pick up where you left off."
              : "Create an account to keep track of every opportunity."}
          </p>
          <label className="field">
            <span className="field-label">Email address</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="you@company.com"
              disabled={busy}
            />
          </label>
          <label className="field">
            <span className="field-label">Password</span>
            <input
              type="password"
              name="password"
              required
              minLength={6}
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
              placeholder="Enter your password"
              disabled={busy}
            />
          </label>
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
          <button className="primary-button" disabled={busy}>
            {busy ? (
              <LoaderCircle size={18} className="spin" />
            ) : (
              <ArrowRight size={18} />
            )}
            {busy
              ? "Please wait…"
              : mode === "signin"
                ? "Sign in"
                : "Create account"}
          </button>
          <div className="auth-toggle">
            {mode === "signin"
              ? "New to Partnerflow?"
              : "Already have an account?"}{" "}
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError("");
                setNotice("");
              }}
            >
              {mode === "signin" ? "Create an account" : "Sign in"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function Workspace({
  user,
  section,
}: {
  user: User;
  section: "partners" | "search";
}) {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [outreach, setOutreach] = useState<Partner | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<View>(() =>
    typeof window !== "undefined" && window.location.hash === "#follow-ups"
      ? "due"
      : "all",
  );
  const [stage, setStage] = useState<Stage | "all">("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("updated");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Partner | null | undefined>(undefined);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [today, setToday] = useState(localDate);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const request = ++generation.current;
    try {
      const rows: Partner[] = [];
      // Fetch every page: Supabase otherwise caps a select at 1,000 records.
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await getSupabase()
          .from("partners")
          .select("*")
          .eq("owner_id", user.id)
          .order("id")
          .range(offset, offset + 499);
        if (error) throw new Error(databaseError(error));
        rows.push(...(data ?? []));
        if ((data?.length ?? 0) < 500) break;
      }
      if (request === generation.current) {
        setPartners(rows);
        setError("");
      }
    } catch (error) {
      if (request === generation.current) setError((error as Error).message);
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [user.id]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) return load();
    });
    return () => {
      active = false;
      generation.current += 1;
    };
  }, [load]);
  useEffect(() => {
    const tick = () => setToday(localDate());
    const timer = window.setInterval(tick, 30000);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", tick);
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const agenda = useMemo(
    () =>
      partners
        .flatMap((partner) =>
          pendingDates(partner).map((date) => ({ partner, date })),
        )
        .sort(
          (a, b) =>
            a.date.localeCompare(b.date) ||
            a.partner.first_name.localeCompare(b.partner.first_name),
        ),
    [partners],
  );
  const duePartners = partners.filter((partner) => {
    const next = nextFollowUp(partner);
    return next !== null && next <= today;
  });
  const dueTasks = agenda.filter((item) => item.date <= today);
  const unread = partners.filter((partner) => partner.is_unread).length;
  const overdue = agenda.filter((item) => item.date < today).length;
  const counts = Object.fromEntries(
    STAGES.map((item) => [
      item.value,
      partners.filter((partner) => partner.status === item.value).length,
    ]),
  );
  const filtered = partners
    .filter((partner) => {
      if (stage !== "all" && partner.status !== stage) return false;
      if (view === "unread" && !partner.is_unread) return false;
      if (view === "due" && !duePartners.some((item) => item.id === partner.id))
        return false;
      const query = search.toLocaleLowerCase().trim();
      return (
        !query ||
        [
          partner.first_name,
          partner.last_name,
          partner.company_name,
          partner.email,
          partner.role,
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(query)
      );
    })
    .sort((a, b) =>
      sort === "company"
        ? a.company_name.localeCompare(b.company_name)
        : sort === "followup"
          ? (nextFollowUp(a) ?? "9999").localeCompare(nextFollowUp(b) ?? "9999")
          : b.updated_at.localeCompare(a.updated_at),
    );
  const pageCount = Math.max(1, Math.ceil(filtered.length / 10));
  const activePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(activePage * 10, activePage * 10 + 10);
  const companies = [
    ...new Set(partners.map((partner) => partner.company_name).filter(Boolean)),
  ].sort();
  function changeView(next: View) {
    if (section === "search") {
      window.location.assign(
        next === "due" ? "/partners#follow-ups" : "/partners",
      );
      return;
    }
    setView(next);
    setPage(0);
  }
  function refresh() {
    setLoading(true);
    setError("");
    void load();
  }

  async function save(fields: PartnerFields, id?: string) {
    const query = id
      ? getSupabase().from("partners").update(fields).eq("id", id)
      : getSupabase()
          .from("partners")
          .insert({ ...fields, owner_id: user.id });
    const { data, error } = await query.select().single();
    if (error) throw new Error(databaseError(error));
    generation.current += 1;
    setLoading(false);
    setPartners((current) =>
      id
        ? current.map((partner) => (partner.id === id ? data : partner))
        : [data, ...current],
    );
    setNotice(
      id ? "Representative updated." : "Representative added to your pipeline.",
    );
  }
  async function remove(id: string) {
    const { error } = await getSupabase()
      .from("partners")
      .delete()
      .eq("id", id);
    if (error) throw new Error(databaseError(error));
    generation.current += 1;
    setLoading(false);
    setPartners((current) => current.filter((partner) => partner.id !== id));
    setNotice("Representative deleted.");
  }
  async function patch(
    partner: Partner,
    fields: Partial<PartnerFields>,
    message: string,
  ) {
    if (pendingIds.includes(partner.id)) return;
    setPendingIds((current) => [...current, partner.id]);
    setError("");
    try {
      const { data, error } = await getSupabase()
        .from("partners")
        .update(fields)
        .eq("id", partner.id)
        .select()
        .single();
      if (error) throw new Error(databaseError(error));
      generation.current += 1;
      setLoading(false);
      setPartners((current) =>
        current.map((item) => (item.id === partner.id ? data : item)),
      );
      setNotice(message);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setPendingIds((current) => current.filter((id) => id !== partner.id));
    }
  }
  async function signOut() {
    const { error } = await getSupabase().auth.signOut();
    if (error) setError(error.message);
  }

  return (
    <div className="workspace">
      <aside className="sidebar">
        <Brand />
        <div className="workspace-switch">
          <span className="workspace-avatar">P</span>
          <div>
            <strong>My workspace</strong>
            <small>Partner outreach</small>
          </div>
          <span className="workspace-indicator" />
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav aria-label="Main navigation">
          <Link
            className={section === "search" ? "nav-item active" : "nav-item"}
            href="/search"
          >
            <Search size={19} />
            Discover leads
          </Link>
          {section === "search" ? (
            <Link className="nav-item" href="/partners">
              <Users size={19} />
              Partners<span>{partners.length}</span>
            </Link>
          ) : (
            <button
              className={view !== "due" ? "nav-item active" : "nav-item"}
              onClick={() => changeView("all")}
            >
              <Users size={19} />
              Partners<span>{partners.length}</span>
            </button>
          )}
          {section !== "search" && (
            <button
              className={view === "due" ? "nav-item active" : "nav-item"}
              onClick={() => changeView("due")}
            >
              <Bell size={19} />
              Follow-ups
              {dueTasks.length > 0 && (
                <span className="notification-count">{dueTasks.length}</span>
              )}
            </button>
          )}
        </nav>
        <div className="sidebar-bottom">
          <span className="private-label">
            <ShieldCheck size={15} /> Private workspace
          </span>
          <button className="account-button" onClick={signOut} title="Sign out">
            <span className="user-avatar">
              {(user.email ?? "M").slice(0, 1).toUpperCase()}
            </span>
            <span>
              <strong>My account</strong>
              <small>{user.email}</small>
            </span>
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <div className="breadcrumb">
            <LayoutGrid size={16} />
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>
              {section === "search"
                ? "Discover leads"
                : view === "due"
                  ? "Follow-ups"
                  : "Partners"}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="today-label">{formatDate(today)}</span>
            <button
              aria-label={`View ${dueTasks.length} due follow-ups`}
              className="icon-button notification-button"
              onClick={() => changeView("due")}
            >
              <Bell size={19} />
              {dueTasks.length > 0 && <i />}
            </button>
            <span className="user-avatar small">
              {(user.email ?? "M").slice(0, 1).toUpperCase()}
            </span>
          </div>
        </header>
        {section === "search" ? (
          <LeadSearch />
        ) : (
          <main className="page-content">
            <div className="page-heading">
              <div>
                <div className="heading-eyebrow">
                  <span /> YOUR RELATIONSHIPS, MOVING FORWARD
                </div>
                <h1>
                  {view === "due"
                    ? "A little follow-up goes a long way."
                    : "Partner pipeline"}
                </h1>
                <p>
                  {view === "due"
                    ? "Know who needs a nudge, and make every conversation count."
                    : "From first hello to signed partner. Keep the next step in sight."}
                </p>
              </div>
              <button
                className="primary-button"
                disabled={loading}
                onClick={() => setEditing(null)}
              >
                <Plus size={18} /> Add representative
              </button>
            </div>
            <section
              className="stage-cards"
              aria-label="Filter by pipeline stage"
            >
              {STAGES.map((item, index) => (
                <button
                  key={item.value}
                  className={`stage-card ${item.color}${stage === item.value ? " selected" : ""}`}
                  onClick={() => {
                    setStage(stage === item.value ? "all" : item.value);
                    setPage(0);
                  }}
                  aria-pressed={stage === item.value}
                >
                  <div>
                    <span className={`stage-dot ${item.color}`} />
                    <span>{item.label}</span>
                    <span className="stage-number">0{index + 1}</span>
                  </div>
                  <strong>{counts[item.value] ?? 0}</strong>
                  <span className="stage-description">
                    {
                      [
                        "New possibilities",
                        "First hello sent",
                        "Conversation started",
                        "Building a partnership",
                        "Made it official",
                      ][index]
                    }
                  </span>
                </button>
              ))}
            </section>
            {dueTasks.length > 0 && (
              <div className="due-banner">
                <span className="due-banner-icon">
                  <Clock3 size={19} />
                </span>
                <div>
                  <strong>
                    {duePartners.length}{" "}
                    {duePartners.length === 1
                      ? "partner needs"
                      : "partners need"}{" "}
                    a follow-up
                  </strong>
                  <span>
                    {overdue > 0
                      ? `${overdue} overdue ${overdue === 1 ? "task" : "tasks"} · `
                      : ""}
                    {dueTasks.filter((item) => item.date === today).length} due
                    today. A good time to reconnect.
                  </span>
                </div>
                <button onClick={() => changeView("due")}>
                  View follow-ups <ArrowRight size={16} />
                </button>
              </div>
            )}
            {error && (
              <div className="error-message error-banner" role="alert">
                <span>{error}</span>
                <button type="button" className="text-button" onClick={refresh}>
                  Try again
                </button>
              </div>
            )}
            <div className="content-grid">
              <section className="partners-card" aria-label="Representatives">
                <div
                  className="table-tabs"
                  role="group"
                  aria-label="Filter representatives"
                >
                  <button
                    className={view === "all" ? "selected" : ""}
                    onClick={() => changeView("all")}
                  >
                    All partners <span>{partners.length}</span>
                  </button>
                  <button
                    className={view === "due" ? "selected" : ""}
                    onClick={() => changeView("due")}
                  >
                    Needs follow-up <span>{duePartners.length}</span>
                  </button>
                  <button
                    className={view === "unread" ? "selected" : ""}
                    onClick={() => changeView("unread")}
                  >
                    Unread <span>{unread}</span>
                  </button>
                </div>
                <div className="table-toolbar">
                  <label className="search-box">
                    <Search size={17} />
                    <input
                      aria-label="Search partners"
                      placeholder="Search name, company, or email…"
                      value={search}
                      onChange={(event) => {
                        setSearch(event.target.value);
                        setPage(0);
                      }}
                    />
                    {search && (
                      <button
                        className="icon-button"
                        aria-label="Clear search"
                        onClick={() => {
                          setSearch("");
                          setPage(0);
                        }}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </label>
                  <div className="table-filters">
                    <select
                      aria-label="Filter by status"
                      value={stage}
                      onChange={(event) => {
                        setStage(event.target.value as Stage | "all");
                        setPage(0);
                      }}
                    >
                      <option value="all">All stages</option>
                      {STAGES.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                    <label className="sort-select">
                      <ArrowDownUp size={14} />
                      <select
                        aria-label="Sort partners"
                        value={sort}
                        onChange={(event) => {
                          setSort(event.target.value);
                          setPage(0);
                        }}
                      >
                        <option value="updated">Last updated</option>
                        <option value="followup">Next follow-up</option>
                        <option value="company">Company A–Z</option>
                      </select>
                    </label>
                    <button
                      className="icon-button refresh-button"
                      aria-label="Refresh partners"
                      disabled={loading}
                      onClick={refresh}
                    >
                      <RefreshCw size={16} className={loading ? "spin" : ""} />
                    </button>
                  </div>
                </div>
                {loading && partners.length === 0 ? (
                  <div className="empty-state">
                    <LoaderCircle className="spin" size={26} />
                    <h3>Loading your partners…</h3>
                  </div>
                ) : visible.length === 0 ? (
                  <div className="empty-state">
                    <span className="empty-icon">
                      {partners.length ? (
                        <Search size={26} />
                      ) : (
                        <Users size={28} />
                      )}
                    </span>
                    <h3>
                      {partners.length
                        ? "No partners match this view"
                        : "Your next partnership starts here"}
                    </h3>
                    <p>
                      {partners.length
                        ? "Try another search or stage to find your representative."
                        : "Add your first representative and give every relationship a next step."}
                    </p>
                    <button
                      className={
                        partners.length ? "secondary-button" : "primary-button"
                      }
                      onClick={() => {
                        if (partners.length) {
                          setSearch("");
                          setStage("all");
                          changeView("all");
                        } else setEditing(null);
                      }}
                    >
                      {partners.length ? (
                        "Clear filters"
                      ) : (
                        <>
                          <Plus size={16} /> Add your first representative
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Representative</th>
                          <th>Company</th>
                          <th>Status</th>
                          <th>Next follow-up</th>
                          <th>Assigned to</th>
                          <th>
                            <span className="sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((partner) => {
                          const next = nextFollowUp(partner);
                          return (
                            <tr
                              key={partner.id}
                              className={partner.is_unread ? "unread-row" : ""}
                            >
                              <td>
                                <button
                                  className="person-cell"
                                  onClick={() => setEditing(partner)}
                                >
                                  <span
                                    className={`person-avatar avatar-${partner.first_name.charCodeAt(0) % 4}`}
                                  >
                                    {partner.first_name[0]}
                                    {partner.last_name[0]}
                                  </span>
                                  <span>
                                    <strong>
                                      {partner.first_name} {partner.last_name}
                                      {partner.is_unread && (
                                        <i className="unread-dot" />
                                      )}
                                    </strong>
                                    <small>
                                      {partner.role ||
                                        partner.email ||
                                        "No role added"}
                                    </small>
                                  </span>
                                </button>
                              </td>
                              <td>
                                <div className="company-cell">
                                  {partner.company_name ? (
                                    <>
                                      <Building2 size={14} />
                                      <span>{partner.company_name}</span>
                                    </>
                                  ) : (
                                    <span className="muted">No company</span>
                                  )}
                                </div>
                              </td>
                              <td>
                                <div
                                  className={`status-select ${STAGES.find((item) => item.value === partner.status)?.color}`}
                                >
                                  <span className="stage-dot" />
                                  <select
                                    aria-label={`Status for ${partner.first_name} ${partner.last_name}`}
                                    value={partner.status}
                                    disabled={pendingIds.includes(partner.id)}
                                    onChange={(event) =>
                                      void patch(
                                        partner,
                                        { status: event.target.value as Stage },
                                        "Pipeline stage updated.",
                                      )
                                    }
                                  >
                                    {STAGES.map((item) => (
                                      <option
                                        key={item.value}
                                        value={item.value}
                                      >
                                        {item.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </td>
                              <td>
                                <div
                                  className={`follow-up-cell${next && next < today ? " overdue" : next === today ? " due-today" : ""}`}
                                >
                                  {next && <Clock3 size={14} />}
                                  <span>
                                    {next
                                      ? next === today
                                        ? "Today"
                                        : formatDate(next)
                                      : "Not scheduled"}
                                    {next && next < today && (
                                      <small>Overdue</small>
                                    )}
                                  </span>
                                </div>
                              </td>
                              <td>
                                {partner.assigned_to ? (
                                  <span className="assignee">
                                    <span className="user-avatar tiny">
                                      {(user.email ?? "M")[0].toUpperCase()}
                                    </span>
                                    Me
                                  </span>
                                ) : (
                                  <span className="muted">Unassigned</span>
                                )}
                              </td>
                              <td>
                                <div className="row-actions">
                                  <button
                                    className="message-row-button"
                                    title="Generate and review messages"
                                    onClick={() => setOutreach(partner)}
                                    aria-label={`Messages for ${partner.first_name}`}
                                  >
                                    <MessageSquareText size={15} />
                                    <span>Messages</span>
                                  </button>
                                  <button
                                    className={`icon-button${partner.is_unread ? " is-unread" : ""}`}
                                    aria-label={`Mark ${partner.first_name} as ${partner.is_unread ? "read" : "unread"}`}
                                    title={
                                      partner.is_unread
                                        ? "Mark as read"
                                        : "Mark as unread"
                                    }
                                    disabled={pendingIds.includes(partner.id)}
                                    onClick={() =>
                                      void patch(
                                        partner,
                                        { is_unread: !partner.is_unread },
                                        partner.is_unread
                                          ? "Marked as read."
                                          : "Marked as unread.",
                                      )
                                    }
                                  >
                                    {partner.is_unread ? (
                                      <Eye size={17} />
                                    ) : (
                                      <EyeOff size={17} />
                                    )}
                                  </button>
                                  <button
                                    className="icon-button"
                                    aria-label={`Edit ${partner.first_name}`}
                                    onClick={() => setEditing(partner)}
                                  >
                                    <Pencil size={17} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <footer className="table-footer">
                  <span>
                    {filtered.length === 0
                      ? "0 representatives"
                      : `Showing ${activePage * 10 + 1}–${Math.min((activePage + 1) * 10, filtered.length)} of ${filtered.length} representatives`}
                  </span>
                  <div>
                    <button
                      className="icon-button"
                      aria-label="Previous page"
                      disabled={activePage === 0}
                      onClick={() => setPage(activePage - 1)}
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="page-indicator">{activePage + 1}</span>
                    <button
                      className="icon-button"
                      aria-label="Next page"
                      disabled={activePage >= pageCount - 1}
                      onClick={() => setPage(activePage + 1)}
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </footer>
              </section>
              <aside className="followups-card">
                <header>
                  <span className="followups-icon">
                    <Bell size={18} />
                  </span>
                  <div>
                    <h2>Next on your list</h2>
                    <p>A little nudge, right on time.</p>
                  </div>
                </header>
                {agenda.length === 0 ? (
                  <div className="agenda-empty">
                    <span>
                      <Check size={22} />
                    </span>
                    <strong>You’re all caught up</strong>
                    <p>
                      Add a reminder or follow-up date to a representative to
                      see it here.
                    </p>
                  </div>
                ) : (
                  <div className="agenda-list">
                    {agenda
                      .slice(0, view === "due" ? 20 : 5)
                      .map(({ partner, date }) => (
                        <div
                          className="agenda-item"
                          key={`${partner.id}-${date}`}
                        >
                          <div className="agenda-date">
                            <span
                              className={`agenda-tag${date < today ? " overdue" : date === today ? " due-today" : ""}`}
                            >
                              {date < today
                                ? "OVERDUE"
                                : date === today
                                  ? "TODAY"
                                  : "UPCOMING"}
                            </span>
                            <span>{formatDate(date)}</span>
                          </div>
                          <button
                            className="agenda-person"
                            onClick={() => setEditing(partner)}
                          >
                            <strong>
                              {partner.first_name} {partner.last_name}
                            </strong>
                            <span>
                              {partner.company_name ||
                                "Independent representative"}
                            </span>
                          </button>
                          <div className="agenda-bottom">
                            <span>
                              {partner.method_of_contact || "Follow up"}
                            </span>
                            <button
                              disabled={pendingIds.includes(partner.id)}
                              onClick={() =>
                                void patch(
                                  partner,
                                  completeDate(partner, date),
                                  "Follow-up completed.",
                                )
                              }
                              aria-label={`Complete follow-up with ${partner.first_name} on ${formatDate(date)}`}
                            >
                              <Check size={14} /> Done
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
                {agenda.length > (view === "due" ? 20 : 5) && (
                  <p className="agenda-more">
                    +{agenda.length - (view === "due" ? 20 : 5)} more scheduled
                    tasks. Open a representative to manage dates.
                  </p>
                )}
                <footer>
                  <Inbox size={15} />
                  <span>
                    Reminders appear here while you work.
                    <br />
                    You decide when to reach out.
                  </span>
                </footer>
              </aside>
            </div>
            <div className="page-bottom">
              <span>
                <span className="live-dot" />{" "}
                {error ? "Connection needs attention" : "Connected to Supabase"}
              </span>
              <span>Small steps. Strong partnerships.</span>
            </div>
          </main>
        )}
      </div>
      {notice && (
        <div className="toast" role="status">
          <Check size={17} />
          {notice}
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {outreach && (
        <OutreachDialog
          partner={outreach}
          onClose={() => setOutreach(null)}
          onPartnerChange={(updated) => {
            setPartners((current) =>
              current.map((item) => (item.id === updated.id ? updated : item)),
            );
            setOutreach((current) =>
              current?.id === updated.id ? updated : current,
            );
          }}
        />
      )}
      {editing !== undefined && (
        <PartnerForm
          partner={editing}
          companies={companies}
          user={user}
          onClose={() => setEditing(undefined)}
          onSave={save}
          onDelete={remove}
          onMessages={
            editing
              ? () => {
                  setOutreach(editing);
                  setEditing(undefined);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
