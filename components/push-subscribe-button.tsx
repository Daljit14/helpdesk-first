"use client";

import { useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { subscribeToPush, unsubscribeFromPush } from "@/lib/push/client";

export function PushSubscribeButton() {
  const [subscribed, setSubscribed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enable() {
    setPending(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError("Notifications were not allowed.");
        return;
      }
      const subscription = await subscribeToPush();
      if (!subscription) {
        setError("Push notifications aren't supported in this browser.");
        return;
      }
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!res.ok) {
        setError("Could not save your subscription.");
        return;
      }
      setSubscribed(true);
    } finally {
      setPending(false);
    }
  }

  async function disable() {
    setPending(true);
    try {
      const endpoint = await unsubscribeFromPush();
      if (endpoint) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
        });
      }
      setSubscribed(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={subscribed ? disable : enable}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : subscribed ? (
          <BellOff className="h-4 w-4" />
        ) : (
          <Bell className="h-4 w-4" />
        )}
        {subscribed
          ? "Turn off ticket alerts"
          : "Get notified on ticket updates"}
      </Button>
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  );
}
