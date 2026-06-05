import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RoadSourceLogo } from "@/components/RoadSourceLogo";
import {
  Briefcase,
  Users,
  Search,
  LineChart,
  ShieldCheck,
  Workflow,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "RoadSource — IT Sourcing & Talent CRM" },
      {
        name: "description",
        content:
          "RoadSource is IT Road's internal CRM for managing client demands, sourcing IT talent, and tracking placements end-to-end.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top App Bar */}
      <header className="sticky top-0 z-40 bg-card/90 backdrop-blur border-b border-border">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <RoadSourceLogo />
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#workflow" className="hover:text-foreground transition-colors">Workflow</a>
            <a href="#roles" className="hover:text-foreground transition-colors">For Teams</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/auth">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link to="/auth">
              <Button size="sm" className="shadow-sm">Get started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 opacity-60"
          style={{
            background:
              "radial-gradient(60% 50% at 20% 0%, rgba(37,99,235,0.10), transparent 70%), radial-gradient(50% 40% at 90% 10%, rgba(13,148,136,0.10), transparent 70%)",
          }}
        />
        <div className="max-w-6xl mx-auto px-6 pt-20 pb-16 md:pt-28 md:pb-24 grid md:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Internal CRM · IT Road
            </div>
            <h1 className="mt-5 text-4xl md:text-6xl font-extrabold tracking-tight">
              From <span className="text-primary">demand</span> to{" "}
              <span style={{ color: "#0D9488" }}>placement</span> — one road.
            </h1>
            <p className="mt-5 text-lg text-muted-foreground max-w-xl">
              RoadSource is the central workspace for IT Road's sales, sourcing, and management teams to
              capture client demands, search the talent hub, and track every candidate to hire.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/auth">
                <Button size="lg" className="shadow-md">
                  Open the app <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <a href="#features">
                <Button size="lg" variant="outline">Explore features</Button>
              </a>
            </div>
            <ul className="mt-8 grid grid-cols-2 gap-3 max-w-md text-sm text-muted-foreground">
              {["Demand pipeline", "Talent Hub search", "Candidate financials", "Role-based access"].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-accent" /> {t}
                </li>
              ))}
            </ul>
          </div>

          {/* Hero illustration card */}
          <div className="relative">
            <div className="absolute -inset-6 rounded-3xl bg-gradient-to-br from-primary/10 to-accent/10 blur-2xl -z-10" />
            <Card className="rounded-2xl border-border/70 shadow-md overflow-hidden">
              <div className="px-5 py-3 flex items-center gap-2 border-b bg-muted/40">
                <div className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
                <div className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
                <div className="h-2.5 w-2.5 rounded-full bg-accent" />
                <div className="ml-3 text-xs text-muted-foreground">roadsource · dashboard</div>
              </div>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-muted-foreground font-medium">Open demands</div>
                    <div className="text-3xl font-extrabold tracking-tight">24</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground font-medium">Active candidates</div>
                    <div className="text-3xl font-extrabold tracking-tight" style={{ color: "#0D9488" }}>137</div>
                  </div>
                </div>
                <div className="space-y-2">
                  {[
                    { name: "Senior React Engineer", client: "Acme Bank", status: "Interview", tone: "primary" },
                    { name: "DevOps Lead", client: "NovaPay", status: "Sourcing", tone: "muted" },
                    { name: "Data Engineer", client: "Helios", status: "Hired", tone: "accent" },
                  ].map((row) => (
                    <div
                      key={row.name}
                      className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 hover:bg-muted/40 transition-colors"
                    >
                      <div>
                        <div className="text-sm font-semibold">{row.name}</div>
                        <div className="text-xs text-muted-foreground">{row.client}</div>
                      </div>
                      <span
                        className={
                          "text-xs font-semibold px-2.5 py-1 rounded-full " +
                          (row.tone === "primary"
                            ? "bg-primary/10 text-primary"
                            : row.tone === "accent"
                            ? "bg-accent/10 text-accent"
                            : "bg-muted text-muted-foreground")
                        }
                      >
                        {row.status}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 border-t border-border bg-card">
        <div className="max-w-6xl mx-auto px-6">
          <div className="max-w-2xl">
            <div className="text-xs font-semibold tracking-[0.18em] text-primary">WHAT'S INSIDE</div>
            <h2 className="mt-2 text-3xl md:text-4xl font-extrabold tracking-tight">
              Everything sourcing needs, in one workspace.
            </h2>
            <p className="mt-3 text-muted-foreground">
              Purpose-built for IT Road's internal flow — capture demands from sales, route them to sourcing,
              and track candidates with financial context all the way to placement.
            </p>
          </div>

          <div className="mt-12 grid md:grid-cols-3 gap-5">
            {[
              {
                icon: Briefcase,
                title: "Demand pipeline",
                body: "Centralize client demands with engagement type, status, and assigned sourcers.",
                tone: "primary",
              },
              {
                icon: Search,
                title: "Talent Hub search",
                body: "Search the internal CV database by seniority, skills, availability and engagement preference.",
                tone: "accent",
              },
              {
                icon: Users,
                title: "Candidate tracking",
                body: "Move candidates through stages and keep a single source of truth per demand.",
                tone: "primary",
              },
              {
                icon: LineChart,
                title: "Financial visibility",
                body: "Rate cards and candidate financials so managers can validate margins fast.",
                tone: "accent",
              },
              {
                icon: ShieldCheck,
                title: "Role-based access",
                body: "Admin, manager, sales and sourcing roles enforced with row-level security.",
                tone: "primary",
              },
              {
                icon: Workflow,
                title: "End-to-end flow",
                body: "From the moment a demand is logged to the placement — one road, no spreadsheets.",
                tone: "accent",
              },
            ].map((f) => (
              <Card key={f.title} className="rounded-xl border-border/80 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div
                    className={
                      "h-11 w-11 rounded-xl flex items-center justify-center mb-4 " +
                      (f.tone === "primary" ? "bg-primary/10 text-primary" : "bg-accent/10 text-accent")
                    }
                  >
                    <f.icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold text-lg">{f.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{f.body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Workflow */}
      <section id="workflow" className="py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto">
            <div className="text-xs font-semibold tracking-[0.18em] text-primary">THE ROAD</div>
            <h2 className="mt-2 text-3xl md:text-4xl font-extrabold tracking-tight">
              A clear path from request to hire.
            </h2>
          </div>
          <div className="mt-12 grid md:grid-cols-4 gap-5">
            {[
              { step: "01", title: "Capture demand", body: "Sales logs the client demand with role, engagement, and timeline." },
              { step: "02", title: "Assign sourcer", body: "Managers route demands to sourcing team members." },
              { step: "03", title: "Source candidates", body: "Sourcers search the Talent Hub and shortlist matches." },
              { step: "04", title: "Track to placement", body: "Move candidates through stages until the placement is closed." },
            ].map((s) => (
              <div key={s.step} className="relative">
                <Card className="rounded-xl shadow-sm h-full">
                  <CardContent className="p-6">
                    <div className="text-xs font-bold text-primary tracking-wider">{s.step}</div>
                    <div className="mt-2 font-semibold text-lg">{s.title}</div>
                    <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{s.body}</p>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Roles */}
      <section id="roles" className="py-20 border-t border-border bg-card">
        <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-12 items-center">
          <div>
            <div className="text-xs font-semibold tracking-[0.18em] text-primary">BUILT FOR YOUR TEAMS</div>
            <h2 className="mt-2 text-3xl md:text-4xl font-extrabold tracking-tight">
              One app, four perspectives.
            </h2>
            <p className="mt-3 text-muted-foreground">
              RoadSource adapts to what each team needs to see — without compromising on data access controls.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { role: "Sales", body: "Log demands and watch pipeline." },
              { role: "Sourcing", body: "Work assigned demands and search talent." },
              { role: "Manager", body: "Assign work and review financials." },
              { role: "Admin", body: "Manage users, roles, and access." },
            ].map((r) => (
              <Card key={r.role} className="rounded-xl shadow-sm">
                <CardContent className="p-5">
                  <div className="font-semibold">{r.role}</div>
                  <div className="text-sm text-muted-foreground mt-1">{r.body}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-6">
          <Card
            className="rounded-2xl border-0 text-white shadow-md overflow-hidden"
            style={{ background: "linear-gradient(135deg, #2563EB 0%, #0D9488 100%)" }}
          >
            <CardContent className="p-10 md:p-14 text-center">
              <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">
                Ready to drive your sourcing?
              </h2>
              <p className="mt-3 text-white/85 max-w-xl mx-auto">
                Sign in to RoadSource and pick up where the team left off.
              </p>
              <div className="mt-7">
                <Link to="/auth">
                  <Button size="lg" variant="secondary" className="bg-white text-primary hover:bg-white/90 shadow-md">
                    Open RoadSource <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <footer className="border-t border-border py-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-wrap items-center justify-between gap-4">
          <RoadSourceLogo />
          <div className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} IT Road · RoadSource internal CRM
          </div>
        </div>
      </footer>
    </div>
  );
}
