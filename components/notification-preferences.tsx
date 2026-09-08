"use client";

import { useState, useTransition } from "react";
import { updateNotificationPreferences } from "@/app/actions/preferences";

export function NotificationPreferencesCard({
  userId,
  emailEnabled,
  pushEnabled,
}: {
  userId: string;
  emailEnabled: boolean;
  pushEnabled: boolean;
}) {
  const [email, setEmail] = useState(emailEnabled);
  const [push, setPush] = useState(pushEnabled);
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);

  function save(next: { email?: boolean; push?: boolean }) {
    startTransition(async () => {
      const result = await updateNotificationPreferences(userId, {
        emailEnabled: next.email ?? email,
        pushEnabled: next.push ?? push,
      });
      if ("error" in result) setNotice(result.error ?? null);
      else setNotice("Preferences saved.");
    });
  }

  return (
    <section className="glass-strong grid gap-3 p-5">
      <h2 className="text-xl font-semibold">Notification preferences</h2>
      {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={email}
          disabled={pending}
          onChange={(e) => {
            setEmail(e.target.checked);
            save({ email: e.target.checked });
          }}
        />
        Send me email notifications
      </label>
      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={push}
          disabled={pending}
          onChange={(e) => {
            setPush(e.target.checked);
            save({ push: e.target.checked });
          }}
        />
        Send me push notifications
      </label>
    </section>
  );
}
