"use client";

import { useEffect, useState } from "react";
import { Paperclip } from "lucide-react";
import { getTicketAttachmentUrl } from "@/lib/supabase/storage";

export function AttachmentLink({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getTicketAttachmentUrl(path).then((signedUrl) => {
      if (active) setUrl(signedUrl);
    });
    return () => {
      active = false;
    };
  }, [path]);

  if (!url) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1 inline-flex items-center gap-1 text-sm underline underline-offset-4"
    >
      <Paperclip className="h-3.5 w-3.5" />
      View attachment
    </a>
  );
}
