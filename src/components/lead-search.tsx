"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import Markdown from "react-markdown";
import DOMPurify from "dompurify";
import {
  ArrowRight,
  Building2,
  ExternalLink,
  Globe2,
  Info,
  LoaderCircle,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { aiRequest } from "@/lib/ai-client";
import {
  safeWebUrl,
  type SearchInput,
  type SearchResult,
} from "@/lib/outreach";

export function LeadSearch() {
  const searchInput = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [partnerType, setPartnerType] =
    useState<SearchInput["partnerType"]>("any");
  const [market, setMarket] = useState("");
  const [insurance, setInsurance] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current += 1;
    },
    [],
  );

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const request = ++generation.current;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await aiRequest<SearchResult>("/api/leads/search", {
        query,
        partnerType,
        market,
        insurance,
      });
      if (request === generation.current) setResult(response);
    } catch (error) {
      if (request === generation.current) setError((error as Error).message);
    } finally {
      if (request === generation.current) setBusy(false);
    }
  }

  return (
    <main className="page-content discovery-page">
      <div className="page-heading">
        <div>
          <div className="heading-eyebrow">
            <span /> FIND YOUR NEXT PARTNERSHIP
          </div>
          <h1>Discover potential partners</h1>
          <p>Choose how to find your next lead vendor or BPO partner.</p>
        </div>
        <span className="ai-label">
          <Sparkles size={15} /> Powered by Gemini + Google Search
        </span>
      </div>
      <section className="discovery-options" aria-label="Lead search options">
        <button
          type="button"
          className="discovery-option selected"
          aria-pressed="true"
          onClick={() => searchInput.current?.focus()}
        >
          <span className="discovery-option-icon">
            <Sparkles size={21} />
          </span>
          <span className="discovery-option-copy">
            <strong>Search with AI</strong>
            <span>Research public sources with Gemini.</span>
          </span>
          <span className="discovery-option-badge">Selected</span>
        </button>
        <a
          className="discovery-option linkedin-option"
          href="https://www.linkedin.com/search/results/people/?origin=SWITCH_SEARCH_VERTICAL"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Search with LinkedIn (opens in a new tab)"
        >
          <span className="discovery-option-icon">
            <Users size={21} />
          </span>
          <span className="discovery-option-copy">
            <strong>Search with LinkedIn</strong>
            <span>Open people search in a new tab.</span>
          </span>
          <ExternalLink size={16} />
        </a>
        <button type="button" className="discovery-option" disabled>
          <span className="discovery-option-icon">
            <Building2 size={21} />
          </span>
          <span className="discovery-option-copy">
            <strong>Search with Apollo</strong>
            <span>Discover leads through a third party.</span>
          </span>
          <span className="discovery-option-badge">Coming soon</span>
        </button>
      </section>
      <div className="verification-notice">
        <ShieldCheck size={22} />
        <div>
          <strong>Verify the information before reaching out.</strong>
          <p>
            AI research can be inaccurate or out of date. Check the company’s
            own website and independently confirm business details, suitability,
            and contact information before adding a representative.
          </p>
        </div>
      </div>
      <form className="discovery-form" onSubmit={search}>
        <label className="field">
          <span className="field-label">
            What kind of partner are you looking for?
          </span>
          <div className="discovery-query">
            <Search size={20} />
            <input
              ref={searchInput}
              required
              minLength={3}
              maxLength={600}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="e.g. US life insurance lead vendors offering live transfers"
              disabled={busy}
            />
          </div>
        </label>
        <div className="discovery-filters">
          <label className="field">
            <span className="field-label">Partner type</span>
            <select
              value={partnerType}
              onChange={(event) =>
                setPartnerType(event.target.value as SearchInput["partnerType"])
              }
              disabled={busy}
            >
              <option value="any">Lead vendors & BPO centers</option>
              <option value="lead_vendor">Lead vendors</option>
              <option value="bpo">BPO / call centers</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">
              Market served <span className="optional">optional</span>
            </span>
            <input
              maxLength={120}
              value={market}
              onChange={(event) => setMarket(event.target.value)}
              placeholder="e.g. United States"
              disabled={busy}
            />
          </label>
          <label className="field">
            <span className="field-label">
              Insurance product <span className="optional">optional</span>
            </span>
            <input
              maxLength={120}
              value={insurance}
              onChange={(event) => setInsurance(event.target.value)}
              placeholder="e.g. Life, Medicare, auto"
              disabled={busy}
            />
          </label>
          <button className="primary-button" disabled={busy}>
            {busy ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <Search size={17} />
            )}
            {busy ? "Researching…" : "Search partners"}
          </button>
        </div>
        <p className="field-help">
          Public business research only. A search can take up to 90 seconds and
          may use several Google Search queries.
        </p>
      </form>
      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}
      {busy && (
        <div className="research-loading" role="status">
          <LoaderCircle className="spin" size={27} />
          <h2>Looking for a good fit</h2>
          <p>
            Checking public sources for relevant services, markets, and
            partnership opportunities.
          </p>
        </div>
      )}
      {!busy && !result && !error && (
        <div className="research-empty">
          <span>
            <Globe2 size={30} />
          </span>
          <h2>A better first hello starts with research.</h2>
          <p>
            Describe the partner you need. Review the findings and sources, then
            add independently verified details to your pipeline.
          </p>
          <div className="research-examples">
            {[
              "Medicare live transfer lead vendors",
              "BPO centers running US insurance campaigns",
            ].map((example) => (
              <button key={example} onClick={() => setQuery(example)}>
                {example} <ArrowRight size={13} />
              </button>
            ))}
          </div>
        </div>
      )}
      {result && (
        <section className="research-results" aria-label="Search findings">
          <header>
            <div>
              <span className="eyebrow">RESEARCH FINDINGS</span>
              <h2>Potential partners to explore</h2>
            </div>
            <span>{new Date(result.searchedAt).toLocaleString()}</span>
          </header>
          <div className="research-report">
            <Markdown
              allowedElements={[
                "p",
                "h1",
                "h2",
                "h3",
                "h4",
                "strong",
                "em",
                "a",
                "ul",
                "ol",
                "li",
                "br",
                "blockquote",
                "hr",
                "code",
              ]}
              unwrapDisallowed
              components={{
                a: ({ href, children }) => {
                  const url = href ? safeWebUrl(href) : null;
                  return url ? (
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      {children}
                      <ExternalLink size={11} />
                    </a>
                  ) : (
                    <span>{children}</span>
                  );
                },
              }}
            >
              {result.text}
            </Markdown>
          </div>
          <div className="research-sources">
            <h3>Source links</h3>
            {result.sources.map((source) => (
              <a
                key={source.url}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Globe2 size={14} />
                <span>{source.title}</span>
                <ExternalLink size={12} />
              </a>
            ))}
          </div>
          {result.suggestions.map((html, index) => (
            <SearchSuggestions key={index} html={html} />
          ))}
          <footer className="research-next">
            <Info size={18} />
            <p>
              Use the original sources to verify these suggestions. Search
              findings are not saved or imported into your contacts.
            </p>
            <Link className="primary-button" href="/partners">
              Add a verified partner manually <ArrowRight size={16} />
            </Link>
          </footer>
        </section>
      )}
    </main>
  );
}

function SearchSuggestions({ html }: { html: string }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return;
    const shadow =
      host.current.shadowRoot ?? host.current.attachShadow({ mode: "open" });
    // Google supplies display markup. Sanitize active content and isolate its
    // CSS from the app; do not run scripts or render arbitrary model HTML.
    const clean = DOMPurify.sanitize(html, {
      ADD_TAGS: ["style"],
      ADD_ATTR: ["target"],
      FORBID_TAGS: ["script", "iframe", "form", "input", "object", "embed"],
    });
    shadow.innerHTML = clean;
    for (const link of shadow.querySelectorAll("a")) {
      if (!safeWebUrl(link.href)) link.removeAttribute("href");
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
    return () => {
      shadow.innerHTML = "";
    };
  }, [html]);
  return (
    <div
      className="google-suggestions"
      ref={host}
      aria-label="Google Search suggestions"
    />
  );
}
