import { test, expect } from "vitest";
import { categories, platforms } from "./helpdesk-data";

test("categories includes all support categories", () => {
  expect(categories).toHaveLength(13);
  expect(categories.map((c) => c.label)).toEqual([
    "Computer",
    "Internet & Wi-Fi",
    "Printer",
    "Email",
    "Software",
    "Audio & camera",
    "Accounts & security",
    "Files & storage",
    "Video conferencing",
    "Mobile devices",
    "Peripherals & hardware",
    "Collaboration tools",
    "Security & malware",
  ]);
});

test("platforms includes Windows, Mac, Mobile and Other", () => {
  expect(platforms).toEqual(["Windows", "Mac", "Mobile", "Other"]);
});
