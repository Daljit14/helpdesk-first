"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <div style={{ padding: "3rem", textAlign: "center" }}>
          <h1>Something went wrong</h1>
          <p>The error has been reported. Try reloading the page.</p>
        </div>
      </body>
    </html>
  );
}
