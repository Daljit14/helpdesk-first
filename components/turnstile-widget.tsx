"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback": () => void;
          "error-callback": () => void;
          theme: "auto";
        }
      ) => string;
    };
  }
}

export function TurnstileWidget({ siteKey }: { siteKey: string | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [token, setToken] = useState("");
  const renderedRef = useRef(false);

  const renderWidget = useCallback(() => {
    if (
      !siteKey ||
      !containerRef.current ||
      !window.turnstile ||
      renderedRef.current
    ) {
      return;
    }
    window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: setToken,
      "expired-callback": () => setToken(""),
      "error-callback": () => setToken(""),
      theme: "auto",
    });
    renderedRef.current = true;
  }, [siteKey]);

  useEffect(() => {
    renderWidget();
  }, [renderWidget]);

  if (!siteKey) return null;

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={renderWidget}
      />
      <div ref={containerRef} />
      <input type="hidden" name="captchaToken" value={token} />
    </>
  );
}
