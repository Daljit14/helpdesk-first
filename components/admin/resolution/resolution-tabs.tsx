import Link from "next/link";
import { Eye, FlaskConical, ListChecks, ShieldCheck } from "lucide-react";

const TABS = [
  { key: "runs", label: "Runs", href: "/admin/resolution", icon: ListChecks },
  {
    key: "guardrails",
    label: "Guardrails",
    href: "/admin/resolution/guardrails",
    icon: ShieldCheck,
  },
  {
    key: "shadow",
    label: "Shadow review",
    href: "/admin/resolution/shadow",
    icon: Eye,
  },
  {
    key: "pilot",
    label: "Pilot",
    href: "/admin/resolution/pilot",
    icon: FlaskConical,
  },
] as const;

export type ResolutionTab = (typeof TABS)[number]["key"];

/** Pill tab bar linking the AI Resolution Center sub-pages. */
export function ResolutionTabs({ active }: { active?: ResolutionTab }) {
  return (
    <nav
      aria-label="AI Resolution Center sections"
      className="glass hf-rise flex flex-wrap gap-1.5 p-1.5"
      style={{ animationDelay: "0.05s" }}
    >
      {TABS.map((tab) => {
        const current = tab.key === active;
        const Icon = tab.icon;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={current ? "page" : undefined}
            className={`v2-touch inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-extrabold transition-all ${
              current
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
