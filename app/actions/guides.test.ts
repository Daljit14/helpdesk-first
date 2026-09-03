import { afterEach, describe, expect, test, vi } from "vitest";
import { submitTicket } from "./guides";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  createClient: vi.fn(),
  insert: vi.fn(),
}));
const { getCurrentUser, createClient, insert } = mocks;

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/user", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

afterEach(() => {
  vi.unstubAllEnvs();
  getCurrentUser.mockReset();
  createClient.mockReset();
  insert.mockReset();
});

function formData(attachmentPath: string) {
  const form = new FormData();
  form.set("issueId", "no-internet");
  form.set("message", "The connection still does not work.");
  form.set("attachmentPath", attachmentPath);
  return form;
}

describe("submitTicket attachment paths", () => {
  test.each([
    "another-user/attachment.png",
    "user-1/../another-user/attachment.png",
  ])("does not persist unsafe path %s", async (attachmentPath) => {
    getCurrentUser.mockResolvedValue({ id: "user-1" });
    insert.mockResolvedValue({ error: null });
    createClient.mockResolvedValue({
      from: vi.fn(() => ({ insert })),
    });

    await submitTicket(null, formData(attachmentPath));

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ attachment_path: null })
    );
  });

  test("persists a path under the authenticated user's folder", async () => {
    getCurrentUser.mockResolvedValue({ id: "user-1" });
    insert.mockResolvedValue({ error: null });
    createClient.mockResolvedValue({
      from: vi.fn(() => ({ insert })),
    });

    await submitTicket(null, formData("user-1/attachment.png"));

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ attachment_path: "user-1/attachment.png" })
    );
  });
});
