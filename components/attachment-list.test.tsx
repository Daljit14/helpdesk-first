import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { AttachmentList } from "./attachment-list";

vi.mock("@/app/actions/attachments", () => ({
  getAttachmentAccessUrl: vi.fn(),
}));

describe("AttachmentList", () => {
  test("renders controls from an attachment map", () => {
    const attachment = {
      id: "attachment-1",
      original_name: "screenshot.png",
      byte_size: 1024,
      status: "ready",
      detected_mime: "image/png",
      scan_verdict: "clean",
      created_at: "2025-01-01T00:00:00.000Z",
    };

    render(
      <AttachmentList
        attachments={[attachment]}
        adminControls={{
          [attachment.id]: <button type="button">Review attachment</button>,
        }}
      />
    );

    expect(
      screen.getByRole("button", { name: "Review attachment" })
    ).toBeInTheDocument();
  });
});
