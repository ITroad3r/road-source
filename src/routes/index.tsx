import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RoadSourceLogo } from "@/components/RoadSourceLogo";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { CeoDashboardPreview } from "@/components/CeoDashboardPreview";
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
  const { t } = useTranslation();

  const features = [
    { icon: Briefcase, titleKey: "landing.f1Title", bodyKey: "landing.f1Body", tone: "primary" as const },
    { icon: Search, titleKey: "landing.f2Title", bodyKey: "landing.f2Body", tone: "accent" as const },
    { icon: Users, titleKey: "landing.f3Title", bodyKey: "landing.f3Body", tone: "primary" as const },
    { icon: LineChart, titleKey: "landing.f4Title", bodyKey: "landing.f4Body", tone: "accent" as const },
    { icon: ShieldCheck, titleKey: "landing.f5Title", bodyKey: "landing.f5Body", tone: "primary" as const },
    { icon: Workflow, titleKey: "landing.f6Title", bodyKey: "landing.f6Body", tone: "accent" as const },
  ];

  const steps = [
    { step: "01", titleKey: "landing.step1Title", bodyKey: "landing.step1Body" },
    { step: "02", titleKey: "landing.step2Title", bodyKey: "landing.step2Body" },
    { step: "03", titleKey: "landing.step3Title", bodyKey: "landing.step3Body" },
    { step: "04", titleKey: "landing.step4Title", bodyKey: "landing.step4Body" },
  ];

  const roles = [
    { roleKey: "landing.roleSales", bodyKey: "landing.roleSalesBody" },
    { roleKey: "landing.roleSourcing", bodyKey: "landing.roleSourcingBody" },
    { roleKey: "landing.roleManager", bodyKey: "landing.roleManagerBody" },
    { roleKey: "landing.roleAdmin", bodyKey: "landing.roleAdminBody" },
  ];

  const highlights = [
    "landing.highlight1",
    "landing.highlight2",
    "landing.highlight3",
    "landing.highlight4",
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 bg-card/90 backdrop-blur border-b border-border">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <RoadSourceLogo />
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">{t("landing.navFeatures")}</a>
            <a href="#workflow" className="hover:text-foreground transition-colors">{t("landing.navWorkflow")}</a>
            <a href="#roles" className="hover:text-foreground transition-colors">{t("landing.navTeams")}</a>
          </nav>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Link to="/auth">
              <Button variant="ghost" size="sm">{t("common.signIn")}</Button>
            </Link>
            <Link to="/auth">
              <Button size="sm" className="shadow-sm">{t("common.getStarted")}</Button>
            </Link>
          </div>
        </div>
      </header>

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
              {t("landing.badge")}
            </div>
            <h1 className="mt-5 text-4xl md:text-6xl font-extrabold tracking-tight">
              {t("landing.heroTitlePart1")} <span className="text-primary">{t("landing.heroTitleDemand")}</span> {t("landing.heroTitlePart2")}{" "}
              <span style={{ color: "#0D9488" }}>{t("landing.heroTitlePlacement")}</span> {t("landing.heroTitleEnd")}
            </h1>
            <p className="mt-5 text-lg text-muted-foreground max-w-xl">
              {t("landing.heroSubtitle")}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/auth">
                <Button size="lg" className="shadow-md">
                  {t("landing.openApp")} <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <a href="#features">
                <Button size="lg" variant="outline">{t("landing.exploreFeatures")}</Button>
              </a>
            </div>
            <ul className="mt-8 grid grid-cols-2 gap-3 max-w-md text-sm text-muted-foreground">
              {highlights.map((k) => (
                <li key={k} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-accent" /> {t(k)}
                </li>
              ))}
            </ul>
          </div>

          <CeoDashboardPreview />
        </div>
      </section>

      <section id="features" className="py-20 border-t border-border bg-card">
        <div className="max-w-6xl mx-auto px-6">
          <div className="max-w-2xl">
            <div className="text-xs font-semibold tracking-[0.18em] text-primary">{t("landing.whatsInside")}</div>
            <h2 className="mt-2 text-3xl md:text-4xl font-extrabold tracking-tight">
              {t("landing.featuresTitle")}
            </h2>
            <p className="mt-3 text-muted-foreground">
              {t("landing.featuresSubtitle")}
            </p>
          </div>

          <div className="mt-12 grid md:grid-cols-3 gap-5">
            {features.map((f) => (
              <Card key={f.titleKey} className="rounded-xl border-border/80 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div
                    className={
                      "h-11 w-11 rounded-xl flex items-center justify-center mb-4 " +
                      (f.tone === "primary" ? "bg-primary/10 text-primary" : "bg-accent/10 text-accent")
                    }
                  >
                    <f.icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold text-lg">{t(f.titleKey)}</h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{t(f.bodyKey)}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="workflow" className="py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto">
            <div className="text-xs font-semibold tracking-[0.18em] text-primary">{t("landing.theRoad")}</div>
            <h2 className="mt-2 text-3xl md:text-4xl font-extrabold tracking-tight">
              {t("landing.workflowTitle")}
            </h2>
          </div>
          <div className="mt-12 grid md:grid-cols-4 gap-5">
            {steps.map((s) => (
              <div key={s.step} className="relative">
                <Card className="rounded-xl shadow-sm h-full">
                  <CardContent className="p-6">
                    <div className="text-xs font-bold text-primary tracking-wider">{s.step}</div>
                    <div className="mt-2 font-semibold text-lg">{t(s.titleKey)}</div>
                    <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{t(s.bodyKey)}</p>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="roles" className="py-20 border-t border-border bg-card">
        <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-12 items-center">
          <div>
            <div className="text-xs font-semibold tracking-[0.18em] text-primary">{t("landing.builtFor")}</div>
            <h2 className="mt-2 text-3xl md:text-4xl font-extrabold tracking-tight">
              {t("landing.rolesTitle")}
            </h2>
            <p className="mt-3 text-muted-foreground">
              {t("landing.rolesSubtitle")}
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {roles.map((r) => (
              <Card key={r.roleKey} className="rounded-xl shadow-sm">
                <CardContent className="p-5">
                  <div className="font-semibold">{t(r.roleKey)}</div>
                  <div className="text-sm text-muted-foreground mt-1">{t(r.bodyKey)}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="max-w-4xl mx-auto px-6">
          <Card
            className="rounded-2xl border-0 text-white shadow-md overflow-hidden"
            style={{ background: "linear-gradient(135deg, #2563EB 0%, #0D9488 100%)" }}
          >
            <CardContent className="p-10 md:p-14 text-center">
              <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">
                {t("landing.ctaTitle")}
              </h2>
              <p className="mt-3 text-white/85 max-w-xl mx-auto">
                {t("landing.ctaSubtitle")}
              </p>
              <div className="mt-7">
                <Link to="/auth">
                  <Button size="lg" variant="secondary" className="bg-white text-primary hover:bg-white/90 shadow-md">
                    {t("landing.ctaButton")} <ArrowRight className="h-4 w-4" />
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
            © {new Date().getFullYear()} {t("landing.footer")}
          </div>
        </div>
      </footer>
    </div>
  );
}
