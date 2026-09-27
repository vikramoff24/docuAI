/**
 * DocuFlow AI — Landing Page
 *
 * Sections:
 * 1. Navigation
 * 2. Hero
 * 3. Features Grid
 * 4. How It Works
 * 5. Testimonials / Social Proof
 * 6. CTA
 * 7. Footer
 */

import Link from "next/link";

/* ──────────────────────────────────────────────
   Icons (inline SVG — no external dependency)
────────────────────────────────────────────── */

function IconSearch() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function IconBrain() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" />
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    </svg>
  );
}

function IconZap() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
    </svg>
  );
}

function IconFolder() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconMessage() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function IconArrowRight() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/* ──────────────────────────────────────────────
   Feature Card
────────────────────────────────────────────── */
interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
  delay: string;
}

function FeatureCard({ icon, title, description, color, delay }: FeatureCardProps) {
  return (
    <div
      className={`glass-card p-6 hover-lift animate-fade-up opacity-0 ${delay}`}
      style={{ animationFillMode: "forwards" }}
    >
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
        style={{ background: color, boxShadow: `0 0 24px ${color}50` }}
      >
        <span style={{ color: "white" }}>{icon}</span>
      </div>
      <h3 className="text-lg font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
        {title}
      </h3>
      <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        {description}
      </p>
    </div>
  );
}

/* ──────────────────────────────────────────────
   Step Card
────────────────────────────────────────────── */
interface StepCardProps {
  number: string;
  title: string;
  description: string;
  delay: string;
}

function StepCard({ number, title, description, delay }: StepCardProps) {
  return (
    <div
      className={`relative animate-fade-up opacity-0 ${delay}`}
      style={{ animationFillMode: "forwards" }}
    >
      <div className="glass-card p-8 h-full">
        <div
          className="text-5xl font-black mb-4 gradient-text"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {number}
        </div>
        <h3 className="text-xl font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
          {title}
        </h3>
        <p className="leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          {description}
        </p>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────
   Stat Badge
────────────────────────────────────────────── */
interface StatBadgeProps {
  value: string;
  label: string;
}

function StatBadge({ value, label }: StatBadgeProps) {
  return (
    <div className="text-center">
      <div className="text-3xl font-black gradient-text mb-1">{value}</div>
      <div className="text-sm" style={{ color: "var(--text-muted)" }}>{label}</div>
    </div>
  );
}

/* ──────────────────────────────────────────────
   Pricing Tier Card
────────────────────────────────────────────── */
interface PricingCardProps {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  highlighted?: boolean;
  badge?: string;
  delay: string;
}

function PricingCard({ name, price, period, description, features, highlighted, badge, delay }: PricingCardProps) {
  return (
    <div
      className={`relative p-8 animate-fade-up opacity-0 ${delay} ${highlighted ? "glass-card-bright" : "glass-card"}`}
      style={{
        animationFillMode: "forwards",
        border: highlighted ? "1px solid hsl(252, 60%, 50%, 0.5)" : undefined,
      }}
    >
      {badge && (
        <div
          className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-bold px-4 py-1 rounded-full"
          style={{
            background: "linear-gradient(135deg, hsl(252, 78%, 58%), hsl(270, 82%, 62%))",
            color: "white",
          }}
        >
          {badge}
        </div>
      )}
      <div className="mb-6">
        <div className="text-sm font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--brand-400)" }}>
          {name}
        </div>
        <div className="flex items-end gap-2 mb-2">
          <span className="text-4xl font-black" style={{ color: "var(--text-primary)" }}>{price}</span>
          <span className="mb-1" style={{ color: "var(--text-muted)" }}>{period}</span>
        </div>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{description}</p>
      </div>
      <ul className="space-y-3 mb-8">
        {features.map((f) => (
          <li key={f} className="flex items-center gap-3 text-sm" style={{ color: "var(--text-secondary)" }}>
            <span
              className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: "hsl(252, 78%, 54%, 0.2)", color: "var(--brand-400)" }}
            >
              <IconCheck />
            </span>
            {f}
          </li>
        ))}
      </ul>
      <a
        href="#"
        className={highlighted ? "btn-primary w-full justify-center" : "btn-secondary w-full justify-center"}
        style={{ display: "flex" }}
      >
        <span>Get started</span>
        {highlighted && <IconArrowRight />}
      </a>
    </div>
  );
}

/* ──────────────────────────────────────────────
   Main Page
────────────────────────────────────────────── */
export default function HomePage() {
  return (
    <div className="relative min-h-screen grid-pattern">
      {/* ── Decorative Orbs ── */}
      <div
        className="fixed top-1/4 -left-64 w-[500px] h-[500px] rounded-full pointer-events-none animate-pulse-glow"
        style={{
          background: "radial-gradient(circle, hsl(252, 80%, 40%, 0.15) 0%, transparent 70%)",
          filter: "blur(40px)",
        }}
        aria-hidden="true"
      />
      <div
        className="fixed top-2/3 -right-64 w-[600px] h-[600px] rounded-full pointer-events-none animate-pulse-glow delay-300"
        style={{
          background: "radial-gradient(circle, hsl(270, 80%, 35%, 0.1) 0%, transparent 70%)",
          filter: "blur(40px)",
        }}
        aria-hidden="true"
      />

      {/* ────────────────────────────────────────
          NAVIGATION
      ──────────────────────────────────────── */}
      <header
        className="fixed top-0 left-0 right-0 z-50"
        style={{
          background: "hsl(225, 30%, 7%, 0.8)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: "1px solid hsl(220, 15%, 15%, 0.8)",
        }}
      >
        <nav className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3" aria-label="DocuFlow AI home">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, hsl(252, 78%, 58%), hsl(270, 82%, 62%))",
                boxShadow: "0 0 20px hsl(252, 78%, 54%, 0.4)",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <line x1="10" y1="9" x2="8" y2="9" />
              </svg>
            </div>
            <span className="font-bold text-lg" style={{ color: "var(--text-primary)" }}>
              DocuFlow <span className="gradient-text">AI</span>
            </span>
          </Link>

          {/* Nav Links */}
          <div className="hidden md:flex items-center gap-8">
            {["Features", "How it works", "Pricing", "Docs"].map((item) => (
              <a
                key={item}
                href={`#${item.toLowerCase().replace(/\s+/g, "-")}`}
                className="nav-link text-sm font-medium"
              >
                {item}
              </a>
            ))}
          </div>

          {/* CTA Buttons */}
          <div className="flex items-center gap-3">
            <a
              href="/login"
              className="hidden sm:block text-sm font-medium px-4 py-2 rounded-lg transition-colors duration-200"
              style={{ color: "var(--text-secondary)" }}
            >
              Sign in
            </a>
            <a href="/signup" className="btn-primary" style={{ padding: "10px 20px", fontSize: "14px" }}>
              <span>Get started free</span>
            </a>
          </div>
        </nav>
      </header>

      <main>
        {/* ────────────────────────────────────────
            HERO SECTION
        ──────────────────────────────────────── */}
        <section
          className="relative pt-40 pb-32 px-6 text-center overflow-hidden"
          aria-labelledby="hero-heading"
        >
          {/* Badge */}
          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium mb-8 animate-fade-up opacity-0"
            style={{
              animationFillMode: "forwards",
              background: "hsl(252, 78%, 54%, 0.15)",
              border: "1px solid hsl(252, 78%, 54%, 0.3)",
              color: "var(--brand-300)",
            }}
          >
            <span
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ background: "var(--brand-400)" }}
              aria-hidden="true"
            />
            Now in beta — AI-powered document intelligence
          </div>

          {/* Headline */}
          <h1
            id="hero-heading"
            className="text-5xl sm:text-6xl lg:text-7xl font-black mb-6 leading-tight animate-fade-up opacity-0 delay-100"
            style={{ animationFillMode: "forwards" }}
          >
            Your documents,
            <br />
            <span className="gradient-text">supercharged with AI</span>
          </h1>

          {/* Sub-headline */}
          <p
            className="max-w-2xl mx-auto text-lg sm:text-xl mb-10 leading-relaxed animate-fade-up opacity-0 delay-200"
            style={{ color: "var(--text-secondary)", animationFillMode: "forwards" }}
          >
            DocuFlow AI is an enterprise document management system with semantic search,
            instant AI summaries, and an intelligent agent that understands, organizes,
            and answers questions about your documents.
          </p>

          {/* CTA Buttons */}
          <div
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16 animate-fade-up opacity-0 delay-300"
            style={{ animationFillMode: "forwards" }}
          >
            <a href="/signup" className="btn-primary">
              <span>Start for free</span>
              <IconArrowRight />
            </a>
            <a href="#how-it-works" className="btn-secondary">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <polygon points="10 8 16 12 10 16 10 8" />
              </svg>
              See how it works
            </a>
          </div>

          {/* Stats */}
          <div
            className="flex flex-wrap items-center justify-center gap-12 animate-fade-up opacity-0 delay-400"
            style={{ animationFillMode: "forwards" }}
          >
            <StatBadge value="10x" label="Faster document search" />
            <div className="w-px h-8" style={{ background: "var(--border-color)" }} aria-hidden="true" />
            <StatBadge value="< 2s" label="AI summary generation" />
            <div className="w-px h-8" style={{ background: "var(--border-color)" }} aria-hidden="true" />
            <StatBadge value="99.9%" label="Uptime SLA" />
            <div className="w-px h-8" style={{ background: "var(--border-color)" }} aria-hidden="true" />
            <StatBadge value="SOC 2" label="Compliant" />
          </div>
        </section>

        {/* ────────────────────────────────────────
            PRODUCT PREVIEW (Mock UI)
        ──────────────────────────────────────── */}
        <section className="px-6 pb-32">
          <div className="max-w-5xl mx-auto animate-scale-in opacity-0 delay-500" style={{ animationFillMode: "forwards" }}>
            <div
              className="glass-card overflow-hidden hover-glow"
              style={{ border: "1px solid hsl(252, 40%, 30%, 0.4)" }}
            >
              {/* Window Chrome */}
              <div
                className="flex items-center gap-2 px-5 py-4"
                style={{ borderBottom: "1px solid var(--border-color)" }}
              >
                <div className="w-3 h-3 rounded-full" style={{ background: "#ff5f57" }} aria-hidden="true" />
                <div className="w-3 h-3 rounded-full" style={{ background: "#febc2e" }} aria-hidden="true" />
                <div className="w-3 h-3 rounded-full" style={{ background: "#28c840" }} aria-hidden="true" />
                <div
                  className="flex-1 mx-4 px-4 py-1.5 rounded-lg text-xs text-center"
                  style={{ background: "var(--bg-tertiary)", color: "var(--text-muted)" }}
                >
                  app.docuflow.ai/documents
                </div>
              </div>

              {/* App Layout */}
              <div className="flex h-96">
                {/* Sidebar */}
                <div
                  className="w-56 flex-shrink-0 p-4 space-y-1"
                  style={{ borderRight: "1px solid var(--border-color)" }}
                >
                  {[
                    { icon: "📁", label: "All Documents", active: false },
                    { icon: "⭐", label: "Starred", active: false },
                    { icon: "🔍", label: "AI Search", active: true },
                    { icon: "🤖", label: "AI Agent", active: false },
                    { icon: "👥", label: "Shared with me", active: false },
                    { icon: "🗂️", label: "Archived", active: false },
                  ].map(({ icon, label, active }) => (
                    <div
                      key={label}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors"
                      style={{
                        background: active ? "hsl(252, 78%, 54%, 0.2)" : "transparent",
                        color: active ? "var(--brand-300)" : "var(--text-secondary)",
                        border: active ? "1px solid hsl(252, 78%, 54%, 0.3)" : "1px solid transparent",
                      }}
                    >
                      <span aria-hidden="true">{icon}</span>
                      {label}
                    </div>
                  ))}
                </div>

                {/* Main Content */}
                <div className="flex-1 p-6">
                  {/* Search Bar */}
                  <div
                    className="flex items-center gap-3 px-4 py-3 rounded-xl mb-6"
                    style={{ background: "var(--bg-tertiary)", border: "1px solid hsl(252, 60%, 40%, 0.3)" }}
                  >
                    <span style={{ color: "var(--brand-400)" }} aria-hidden="true"><IconSearch /></span>
                    <span style={{ color: "var(--text-muted)" }} className="text-sm">
                      Ask anything about your documents...
                    </span>
                    <span
                      className="ml-auto text-xs px-2 py-1 rounded-md"
                      style={{ background: "hsl(252, 78%, 54%, 0.15)", color: "var(--brand-400)" }}
                    >
                      AI
                    </span>
                  </div>

                  {/* Document List */}
                  <div className="space-y-3">
                    {[
                      { name: "Q3 Financial Report 2026.pdf", size: "2.4 MB", time: "2h ago", status: "summarized" },
                      { name: "Engineering Architecture ADR-007.md", size: "48 KB", time: "Yesterday", status: "indexed" },
                      { name: "Product Roadmap — H2 2026.pptx", size: "8.1 MB", time: "3 days ago", status: "summarized" },
                    ].map(({ name, size, time, status }) => (
                      <div
                        key={name}
                        className="flex items-center gap-4 px-4 py-3 rounded-xl cursor-pointer transition-colors"
                        style={{
                          background: "hsl(220, 20%, 13%, 0.6)",
                          border: "1px solid var(--border-subtle)",
                        }}
                      >
                        <div
                          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: "hsl(252, 78%, 54%, 0.15)" }}
                          aria-hidden="true"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="hsl(252, 78%, 70%)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                            {name}
                          </div>
                          <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                            {size} · {time}
                          </div>
                        </div>
                        <span
                          className="text-xs px-2 py-1 rounded-full flex-shrink-0"
                          style={{
                            background: status === "summarized" ? "hsl(155, 75%, 50%, 0.15)" : "hsl(252, 78%, 54%, 0.15)",
                            color: status === "summarized" ? "hsl(155, 75%, 55%)" : "var(--brand-400)",
                          }}
                        >
                          {status === "summarized" ? "✓ Summarized" : "● Indexed"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ────────────────────────────────────────
            FEATURES GRID
        ──────────────────────────────────────── */}
        <section id="features" className="px-6 py-24" aria-labelledby="features-heading">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 id="features-heading" className="text-3xl sm:text-4xl font-black mb-4">
                Everything your team needs
              </h2>
              <p className="text-lg max-w-xl mx-auto" style={{ color: "var(--text-secondary)" }}>
                From intelligent search to autonomous document management — DocuFlow AI has you covered.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              <FeatureCard
                icon={<IconSearch />}
                title="Semantic Search"
                description="Find any document by meaning, not just keywords. Our vector search understands context, synonyms, and concepts across your entire knowledge base."
                color="hsl(252, 78%, 54%)"
                delay="delay-100"
              />
              <FeatureCard
                icon={<IconBrain />}
                title="AI Summaries"
                description="Get instant, accurate summaries of any document in seconds. Save hours of reading with AI-generated key points, action items, and insights."
                color="hsl(270, 82%, 58%)"
                delay="delay-200"
              />
              <FeatureCard
                icon={<IconMessage />}
                title="Document Q&A"
                description="Ask questions about your documents and get cited answers. Perfect for legal docs, research papers, technical manuals, and more."
                color="hsl(320, 75%, 58%)"
                delay="delay-300"
              />
              <FeatureCard
                icon={<IconZap />}
                title="AI Agent"
                description="Our intelligent agent can search, organize, summarize, and share documents autonomously. Just describe what you need in plain English."
                color="hsl(40, 90%, 55%)"
                delay="delay-100"
              />
              <FeatureCard
                icon={<IconFolder />}
                title="Smart Organization"
                description="Folders, tags, and AI-powered auto-categorization. Keep your workspace clean with intelligent document routing and organization suggestions."
                color="hsl(190, 80%, 48%)"
                delay="delay-200"
              />
              <FeatureCard
                icon={<IconUsers />}
                title="Team Collaboration"
                description="Multi-tenant architecture with role-based access control. Invite teams, share documents securely, and audit every action."
                color="hsl(155, 70%, 48%)"
                delay="delay-300"
              />
              <FeatureCard
                icon={<IconShield />}
                title="Enterprise Security"
                description="SOC 2 compliant, end-to-end encryption, SSO support, and comprehensive audit logs. Your data stays private and secure."
                color="hsl(210, 80%, 52%)"
                delay="delay-100"
              />
              <FeatureCard
                icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><path d="M11 18H8a2 2 0 0 1-2-2V9"/></svg>}
                title="API-First Design"
                description="Full REST API with OpenAPI documentation. Integrate DocuFlow AI into your existing workflows, CRMs, and internal tools effortlessly."
                color="hsl(280, 75%, 58%)"
                delay="delay-200"
              />
              <FeatureCard
                icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>}
                title="Usage Analytics"
                description="Understand how your team uses documents. Track searches, views, AI interactions, and identify your most valuable knowledge assets."
                color="hsl(0, 75%, 58%)"
                delay="delay-300"
              />
            </div>
          </div>
        </section>

        {/* ────────────────────────────────────────
            HOW IT WORKS
        ──────────────────────────────────────── */}
        <section id="how-it-works" className="px-6 py-24" aria-labelledby="how-heading">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-16">
              <h2 id="how-heading" className="text-3xl sm:text-4xl font-black mb-4">
                Up and running in{" "}
                <span className="gradient-text">3 simple steps</span>
              </h2>
              <p className="text-lg max-w-xl mx-auto" style={{ color: "var(--text-secondary)" }}>
                No complex setup. No data migration headaches. Just powerful AI document management from day one.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <StepCard
                number="01"
                title="Upload your documents"
                description="Drag and drop PDFs, Word docs, presentations, spreadsheets, and more. We support 50+ file formats and extract text intelligently."
                delay="delay-100"
              />
              <StepCard
                number="02"
                title="AI processes everything"
                description="Our pipeline automatically extracts text, generates embeddings, creates summaries, and indexes every document for instant search."
                delay="delay-200"
              />
              <StepCard
                number="03"
                title="Search, ask, and automate"
                description="Use natural language to find documents, ask questions and get cited answers, or let our AI agent handle document workflows for you."
                delay="delay-300"
              />
            </div>
          </div>
        </section>

        {/* ────────────────────────────────────────
            PRICING
        ──────────────────────────────────────── */}
        <section id="pricing" className="px-6 py-24" aria-labelledby="pricing-heading">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-16">
              <h2 id="pricing-heading" className="text-3xl sm:text-4xl font-black mb-4">
                Simple, transparent pricing
              </h2>
              <p className="text-lg max-w-xl mx-auto" style={{ color: "var(--text-secondary)" }}>
                Start free, scale as you grow. No hidden fees, no surprises.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
              <PricingCard
                name="Starter"
                price="$0"
                period="/ month"
                description="Perfect for individuals and small teams getting started."
                features={[
                  "5 GB storage",
                  "Up to 500 documents",
                  "AI search & summaries",
                  "1 team member",
                  "Community support",
                ]}
                delay="delay-100"
              />
              <PricingCard
                name="Pro"
                price="$29"
                period="/ month"
                description="For growing teams that need more power and collaboration."
                features={[
                  "100 GB storage",
                  "Unlimited documents",
                  "AI Agent (1,000 runs/mo)",
                  "Up to 25 team members",
                  "RBAC & audit logs",
                  "Priority support",
                ]}
                highlighted
                badge="Most Popular"
                delay="delay-200"
              />
              <PricingCard
                name="Enterprise"
                price="Custom"
                period=""
                description="For large organizations with advanced security and compliance needs."
                features={[
                  "Unlimited storage",
                  "Unlimited everything",
                  "Custom AI models",
                  "SSO / SAML",
                  "SOC 2 reports",
                  "Dedicated SLA",
                  "Custom integrations",
                ]}
                delay="delay-300"
              />
            </div>
          </div>
        </section>

        {/* ────────────────────────────────────────
            CTA SECTION
        ──────────────────────────────────────── */}
        <section className="px-6 py-24">
          <div className="max-w-3xl mx-auto text-center">
            <div
              className="glass-card-bright p-12 animate-fade-up opacity-0"
              style={{ animationFillMode: "forwards" }}
            >
              <h2 className="text-3xl sm:text-4xl font-black mb-4">
                Ready to transform how your
                <br />
                team works with documents?
              </h2>
              <p className="text-lg mb-10" style={{ color: "var(--text-secondary)" }}>
                Join thousands of teams using DocuFlow AI to unlock the knowledge
                trapped in their documents.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <a href="/signup" className="btn-primary">
                  <span>Start for free — no credit card needed</span>
                  <IconArrowRight />
                </a>
              </div>
              <p className="mt-6 text-sm" style={{ color: "var(--text-muted)" }}>
                14-day free trial on all paid plans · Cancel any time
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* ────────────────────────────────────────
          FOOTER
      ──────────────────────────────────────── */}
      <footer
        className="px-6 py-12"
        style={{ borderTop: "1px solid var(--border-subtle)" }}
      >
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
            {/* Brand */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, hsl(252, 78%, 58%), hsl(270, 82%, 62%))" }}
                  aria-hidden="true"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                  </svg>
                </div>
                <span className="font-bold" style={{ color: "var(--text-primary)" }}>
                  DocuFlow <span className="gradient-text">AI</span>
                </span>
              </div>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Enterprise Document Intelligence
              </p>
            </div>

            {/* Links */}
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              {["Privacy", "Terms", "Security", "Status", "API Docs"].map((link) => (
                <a
                  key={link}
                  href="#"
                  className="text-sm transition-colors duration-200"
                  style={{ color: "var(--text-muted)" }}
                >
                  {link}
                </a>
              ))}
            </div>
          </div>

          <div
            className="mt-8 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4"
            style={{ borderTop: "1px solid var(--border-subtle)" }}
          >
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              © 2026 DocuFlow AI. All rights reserved.
            </p>
            <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: "hsl(155, 75%, 50%)" }}
                aria-hidden="true"
              />
              All systems operational
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
