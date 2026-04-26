import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Mic, TrendingUp, ShieldCheck, ChevronRight,
  Activity, Brain, Users, Sparkles,
  BriefcaseBusiness, Presentation, Phone, Video, GraduationCap
} from 'lucide-react';

// ── Mini Dashboard Preview (Hero mockup) ─────────────────────────────────────
function DashboardPreview() {
  return (
    <div className="relative w-full max-w-sm mx-auto rounded-2xl border border-border bg-card shadow-2xl shadow-primary/10 overflow-hidden text-left">
      {/* Window bar */}
      <div className="flex items-center gap-1.5 px-4 py-3 border-b border-border bg-muted/30">
        <div className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
        <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/60" />
        <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/60" />
        <span className="ml-2 text-xs text-muted-foreground font-medium">PS Coach</span>
      </div>

      <div className="p-4 flex flex-col gap-3">
        {/* Feedback card */}
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
          <p className="text-xs text-emerald-500 font-semibold tracking-wide uppercase mb-1">AI Coaching Summary</p>
          <p className="text-xs text-foreground leading-relaxed">
            Your pitch variance improved this session. Fewer monotone segments compared to your baseline. Focus next on reducing pauses after key statements.
          </p>
        </div>

        {/* Metrics row */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Pitch CV', value: '0.182', unit: 'cv' },
            { label: 'Loudness', value: '0.039', unit: 'rms' },
            { label: 'Pauses', value: '3', unit: 'total' },
          ].map((m) => (
            <div key={m.label} className="rounded-md border border-border bg-background/50 p-2 text-center">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{m.label}</div>
              <div className="text-sm font-mono font-bold text-foreground">{m.value}</div>
              <div className="text-[10px] text-muted-foreground">{m.unit}</div>
            </div>
          ))}
        </div>

        {/* Graph bar simulation */}
        <div className="rounded-md border border-border bg-background/50 p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">Live Pitch Waveform</div>
          <div className="flex items-end gap-0.5 h-8">
            {[0.4, 0.7, 0.9, 0.6, 0.8, 1.0, 0.75, 0.5, 0.85, 0.6, 0.9, 0.7, 0.4, 0.6, 0.8, 0.95, 0.5, 0.7, 0.85, 0.6].map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-sm bg-primary/60"
                style={{ height: `${h * 100}%` }}
              />
            ))}
          </div>
        </div>

        {/* Session history entry */}
        <div className="rounded-lg border border-border p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold border border-primary/20">#3</div>
            <div>
              <div className="text-xs font-medium text-foreground">Apr 26 · 2m 14s</div>
              <div className="text-[10px] text-muted-foreground">3 phrases · 1 pause</div>
            </div>
          </div>
          <Badge variant="outline" className="text-emerald-500 border-emerald-500/30 bg-emerald-500/10 text-[10px] gap-1">
            <TrendingUp className="h-2.5 w-2.5" /> Improved
          </Badge>
        </div>
      </div>
    </div>
  );
}

// ── Main LandingPage ──────────────────────────────────────────────────────────
export function LandingPage({ onLogin, onTryDemo }) {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">

      {/* ── Nav ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Mic className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-foreground text-lg">PS Coach</span>
          </div>
          <Button onClick={onLogin} variant="outline" size="sm" className="gap-2">
            Sign In
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative pt-32 pb-24 px-6 overflow-hidden">
        {/* Ambient glow */}
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-40 right-10 w-[300px] h-[300px] bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left: Copy */}
          <div className="flex flex-col gap-6">
            <Badge variant="outline" className="w-fit gap-2 text-primary border-primary/30 bg-primary/5">
              <Sparkles className="h-3 w-3" />
              AI-Powered Behavioral Coach
            </Badge>

            <h1 className="text-4xl sm:text-5xl font-bold leading-tight tracking-tight text-foreground">
              Your private AI coach for{' '}
              <span className="bg-gradient-to-br from-primary to-purple-400 bg-clip-text text-transparent">
                speaking with confidence.
              </span>
            </h1>

            <p className="text-lg text-muted-foreground leading-relaxed max-w-md">
              Practice speaking with AI feedback that actually helps. Reduce fillers, improve pacing, and sound more authoritative — session by session.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button onClick={onLogin} size="lg" className="gap-2 rounded-full h-12 px-8 shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all">
                <Mic className="h-5 w-5" />
                Start Free Coaching
              </Button>
              <Button onClick={onTryDemo} size="lg" variant="outline" className="gap-2 rounded-full h-12 px-8">
                Try Sample Session
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Trust strip */}
            <div className="flex flex-wrap gap-x-6 gap-y-2 pt-2">
              {['Private & Secure', 'No setup required', 'Works in your browser'].map(t => (
                <span key={t} className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* Right: Dashboard preview */}
          <div className="flex justify-center lg:justify-end">
            <DashboardPreview />
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="py-24 px-6 bg-muted/20 border-y border-border/50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs text-primary uppercase tracking-widest font-semibold mb-3">Simple Process</p>
            <h2 className="text-3xl font-bold text-foreground">From practice to progress in 3 steps</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {/* connector line on desktop */}
            <div className="hidden md:block absolute top-8 left-[calc(16.6%+1rem)] right-[calc(16.6%+1rem)] h-px bg-border" />
            {[
              { step: '01', title: 'Record a Practice Session', desc: 'Speak naturally on any topic. The engine listens to your pitch, pacing, pauses, and expressiveness in real-time.' },
              { step: '02', title: 'Get Instant AI Coaching', desc: 'After each session, your AI coach delivers a structured analysis comparing your metrics to past attempts.' },
              { step: '03', title: 'Track Your Progress', desc: 'Sessions are organized into practice threads. Watch your metrics trend upward as you deliberately improve.' },
            ].map((s) => (
              <div key={s.step} className="flex flex-col items-center text-center gap-4">
                <div className="relative z-10 w-16 h-16 rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center">
                  <span className="text-primary font-bold text-lg font-mono">{s.step}</span>
                </div>
                <h3 className="font-semibold text-foreground">{s.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Feature Grid ── */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs text-primary uppercase tracking-widest font-semibold mb-3">What You Get</p>
            <h2 className="text-3xl font-bold text-foreground">Built for real improvement, not just awareness</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: Activity,
                title: 'Catch Monotone Delivery & Awkward Pauses',
                desc: 'Real-time acoustic analysis measures pitch variance, volume trends, and pause timing so you know exactly where you lose your audience.',
                accent: 'text-primary',
                bg: 'bg-primary/5',
                border: 'border-primary/20',
              },
              {
                icon: Brain,
                title: 'A Coach That Remembers Every Session',
                desc: 'Your AI coach compares each session against your history, identifies real trends, and provides progressively more targeted advice.',
                accent: 'text-purple-400',
                bg: 'bg-purple-400/5',
                border: 'border-purple-400/20',
              },
              {
                icon: ShieldCheck,
                title: 'Private, Secure, and Always Yours',
                desc: "Audio is processed locally in your browser. Sessions are saved privately to your own Puter account. No surprise data sharing.",
                accent: 'text-emerald-500',
                bg: 'bg-emerald-500/5',
                border: 'border-emerald-500/20',
              },
            ].map((f) => (
              <Card key={f.title} className={`border ${f.border} ${f.bg} shadow-sm hover:shadow-md transition-shadow`}>
                <CardContent className="p-6 flex flex-col gap-4">
                  <div className={`w-10 h-10 rounded-lg ${f.bg} ${f.border} border flex items-center justify-center`}>
                    <f.icon className={`h-5 w-5 ${f.accent}`} />
                  </div>
                  <h3 className="font-semibold text-foreground leading-snug">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── Who It's For ── */}
      <section className="py-24 px-6 bg-muted/20 border-y border-border/50">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-xs text-primary uppercase tracking-widest font-semibold mb-3">Designed For</p>
          <h2 className="text-3xl font-bold text-foreground mb-12">Anyone whose words need to land</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {[
              { icon: BriefcaseBusiness, label: 'Job Interviews' },
              { icon: Presentation, label: 'Presentations' },
              { icon: Phone, label: 'Sales Calls' },
              { icon: Video, label: 'Content Creators' },
              { icon: GraduationCap, label: 'Students' },
            ].map((u) => (
              <div key={u.label} className="flex flex-col items-center gap-3 p-4 rounded-xl border border-border bg-card hover:border-primary/40 transition-colors">
                <u.icon className="h-6 w-6 text-primary" />
                <span className="text-sm font-medium text-foreground">{u.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="py-32 px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-background pointer-events-none" />
        <div className="relative max-w-2xl mx-auto text-center flex flex-col items-center gap-6">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-2">
            <Mic className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-4xl font-bold text-foreground tracking-tight">
            Ready to sound more confident?
          </h2>
          <p className="text-lg text-muted-foreground">
            Join practitioners who are turning every session into measurable speaking progress.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button onClick={onLogin} size="lg" className="gap-2 rounded-full h-12 px-10 shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all">
              <Mic className="h-5 w-5" />
              Start Practicing Free
            </Button>
            <Button onClick={onTryDemo} size="lg" variant="outline" className="gap-2 rounded-full h-12 px-8">
              Try Without Signing In
            </Button>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-primary flex items-center justify-center">
              <Mic className="h-3 w-3 text-primary-foreground" />
            </div>
            <span className="font-semibold text-foreground">PS Coach</span>
          </div>
          <p>© {new Date().getFullYear()} · Real-time behavioral speaking coach · Powered by Puter AI</p>
        </div>
      </footer>
    </div>
  );
}
