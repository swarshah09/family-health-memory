import { Link } from "react-router-dom";
import {
  ArrowRight,
  Heart,
  Mic,
  Pencil,
  Quote,
  Shield,
  Sparkles,
  Users
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const } }
};
const heroImg = "https://images.unsplash.com/photo-1707194227410-491b10aff33b?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDJ8MHwxfHNlYXJjaHwxfHx3YXJtJTIwZmFtaWx5JTIwZ2VuZXJhdGlvbnMlMjBodWdnaW5nfGVufDB8fHx8MTc3ODY3NTc0OXww&ixlib=rb-4.1.0&q=85";
const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } }
};

const heroSocialAvatars = [
  {
    src: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=facearea&facepad=2.2&w=128&h=128&q=80",
    alt: "Portrait of a smiling woman"
  },
  {
    src: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=facearea&facepad=2.2&w=128&h=128&q=80",
    alt: "Portrait of a man outdoors"
  },
  {
    src: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=facearea&facepad=2.2&w=128&h=128&q=80",
    alt: "Portrait of a woman with wavy hair"
  },
  {
    src: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=facearea&facepad=2.2&w=128&h=128&q=80",
    alt: "Portrait of a man smiling"
  }
] as const;

const TRUST_BANNER_SEGMENTS = [
  "A safe corner",
  "End-to-end private workspace",
  "No ads, ever",
  "Granular role-based permissions",
  "You own your family's data",
  "Export anytime",
  "Observation support — not a diagnosis service"
] as const;

function TrustBannerStrip({ forMarqueeDuplicate }: { forMarqueeDuplicate?: boolean }) {
  return (
    <div
      className="flex shrink-0 items-center gap-2 pr-10 text-sm text-muted-foreground sm:gap-3 sm:pr-14"
      aria-hidden={forMarqueeDuplicate ? true : undefined}
    >
      {TRUST_BANNER_SEGMENTS.map((label, i) => (
        <span key={`${label}-${i}`} className="inline-flex items-center gap-2 sm:gap-3">
          {i > 0 && (
            <span className="select-none text-muted-foreground/45" aria-hidden>
              ·
            </span>
          )}
          <span className="whitespace-nowrap">{label}</span>
        </span>
      ))}
    </div>
  );
}

function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/50 bg-[hsl(var(--background)/0.88)] backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2.5 text-foreground">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
            f
          </span>
          <span className="font-serif-display text-lg font-semibold tracking-tight lowercase sm:text-xl">
            family memory
          </span>
        </Link>
        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          <a href="#how-it-works" className="transition hover:text-foreground">
            How it works
          </a>
          <a href="#features" className="transition hover:text-foreground">
            Features
          </a>
          <a href="#trust" className="transition hover:text-foreground">
            Trust &amp; privacy
          </a>
        </nav>
        <div className="flex items-center gap-3 sm:gap-4">
          <Link to="/sign-in" className="text-sm font-medium text-muted-foreground transition hover:text-foreground">
            Sign in
          </Link>
          <Link to="/sign-in?signup=1" className="btn-chronicle-primary inline-flex px-4 py-2 text-sm">
            Open workspace
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
      <div className="flex justify-center gap-4 border-t border-border/30 py-2 text-xs text-muted-foreground md:hidden">
        <a href="#how-it-works" className="font-medium">
          How it works
        </a>
        <a href="#features" className="font-medium">
          Features
        </a>
        <a href="#trust" className="font-medium">
          Trust
        </a>
      </div>
    </header>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-background grain-soft text-foreground">
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_70%_50%_at_0%_0%,hsl(var(--primary)/0.07),transparent_55%),radial-gradient(ellipse_60%_45%_at_100%_0%,hsl(var(--accent)/0.08),transparent_50%),radial-gradient(ellipse_50%_40%_at_50%_100%,hsl(var(--primary)/0.05),transparent_50%)]"
        aria-hidden
      />
      <Nav />

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 sm:pb-20 sm:pt-14 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-x-10 lg:gap-y-0 lg:px-8 lg:pb-24 lg:pt-16">
          <motion.div
            className="max-w-xl min-w-0 lg:max-w-[min(36rem,100%)]"
            initial="hidden"
            animate="visible"
            variants={stagger}
          >
            <motion.div variants={fadeUp} className="border-t border-border/70 pt-5">
              <p className="overline text-muted-foreground">
                Private · invite only · not a social network
              </p>
            </motion.div>
            <motion.h1
              variants={fadeUp}
              className="font-serif-display mt-6 text-[2.125rem] font-semibold leading-[1.1] tracking-[-0.02em] text-foreground sm:text-5xl sm:leading-[1.08] lg:mt-7 lg:text-[4.125rem]"
            >
              The quiet keeper of your{" "}
              <em className="font-serif-display text-primary italic">family&apos;s wellbeing.</em>
            </motion.h1>
            <motion.p
              variants={fadeUp}
              className="mt-5 max-w-[26rem] font-sans text-[0.9375rem] font-normal leading-[1.65] text-muted-foreground sm:mt-6 sm:text-base sm:leading-[1.7]"
            >
              Family Memory weaves together small observations, voice notes and vitals into a calm, intelligent
              timeline — so the people you love are never seen in fragments again.
            </motion.p>
            <motion.div variants={fadeUp} className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <Link to="/sign-in?signup=1" className="btn-chronicle-primary justify-center px-6 py-3 text-base">
                Open your family workspace
                <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
              </Link>
              <a href="#how-it-works" className="btn-chronicle-outline justify-center px-6 py-3 text-base">
                See a live family · demo
              </a>
            </motion.div>
            <motion.div variants={fadeUp} className="mt-10 flex items-center gap-4 sm:mt-11">
              <div className="flex shrink-0 -space-x-2.5">
                {heroSocialAvatars.map((a, i) => (
                  <img
                    key={a.src}
                    src={a.src}
                    alt={a.alt}
                    width={40}
                    height={40}
                    loading="lazy"
                    decoding="async"
                    className={cn(
                      "relative h-10 w-10 rounded-full border-[2.5px] border-background object-cover shadow-sm",
                      i === 0 && "z-10",
                      i === 1 && "z-20",
                      i === 2 && "z-30",
                      i === 3 && "z-40"
                    )}
                  />
                ))}
              </div>
              <p className="min-w-0 text-[11px] font-normal leading-snug text-muted-foreground sm:text-xs sm:leading-relaxed">
                Trusted by 1,400+ multi-generational households quietly caring for someone they love.
              </p>
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.9 }}
            className="relative mt-10 min-w-0 lg:mt-0"
          >
            <div className="relative rounded-[2.25rem] overflow-hidden shadow-soft-lg">
              <img src={heroImg} alt="Three generations of a family" className="w-full h-[560px] object-cover" />
              <div className="absolute inset-0 bg-gradient-to-tr from-[hsl(120_30%_15%/0.55)] via-transparent to-transparent" />
              {/* Floating insight chip */}
              <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.6 }} className="absolute left-6 top-6 glass rounded-2xl px-4 py-3 max-w-[260px]">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles size={14} stroke="red" aria-hidden />
                  <span className="overline">AI Insight</span>
                </div>
                <p className="text-sm">Aaji's morning BP has climbed gently over 12 days — consider a calm chat.</p>
              </motion.div> 
              {/* Voice chip */}
              <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.9 }} className="absolute right-6 bottom-6 glass rounded-2xl px-4 py-3 flex items-center gap-3">
                <span className="pulse-dot" />
                <div className="wave"><span style={{height:"30%"}}/><span style={{height:"60%"}}/><span style={{height:"90%"}}/><span style={{height:"45%"}}/><span style={{height:"75%"}}/><span style={{height:"30%"}}/></div>
                <span className="text-xs text-muted-foreground">Meera · 12s</span>
              </motion.div>
            </div>
            <div
              className="absolute -inset-8 -z-10 rounded-full opacity-45 blur-3xl sm:-inset-10"
              style={{ background: "radial-gradient(closest-side, hsl(38 80% 80%), transparent)" }}
              aria-hidden
            />
          </motion.div>
        </section>

        {/* Trust bar — infinite horizontal marquee */}
        <section
          id="trust"
          aria-label="Trust and privacy highlights"
          className="border-y border-border/50 bg-card/50 py-3 sm:py-3.5"
        >
          <div className="relative overflow-hidden">
            <div className="trust-banner-track">
              <TrustBannerStrip />
              <TrustBannerStrip forMarqueeDuplicate />
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16 lg:items-start">
            <div>
              <p className="overline text-muted-foreground">How it works</p>
              <h2 className="font-serif-display mt-3 text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl lg:text-[2.75rem]">
                Three small habits. One quietly powerful memory.
              </h2>
              <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
                Capture in seconds, stay consistent without pressure, and let the timeline show the shape of care over
                time — for you and for everyone you loop in.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3 lg:gap-5">
              {[
                {
                  n: "01",
                  title: "Whisper an observation",
                  body: "Voice or text — whatever is easiest in the moment.",
                  icon: Mic,
                  tone: "bg-primary/12 text-primary"
                },
                {
                  n: "02",
                  title: "Log a number or moment",
                  body: "Vitals, symptoms, meds, or a simple note in your own words.",
                  icon: Pencil,
                  tone: "bg-accent/15 text-accent"
                },
                {
                  n: "03",
                  title: "Read the weather of your loved ones",
                  body: "Patterns and gentle insights — support for noticing, not diagnosing.",
                  icon: Sparkles,
                  tone: "bg-primary/10 text-primary"
                }
              ].map((step) => (
                <div
                  key={step.n}
                  className="chronicle-card flex flex-col rounded-[1.75rem] p-5 sm:min-h-[17rem] sm:p-6"
                >
                  <span className="text-sm font-medium text-muted-foreground/80">{step.n}</span>
                  <div
                    className={cn(
                      "mt-4 flex h-12 w-12 items-center justify-center rounded-full",
                      step.tone
                    )}
                  >
                    <step.icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                  </div>
                  <h3 className="mt-4 font-semibold text-foreground">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="border-t border-border/40 bg-muted/15 py-16 sm:py-20 lg:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <p className="overline text-center text-muted-foreground">Features</p>
            <h2 className="font-serif-display mx-auto mt-3 max-w-2xl text-center text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Built for the long arc of care
            </h2>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
              {[
                {
                  title: "Living timeline",
                  body: "Every note lands in one place with mood, tags, and who it was about — readable at a glance.",
                  icon: Heart,
                  tone: "bg-primary/12 text-primary"
                },
                {
                  title: "AI that listens, not diagnoses",
                  body: "Gentle summaries and trends to spark the right questions for your clinician.",
                  icon: Sparkles,
                  tone: "bg-accent/18 text-accent"
                },
                {
                  title: "Voice-first capture",
                  body: "Hands full? Speak a short observation; we keep the audio and the thread together.",
                  icon: Mic,
                  tone: "bg-primary/10 text-primary"
                },
                {
                  title: "Family by design",
                  body: "Invite-only workspace with roles tuned for how your household actually shares responsibility.",
                  icon: Users,
                  tone: "bg-primary/12 text-primary"
                },
                {
                  title: "Yours, fully",
                  body: "No ads. Export when you need to. Your data stays oriented around your family, not a feed.",
                  icon: Shield,
                  tone: "bg-accent/18 text-accent"
                },
                {
                  title: "Doctor-ready briefs",
                  body: "Summaries you can bring to visits — grounded in what the whole circle noticed over time.",
                  icon: Pencil,
                  tone: "bg-primary/10 text-primary"
                }
              ].map((f) => (
                <div key={f.title} className="chronicle-card rounded-[1.75rem] p-6">
                  <div className={cn("flex h-11 w-11 items-center justify-center rounded-full", f.tone)}>
                    <f.icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                  </div>
                  <h3 className="mt-4 font-semibold text-foreground">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Quote */}
        <section className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6 lg:px-8 lg:py-28">
          <Quote className="mx-auto h-8 w-8 text-accent" strokeWidth={1.25} aria-hidden />
          <blockquote className="font-serif-display mt-8 text-2xl font-medium leading-snug text-primary sm:text-3xl">
            When my father was sick, three of us were caring for him from three cities. We were each holding a corner of
            the same blanket — and dropping pieces.{" "}
            <span className="text-primary">Family Memory is the loom.</span>
          </blockquote>
          <p className="overline mt-10 text-muted-foreground">— Priya, Bengaluru · daughter of two</p>
        </section>

        {/* CTA card */}
        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6 lg:px-8 lg:pb-28">
          <div className="overflow-hidden rounded-[2.5rem] bg-primary px-6 py-10 text-primary-foreground shadow-sm sm:px-10 sm:py-12 lg:grid lg:grid-cols-2 lg:items-center lg:gap-12 lg:rounded-[3rem] lg:px-14 lg:py-14">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary-foreground/80">
                Begin gently
              </p>
              <h2 className="font-serif-display mt-3 text-2xl font-semibold leading-tight sm:text-3xl lg:text-[2.25rem]">
                Open the room where your family lives a little longer.
              </h2>
            </div>
            <div className="mt-8 lg:mt-0">
              <p className="text-sm leading-relaxed text-primary-foreground/90 sm:text-base">
                Free to start with the people who matter most. No card needed. Most families are up and running in under
                two minutes.
              </p>
              <Link
                to="/sign-in?signup=1"
                className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-accent px-6 py-3.5 text-sm font-semibold text-accent-foreground shadow-sm transition hover:bg-accent/90"
              >
                Create our family workspace
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <p className="mt-4 text-xs text-primary-foreground/75">
                Observation support only — not a medical diagnosis service.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/50 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-xs text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
          <p>© {new Date().getFullYear()} Family Memory · A quiet companion for caregiving households.</p>
          <p>Built with care</p>
        </div>
      </footer>
    </div>
  );
}
