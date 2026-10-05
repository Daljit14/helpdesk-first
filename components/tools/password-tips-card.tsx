import {
  KeyRound,
  Lock,
  ShieldCheck,
  Smartphone,
  Mail,
  Check,
} from "lucide-react";

const TIPS = [
  {
    icon: Lock,
    title: "Use a password manager",
    body: "Let it create and remember a different long password for every account.",
  },
  {
    icon: Smartphone,
    title: "Turn on two-step sign-in",
    body: "An app or text code stops most account takeovers, even if a password leaks.",
  },
  {
    icon: Mail,
    title: "Reset only from the real site",
    body: "Type the address yourself — never follow a “reset your password” link you didn't ask for.",
  },
  {
    icon: ShieldCheck,
    title: "Never share codes",
    body: "Real support staff will never ask for your password or a sign-in code.",
  },
];

/** Static safety tips — deliberately has no password input of any kind. */
export function PasswordTipsCard() {
  return (
    <section
      aria-labelledby="password-tips-tool-heading"
      className="hf-tool-card relative overflow-hidden rounded-[24px] bg-[radial-gradient(120%_120%_at_0%_0%,#2d1f63_0%,#16112a_55%,#0d0a1c_100%)] p-5 text-white shadow-[var(--shadow-md)] sm:p-6"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-20 -right-16 h-56 w-56 rounded-full bg-[#d946ef]/20 blur-3xl"
      />
      <h3
        id="password-tips-tool-heading"
        className="relative flex items-center gap-2.5 text-lg font-extrabold"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10">
          <KeyRound className="h-5 w-5 text-[#c9b8ff]" aria-hidden />
        </span>
        Password safety
      </h3>
      <p className="relative mt-2 max-w-xl text-sm text-white/70">
        Four habits that keep accounts safe. Never type a password into a
        checker website — including this one.
      </p>
      <ul className="relative mt-5 grid gap-2.5 sm:grid-cols-2">
        {TIPS.map(({ icon: Icon, title, body }, i) => (
          <li
            key={title}
            className="hf-pop flex gap-3 rounded-2xl border border-white/10 bg-white/5 p-3.5"
            style={{ animationDelay: `${i * 0.08}s` }}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#7c5cff,#d946ef)]">
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <span>
              <span className="flex items-center gap-1.5 text-sm font-extrabold">
                {title}
                <Check className="h-3.5 w-3.5 text-[#5ee0a8]" aria-hidden />
              </span>
              <span className="mt-0.5 block text-sm text-white/70">{body}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
