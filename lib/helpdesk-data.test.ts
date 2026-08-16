import { test, expect } from "vitest";
import { categories, platforms } from "./helpdesk-data";

test("categories includes the six required support categories", () => {
  expect(categories).toHaveLength(6);
  expect(categories.map((c) => c.label)).toEqual([
    "Computer",
    "Internet and Wi-Fi",
    "Printer",
    "Email",
    "Software",
    "Audio and Camera",
  ]);
});

test("platforms includes Windows, Mac, Mobile and Other", () => {
  expect(platforms).toEqual(["Windows", "Mac", "Mobile", "Other"]);
});
