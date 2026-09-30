import type { Metadata } from "next";
import { Toolkit } from "@/components/tools/toolkit";

export const metadata: Metadata = {
  title: "Toolkit",
  description:
    "Quick self-checks for your device and connection — camera, microphone, speakers, keyboard, display, storage and more. Nothing leaves your browser.",
};

export default function ToolsPage() {
  return (
    <section className="flex flex-1 flex-col px-4 py-8 sm:px-6 lg:px-10">
      <Toolkit />
    </section>
  );
}
