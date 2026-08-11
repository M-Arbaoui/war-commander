import type { ReactNode } from "react";
import { Outlet, createRootRoute, HeadContent, Scripts, Link } from "@tanstack/react-router";
import appCss from "../styles/app.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "WARERA COMMAND" },
      {
        name: "description",
        content: "Tactical command center for WarEra — economy, market intelligence, and combat simulation.",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Big+Shoulders+Condensed:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap",
      },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <CommandBar />
      <Outlet />
    </RootDocument>
  );
}

function CommandBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-void/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-6 px-4">
        <Link to="/" className="flex items-baseline gap-2">
          <span className="font-display text-xl font-semibold tracking-wide text-ink">WARERA</span>
          <span className="font-display text-xl font-semibold tracking-wide text-accent">COMMAND</span>
        </Link>
        <nav className="flex items-center gap-1 font-body text-sm">
          <NavLink to="/">Dashboard</NavLink>
          <NavLink to="/advisor">Advisor</NavLink>
          <NavLink to="/market">Market</NavLink>
          <NavLink to="/builder">Builder</NavLink>
          <NavLink to="/companies">Companies</NavLink>
          <NavLink to="/regions">Regions</NavLink>
          <NavLink to="/upgrades">Upgrades</NavLink>
          <NavLink to="/combat">Combat</NavLink>
          <NavLink to="/combat/gear">Gear</NavLink>
        </nav>
        <div className="ml-auto">
          <ApiStatusPill />
        </div>
      </div>
    </header>
  );
}

function NavLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="rounded-sm px-3 py-1.5 text-ink-dim transition-colors hover:text-ink [&.active]:bg-panel-raised [&.active]:text-ink"
      activeProps={{ className: "active" }}
    >
      {children}
    </Link>
  );
}

function ApiStatusPill() {
  return (
    <div className="flex items-center gap-2 rounded-sm border border-line bg-panel px-2.5 py-1 font-mono text-xs text-ink-dim">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-positive opacity-60" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-positive" />
      </span>
      LIVE
    </div>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
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
