import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTx } from "@/hooks/use-tx";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, useMemo, type ReactNode } from "react";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { I18nextProvider } from "react-i18next";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import i18n, { LANG_COOKIE, normalizeLang, type AppLang } from "@/i18n";

/** Language for this render: the cookie on the server, the live i18n language in the browser. */
const readLang = createIsomorphicFn()
  .server((): AppLang => normalizeLang(getCookie(LANG_COOKIE)))
  .client((): AppLang => normalizeLang(i18n.resolvedLanguage ?? i18n.language));

function NotFoundComponent() {
  const { tx } = useTx();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">{tx("Page not found", "Page introuvable")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {tx("The page you're looking for doesn't exist or has been moved.", "La page demandée n'existe pas ou a été déplacée.")}
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {tx("Go home", "Accueil")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  const { tx } = useTx();
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {tx("This page didn't load", "Cette page n'a pas pu se charger")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {tx("Something went wrong on our end. You can try refreshing or head back home.", "Une erreur s'est produite de notre côté. Réessayez ou revenez à l'accueil.")}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {tx("Try again", "Réessayer")}
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            {tx("Go home", "Accueil")}
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "RoadSource — IT Sourcing & Talent CRM" },
      { name: "description", content: "RoadSource is IT Road's internal CRM for client demands, sourcing, and candidate placement tracking." },
      { name: "author", content: "IT Road" },
      { property: "og:title", content: "RoadSource — IT Sourcing & Talent CRM" },
      { property: "og:description", content: "RoadSource is IT Road's internal CRM for client demands, sourcing, and candidate placement tracking." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://road-source.lovable.app/" },
      { property: "og:site_name", content: "RoadSource" },
      { property: "og:image", content: "https://road-source.lovable.app/og-image.png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "RoadSource — From demand to placement" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "RoadSource — IT Sourcing & Talent CRM" },
      { name: "twitter:description", content: "RoadSource is IT Road's internal CRM for client demands, sourcing, and candidate placement tracking." },
      { name: "twitter:image", content: "https://road-source.lovable.app/og-image.png" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  beforeLoad: () => ({ lang: readLang() }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  const { lang } = Route.useRouteContext();
  return (
    <html lang={lang}>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient, lang } = Route.useRouteContext();
  const router = useRouter();
  // Server: a per-request copy in the cookie's language, so concurrent requests never share one.
  // Browser: the shared instance (the detector already read the same cookie).
  const i18nForRender = useMemo(() => {
    if (typeof window !== "undefined") return i18n;
    // Best effort for module-level txNow() label getters, which read the shared instance.
    if (normalizeLang(i18n.language) !== lang) void i18n.changeLanguage(lang);
    return i18n.cloneInstance({ lng: lang, initAsync: false });
  }, [lang]);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    import("@/integrations/supabase/client").then(({ supabase }) => {
      const { data: sub } = supabase.auth.onAuthStateChange((event) => {
        if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
        router.invalidate();
        if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
      });
      unsub = () => sub.subscription.unsubscribe();
    });
    return () => unsub?.();
  }, [queryClient, router]);

  return (
    <I18nextProvider i18n={i18nForRender}>
      <QueryClientProvider client={queryClient}>
        {/* Required: nested routes render here. */}
        <Outlet />
        <Toaster richColors position="top-right" />
      </QueryClientProvider>
    </I18nextProvider>
  );
}
