import { useLocation, Link } from "wouter";
import { ChevronLeft, Shield, Mail, Info, FileText, ExternalLink } from "lucide-react";
import { motion } from "framer-motion";

type LegalSection = "privacy" | "contact" | "about" | "terms";

const SECTIONS: Record<LegalSection, { title: string; icon: React.ElementType; color: string; glow: string }> = {
  about:   { title: "About Us",            icon: Info,     color: "text-violet-400",  glow: "rgba(167,139,250,0.25)" },
  privacy: { title: "Privacy Policy",      icon: Shield,   color: "text-emerald-400", glow: "rgba(52,211,153,0.25)"  },
  terms:   { title: "Terms & Conditions",  icon: FileText, color: "text-orange-400",  glow: "rgba(251,146,60,0.25)"  },
  contact: { title: "Contact Us",          icon: Mail,     color: "text-blue-400",    glow: "rgba(96,165,250,0.25)"  },
};

function AboutContent() {
  return (
    <div className="space-y-6">
      <Section title="What is ZimSolve?">
        ZimSolve is a free AI-powered mathematics and study platform built specifically for ZIMSEC and Cambridge O-Level students in Zimbabwe.
        Our mission is to make quality education accessible to every student, regardless of location or financial background.
      </Section>
      <Section title="What We Offer">
        <ul className="space-y-2 list-disc list-inside text-muted-foreground">
          <li>AI-powered mathematics solver supporting algebra, calculus, geometry and more</li>
          <li>20,000+ study PDFs including past papers, green books and textbooks</li>
          <li>Scientific calculator, graph plotter, and unit converter</li>
          <li>AI tutor chat for personalised explanations</li>
          <li>Interactive quiz mode and puzzle games for active learning</li>
          <li>Study Hall and Exam Centre with AI-generated practice papers</li>
          <li>Community forum for peer-to-peer discussion</li>
          <li>Books Library with 2,600+ self-help, academic and fiction titles</li>
          <li>Progress tracking with XP, streaks and weekly token allowances</li>
        </ul>
      </Section>
      <Section title="Free for Every Student">
        Every registered student receives 600,000 AI tokens per week at no cost. Guest users receive 100,000 tokens per week.
        Additional token packages are available for heavy users. Core study resources — PDFs, calculators, graph plotters — are always free.
      </Section>
      <Section title="Built for Zimbabwe">
        ZimSolve is aligned with the ZIMSEC O-Level and Cambridge International syllabi. Resources are curated by local educators to ensure
        they match exactly what students are tested on in Zimbabwe.
      </Section>
      <Section title="Our Technology">
        ZimSolve is powered by leading AI models via OpenRouter, free open-source models via Ollama, and trusted mathematics APIs including
        SymPy, NumPy, SciPy, and the Newton Mathematics API. All AI responses should be verified — they are meant to guide, not replace, study.
      </Section>
    </div>
  );
}

function PrivacyContent() {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground italic">Last updated: April 2026</p>
      <Section title="Information We Collect">
        <ul className="space-y-2 list-disc list-inside text-muted-foreground">
          <li><strong className="text-white">Account information:</strong> name, email address and hashed password when you register</li>
          <li><strong className="text-white">Usage data:</strong> AI queries, pages visited and features used (to improve the platform)</li>
          <li><strong className="text-white">Token usage:</strong> counts of AI tokens consumed each week</li>
          <li><strong className="text-white">Reading history:</strong> books and PDFs opened, stored locally in your browser</li>
          <li><strong className="text-white">Device identifiers:</strong> anonymous UUID stored in your browser for guest token tracking</li>
        </ul>
      </Section>
      <Section title="How We Use Your Information">
        <ul className="space-y-2 list-disc list-inside text-muted-foreground">
          <li>To provide and improve our study tools and AI features</li>
          <li>To enforce weekly token limits and prevent abuse</li>
          <li>To send password-reset emails when requested</li>
          <li>To track progress, streaks and XP milestones</li>
          <li>To moderate community forum posts and announcements</li>
        </ul>
      </Section>
      <Section title="Data We Do Not Collect">
        We do not collect payment card numbers directly — payments are processed by PayPal and third-party payment processors.
        We do not sell your personal data to any third party. We do not use cookies for advertising or tracking.
      </Section>
      <Section title="Data Storage and Security">
        Your data is stored in a secure PostgreSQL database. Passwords are hashed using industry-standard algorithms and never stored in plain text.
        Session tokens are stored in HTTP-only cookies. We use HTTPS for all data in transit.
      </Section>
      <Section title="Your Rights">
        You may request deletion of your account and all associated data at any time by contacting us. You may also update your name and password from your profile settings at any time.
      </Section>
      <Section title="Children's Privacy">
        ZimSolve is designed for secondary school students aged 13 and above. We do not knowingly collect personal data from children under 13. If you believe a child under 13 has created an account, please contact us immediately.
      </Section>
      <Section title="Changes to This Policy">
        We may update this Privacy Policy from time to time. We will notify users of significant changes via the community forum. Continued use of ZimSolve after changes constitutes acceptance of the updated policy.
      </Section>
    </div>
  );
}

function TermsContent() {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground italic">Last updated: April 2026</p>
      <Section title="Acceptance of Terms">
        By accessing or using ZimSolve, you agree to be bound by these Terms and Conditions. If you do not agree with any part of these terms, you must not use the platform.
      </Section>
      <Section title="Use of the Platform">
        <ul className="space-y-2 list-disc list-inside text-muted-foreground">
          <li>ZimSolve is provided for personal, non-commercial educational use only</li>
          <li>You must not attempt to reverse-engineer, scrape or abuse our APIs</li>
          <li>You must not use AI features to generate harmful, offensive or misleading content</li>
          <li>You must not create multiple accounts to circumvent token limits</li>
          <li>Sharing your account credentials with others is prohibited</li>
        </ul>
      </Section>
      <Section title="AI Accuracy Disclaimer">
        AI responses on ZimSolve are generated by large language models and may contain errors. All AI-generated answers, solutions and explanations should be independently verified. ZimSolve accepts no liability for decisions made solely on the basis of AI output.
      </Section>
      <Section title="Token System">
        Free weekly tokens are provided as a courtesy and may be modified, limited or suspended at any time without prior notice.
        Purchased token packages are non-refundable once credited to your account unless required by applicable law.
      </Section>
      <Section title="Community Forum">
        Users must maintain respectful conduct in the community forum. Posts containing spam, hate speech, personal attacks, or academic dishonesty (e.g. asking for exam answers during live exams) will be removed.
        Repeated violations may result in account suspension.
      </Section>
      <Section title="Intellectual Property">
        Study resources, past papers and textbooks on ZimSolve are sourced from public educational repositories and are the property of their respective copyright holders. ZimSolve does not claim ownership of any third-party educational content.
      </Section>
      <Section title="Limitation of Liability">
        ZimSolve is provided "as is" without warranty of any kind. We are not liable for any direct, indirect, incidental or consequential damages arising from your use of the platform.
      </Section>
      <Section title="Governing Law">
        These terms are governed by the laws of the Republic of Zimbabwe. Any disputes shall be subject to the exclusive jurisdiction of the courts of Zimbabwe.
      </Section>
    </div>
  );
}

function ContactContent() {
  return (
    <div className="space-y-6">
      <Section title="Get in Touch">
        We would love to hear from you — whether you have a question, a bug report, a feature suggestion, or just want to say hello.
        Our small team tries to respond to every message within 48 hours.
      </Section>

      <div className="grid gap-4 sm:grid-cols-2">
        <ContactCard
          icon={Mail}
          title="General Enquiries"
          value="support@zimsolve.app"
          href="mailto:support@zimsolve.app"
          color="text-blue-400"
          glow="rgba(96,165,250,0.15)"
          border="rgba(96,165,250,0.2)"
        />
        <ContactCard
          icon={Mail}
          title="Bug Reports"
          value="bugs@zimsolve.app"
          href="mailto:bugs@zimsolve.app"
          color="text-red-400"
          glow="rgba(248,113,113,0.15)"
          border="rgba(248,113,113,0.2)"
        />
        <ContactCard
          icon={Mail}
          title="Content Requests"
          value="content@zimsolve.app"
          href="mailto:content@zimsolve.app"
          color="text-emerald-400"
          glow="rgba(52,211,153,0.15)"
          border="rgba(52,211,153,0.2)"
        />
        <ContactCard
          icon={Mail}
          title="Partnerships"
          value="partnerships@zimsolve.app"
          href="mailto:partnerships@zimsolve.app"
          color="text-violet-400"
          glow="rgba(167,139,250,0.15)"
          border="rgba(167,139,250,0.2)"
        />
      </div>

      <Section title="Community Forum">
        For questions about specific topics, study resources or to connect with other students, visit our{" "}
        <span className="text-violet-400 font-medium">Community Forum</span> inside the app.
        Community posts are public and may receive answers from both students and our team.
      </Section>

      <Section title="Reporting Content Issues">
        If you believe a resource (PDF, AI response or community post) is incorrect, harmful or violates copyright, please email{" "}
        <a href="mailto:support@zimsolve.app" className="text-blue-400 hover:underline">support@zimsolve.app</a>{" "}
        with a description of the issue and where you found it. We will investigate within 5 business days.
      </Section>

      <Section title="Response Times">
        <ul className="space-y-1 list-disc list-inside text-muted-foreground">
          <li>General enquiries: within 48 hours</li>
          <li>Bug reports: within 24 hours on weekdays</li>
          <li>Content removal requests: within 5 business days</li>
          <li>Partnership enquiries: within 1 week</li>
        </ul>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-bold text-white mb-2">{title}</h3>
      <div className="text-sm text-muted-foreground leading-relaxed">{children}</div>
    </div>
  );
}

function ContactCard({ icon: Icon, title, value, href, color, glow, border }: {
  icon: React.ElementType; title: string; value: string; href: string;
  color: string; glow: string; border: string;
}) {
  return (
    <a href={href} className="flex items-start gap-3 p-4 rounded-xl transition-all hover:scale-[1.01] active:scale-[0.99]"
      style={{ background: glow, border: `1px solid ${border}` }}>
      <div className={`p-2 rounded-lg shrink-0 ${color}`} style={{ background: "rgba(255,255,255,0.08)" }}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-white mb-0.5">{title}</p>
        <p className={`text-xs ${color} truncate flex items-center gap-1`}>
          {value} <ExternalLink className="w-2.5 h-2.5 shrink-0" />
        </p>
      </div>
    </a>
  );
}

export default function LegalPage({ section }: { section: LegalSection }) {
  const [, navigate] = useLocation();
  const meta = SECTIONS[section];
  const Icon = meta.icon;

  const allSections: LegalSection[] = ["about", "privacy", "terms", "contact"];

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "linear-gradient(160deg, #07091a 0%, #0a0d1f 50%, #060813 100%)" }}>
      {/* Top bar */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-white/8"
        style={{ background: "rgba(7, 9, 18, 0.95)", backdropFilter: "blur(20px)" }}>
        <button onClick={() => navigate("/")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-muted-foreground hover:text-white hover:bg-white/10 transition-all text-sm">
          <ChevronLeft className="w-4 h-4" /> Back to ZimSolve
        </button>
        <div className="flex items-center gap-2 ml-2">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center text-sm"
            style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)" }}>
            🎯
          </div>
          <span className="text-sm font-bold text-white">ZimSolve</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
          {/* Page header */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <div className="flex items-center gap-4 p-6 rounded-2xl"
              style={{ background: `linear-gradient(135deg, ${meta.glow} 0%, rgba(255,255,255,0.03) 100%)`, border: `1px solid ${meta.glow}` }}>
              <div className="p-3 rounded-2xl shrink-0" style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}>
                <Icon className={`w-6 h-6 ${meta.color}`} />
              </div>
              <div>
                <h1 className="text-2xl font-display font-black text-white">{meta.title}</h1>
                <p className="text-sm text-muted-foreground mt-0.5">ZimSolve · AI Math Solver for Zimbabwe</p>
              </div>
            </div>
          </motion.div>

          {/* Navigation pills */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}>
            <div className="flex flex-wrap gap-2">
              {allSections.map(s => {
                const m = SECTIONS[s];
                const SIcon = m.icon;
                const isActive = s === section;
                return (
                  <Link key={s} href={`/${s}`}>
                    <button className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                      isActive ? `${m.color} border` : "text-muted-foreground hover:text-white hover:bg-white/8 border border-white/10"
                    }`}
                      style={isActive ? { background: m.glow, borderColor: m.glow } : {}}>
                      <SIcon className="w-3 h-3" />
                      {m.title}
                    </button>
                  </Link>
                );
              })}
            </div>
          </motion.div>

          {/* Content */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
            <div className="rounded-2xl p-6"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
              {section === "about"   && <AboutContent />}
              {section === "privacy" && <PrivacyContent />}
              {section === "terms"   && <TermsContent />}
              {section === "contact" && <ContactContent />}
            </div>
          </motion.div>

          {/* Footer note */}
          <p className="text-center text-xs text-muted-foreground/40 pb-4">
            © {new Date().getFullYear()} ZimSolve · Built for Zimbabwe's students
          </p>
        </div>
      </div>
    </div>
  );
}
