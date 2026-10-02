/**
 * DocuFlow AI — Landing Page
 *
 * Sections:
 * 1. Navigation
 * 2. Hero
 * 3. Product Preview
 * 4. Features Grid
 * 5. How It Works
 * 6. Pricing
 * 7. CTA
 * 8. Footer
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

function IconGitBranch() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="18" r="3"/>
      <circle cx="6" cy="6" r="3"/>
      <path d="M13 6h3a2 2 0 0 1 2 2v7"/>
      <path d="M11 18H8a2 2 0 0 1-2-2V9"/>
    </svg>
  );
}

function IconChart() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18"/>
      <path d="m19 9-5 5-4-4-3 3"/>
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
      className={`glass-card feature-card animate-fade-up ${delay}`}
      style={{ animationFillMode: "forwards", opacity: 0 }}
    >
      <div
        className="feature-card-icon"
        style={{ background: color, boxShadow: `0 0 24px ${color}50` }}
      >
        {icon}
      </div>
      <h3 className="feature-card-title">{title}</h3>
      <p className="feature-card-desc">{description}</p>
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
      className={`animate-fade-up ${delay}`}
      style={{ animationFillMode: "forwards", opacity: 0 }}
    >
      <div className="glass-card step-card">
        <div className="step-number gradient-text">{number}</div>
        <h3 className="step-title">{title}</h3>
        <p className="step-desc">{description}</p>
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
    <div className="stat-badge">
      <div className="stat-value gradient-text">{value}</div>
      <div className="stat-label">{label}</div>
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
      className={`pricing-card animate-fade-up ${delay} ${highlighted ? "glass-card-bright" : "glass-card"}`}
      style={{
        animationFillMode: "forwards",
        opacity: 0,
        border: highlighted ? "1px solid hsl(252, 60%, 50%, 0.5)" : undefined,
      }}
    >
      {badge && <div className="pricing-badge">{badge}</div>}
      <div style={{ marginBottom: "1.5rem" }}>
        <div className="pricing-name">{name}</div>
        <div className="pricing-price">
          <span className="pricing-amount">{price}</span>
          {period && <span className="pricing-period">{period}</span>}
        </div>
        <p className="pricing-desc">{description}</p>
      </div>
      <ul className="pricing-features">
        {features.map((f) => (
          <li key={f} className="pricing-feature">
            <span className="pricing-feature-icon">
              <IconCheck />
            </span>
            {f}
          </li>
        ))}
      </ul>
      <div className="pricing-cta">
        <a
          href="/signup"
          className={highlighted ? "btn-primary" : "btn-secondary"}
          style={{ justifyContent: "center", width: "100%" }}
        >
          <span>Get started</span>
          {highlighted && <IconArrowRight />}
        </a>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────
   Main Page
────────────────────────────────────────────── */
export default function HomePage() {
  return (
    <div className="grid-pattern" style={{ position: "relative", minHeight: "100vh" }}>
      {/* ── Decorative Orbs ── */}
      <div
        className="orb animate-pulse-glow"
        style={{
          top: "25%",
          left: "-256px",
          width: "500px",
          height: "500px",
          background: "radial-gradient(circle, hsl(252, 80%, 40%, 0.15) 0%, transparent 70%)",
        }}
        aria-hidden="true"
      />
      <div
        className="orb animate-pulse-glow delay-300"
        style={{
          top: "66%",
          right: "-256px",
          width: "600px",
          height: "600px",
          background: "radial-gradient(circle, hsl(270, 80%, 35%, 0.1) 0%, transparent 70%)",
        }}
        aria-hidden="true"
      />

      {/* ────────────────────────────────────────
          NAVIGATION
      ──────────────────────────────────────── */}
      <header className="navbar" id="hero">
        <nav className="navbar-inner">
          {/* Logo */}
          <Link href="/" className="logo-link" aria-label="DocuFlow AI home">
            <div className="logo-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <line x1="10" y1="9" x2="8" y2="9" />
              </svg>
            </div>
            <span className="logo-text">
              DocuFlow <span className="gradient-text">AI</span>
            </span>
          </Link>

          {/* Nav Links */}
          <div className="nav-links">
            {[
              { label: "Features", href: "#features" },
              { label: "How it works", href: "#how-it-works" },
              { label: "Pricing", href: "#pricing" },
            ].map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="nav-link"
                style={{ fontSize: "0.875rem", fontWeight: 500 }}
              >
                {item.label}
              </a>
            ))}
          </div>

          {/* CTA Buttons */}
          <div className="nav-actions">
            <a href="/login" className="sign-in-link">
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
        <section className="hero-section" aria-labelledby="hero-heading">
          {/* Badge */}
          <div
            className="hero-badge animate-fade-up"
            style={{ animationFillMode: "forwards", opacity: 0 }}
          >
            <span className="pulse-dot" aria-hidden="true" />
            Now in beta — AI-powered document intelligence
          </div>

          {/* Headline */}
          <h1
            id="hero-heading"
            className="hero-heading animate-fade-up delay-100"
            style={{ animationFillMode: "forwards", opacity: 0 }}
          >
            Your documents,
            <br />
            <span className="gradient-text">supercharged with AI</span>
          </h1>

          {/* Sub-headline */}
          <p
            className="hero-sub animate-fade-up delay-200"
            style={{ animationFillMode: "forwards", opacity: 0 }}
          >
            DocuFlow AI is an enterprise document management system with semantic search,
            instant AI summaries, and an intelligent agent that understands, organizes,
            and answers questions about your documents.
          </p>

          {/* CTA Buttons */}
          <div
            className="hero-cta animate-fade-up delay-300"
            style={{ animationFillMode: "forwards", opacity: 0 }}
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
            className="hero-stats animate-fade-up delay-400"
            style={{ animationFillMode: "forwards", opacity: 0 }}
          >
            <StatBadge value="10x" label="Faster document search" />
            <div className="stat-divider" aria-hidden="true" />
            <StatBadge value="< 2s" label="AI summary generation" />
            <div className="stat-divider" aria-hidden="true" />
            <StatBadge value="99.9%" label="Uptime SLA" />
            <div className="stat-divider" aria-hidden="true" />
            <StatBadge value="SOC 2" label="Compliant" />
          </div>
        </section>

        {/* ────────────────────────────────────────
            PRODUCT PREVIEW (Mock UI)
        ──────────────────────────────────────── */}
        <section className="product-preview">
          <div
            className="animate-scale-in delay-500"
            style={{ animationFillMode: "forwards", opacity: 0 }}
          >
            <div className="glass-card preview-window">
              {/* Window Chrome */}
              <div className="preview-chrome">
                <div className="preview-dot" style={{ background: "#ff5f57" }} aria-hidden="true" />
                <div className="preview-dot" style={{ background: "#febc2e" }} aria-hidden="true" />
                <div className="preview-dot" style={{ background: "#28c840" }} aria-hidden="true" />
                <div className="preview-url">app.docuflow.ai/documents</div>
              </div>

              {/* App Layout */}
              <div className="preview-layout">
                {/* Sidebar */}
                <div className="preview-sidebar">
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
                      className="preview-sidebar-item"
                      style={{
                        background: active ? "hsl(252, 78%, 54%, 0.2)" : "transparent",
                        color: active ? "var(--brand-300)" : "var(--text-secondary)",
                        borderColor: active ? "hsl(252, 78%, 54%, 0.3)" : "transparent",
                      }}
                    >
                      <span aria-hidden="true">{icon}</span>
                      {label}
                    </div>
                  ))}
                </div>

                {/* Main Content */}
                <div className="preview-main">
                  {/* Search Bar */}
                  <div className="preview-search">
                    <span style={{ color: "var(--brand-400)" }} aria-hidden="true"><IconSearch /></span>
                    <span className="preview-search-text">
                      Ask anything about your documents...
                    </span>
                    <span className="preview-search-badge">AI</span>
                  </div>

                  {/* Document List */}
                  <div className="preview-doc-list">
                    {[
                      { name: "Q3 Financial Report 2026.pdf", size: "2.4 MB", time: "2h ago", status: "summarized" },
                      { name: "Engineering Architecture ADR-007.md", size: "48 KB", time: "Yesterday", status: "indexed" },
                      { name: "Product Roadmap — H2 2026.pptx", size: "8.1 MB", time: "3 days ago", status: "summarized" },
                    ].map(({ name, size, time, status }) => (
                      <div key={name} className="preview-doc-row">
                        <div className="preview-doc-icon" aria-hidden="true">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="hsl(252, 78%, 70%)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                          </svg>
                        </div>
                        <div className="preview-doc-info">
                          <div className="preview-doc-name">{name}</div>
                          <div className="preview-doc-meta">{size} · {time}</div>
                        </div>
                        <span
                          className="preview-doc-status"
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
        <section id="features" className="section" aria-labelledby="features-heading">
          <div className="container-6xl">
            <div className="section-header">
              <h2 id="features-heading" className="section-title">
                Everything your team needs
              </h2>
              <p className="section-sub">
                From intelligent search to autonomous document management — DocuFlow AI has you covered.
              </p>
            </div>

            <div className="features-grid">
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
                icon={<IconGitBranch />}
                title="API-First Design"
                description="Full REST API with OpenAPI documentation. Integrate DocuFlow AI into your existing workflows, CRMs, and internal tools effortlessly."
                color="hsl(280, 75%, 58%)"
                delay="delay-200"
              />
              <FeatureCard
                icon={<IconChart />}
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
        <section id="how-it-works" className="section" aria-labelledby="how-heading">
          <div className="container-5xl">
            <div className="section-header">
              <h2 id="how-heading" className="section-title">
                Up and running in{" "}
                <span className="gradient-text">3 simple steps</span>
              </h2>
              <p className="section-sub">
                No complex setup. No data migration headaches. Just powerful AI document management from day one.
              </p>
            </div>

            <div className="steps-grid">
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
        <section id="pricing" className="section" aria-labelledby="pricing-heading">
          <div className="container-5xl">
            <div className="section-header">
              <h2 id="pricing-heading" className="section-title">
                Simple, transparent pricing
              </h2>
              <p className="section-sub">
                Start free, scale as you grow. No hidden fees, no surprises.
              </p>
            </div>

            <div className="pricing-grid">
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
        <section className="section">
          <div className="container-3xl">
            <div
              className="glass-card-bright cta-card animate-fade-up"
              style={{ animationFillMode: "forwards", opacity: 0 }}
            >
              <h2 className="cta-title">
                Ready to transform how your
                <br />
                team works with documents?
              </h2>
              <p className="cta-desc">
                Join thousands of teams using DocuFlow AI to unlock the knowledge
                trapped in their documents.
              </p>
              <div className="cta-actions">
                <a href="/signup" className="btn-primary">
                  <span>Start for free — no credit card needed</span>
                  <IconArrowRight />
                </a>
              </div>
              <p style={{ marginTop: "1.5rem", fontSize: "0.875rem", color: "var(--text-muted)" }}>
                14-day free trial on all paid plans · Cancel any time
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* ────────────────────────────────────────
          FOOTER
      ──────────────────────────────────────── */}
      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-top">
            {/* Brand */}
            <div>
              <div className="footer-brand">
                <div
                  className="logo-icon"
                  style={{ width: 28, height: 28 }}
                  aria-hidden="true"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                  </svg>
                </div>
                <span className="logo-text" style={{ fontSize: "1rem" }}>
                  DocuFlow <span className="gradient-text">AI</span>
                </span>
              </div>
              <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
                Enterprise Document Intelligence
              </p>
            </div>

            {/* Links */}
            <div className="footer-links">
              {["Privacy", "Terms", "Security", "Status", "API Docs"].map((link) => (
                <a
                  key={link}
                  href="#"
                  className="footer-link"
                >
                  {link}
                </a>
              ))}
            </div>
          </div>

          <div className="footer-bottom">
            <p className="footer-copyright">
              © 2026 DocuFlow AI. All rights reserved.
            </p>
            <div className="footer-status">
              <span className="status-dot" aria-hidden="true" />
              All systems operational
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
