import { describe, expect, test } from "vitest";
import { computeRowHash } from "./chain";
import { verifyExport } from "./export";

const table = "resolution_events" as const;

function exportLines() {
  const payload1 = {
    id: "row-1",
    organization_id: "org-1",
    chain_seq: 1,
    created_at: "2026-10-06T00:00:00.000000Z",
  };
  const hash1 = computeRowHash(null, payload1);
  const payload2 = {
    id: "row-2",
    organization_id: "org-1",
    chain_seq: 2,
    created_at: "2026-10-06T00:00:01.000000Z",
  };
  const hash2 = computeRowHash(hash1, payload2);
  const row1 = {
    type: "row",
    table,
    chain_seq: 1,
    id: "row-1",
    prev_hash: null,
    row_hash: hash1,
    payload: payload1,
  };
  const row2 = {
    type: "row",
    table,
    chain_seq: 2,
    id: "row-2",
    prev_hash: hash1,
    row_hash: hash2,
    payload: payload2,
  };
  const excluded = {
    type: "excluded",
    table,
    chain_seq: 2,
    id: "row-2",
    prev_hash: hash1,
    row_hash: hash2,
  };
  const summaries = ["agent_steps", "capability_autonomy_transitions"].map(
    (name) => ({
      type: "verify",
      table: name,
      from_seq: null,
      to_seq: null,
      head_hash: null,
      rows: 0,
      excluded: 0,
    })
  );
  return {
    row1,
    row2,
    excluded,
    summaries,
    valid: [
      row1,
      row2,
      {
        type: "verify",
        table,
        from_seq: 1,
        to_seq: 2,
        head_hash: hash2,
        rows: 2,
        excluded: 0,
      },
      ...summaries,
    ].map((value) => JSON.stringify(value)),
    excludedValid: [
      row1,
      excluded,
      {
        type: "verify",
        table,
        from_seq: 1,
        to_seq: 2,
        head_hash: hash2,
        rows: 1,
        excluded: 1,
      },
      ...summaries,
    ].map((value) => JSON.stringify(value)),
  };
}

describe("audit export verification", () => {
  test("verifies row payload hashes and excluded linkage without payload", () => {
    const fixture = exportLines();
    expect(verifyExport(fixture.valid)).toEqual({ ok: true, checked: 2 });
    expect(verifyExport(fixture.excludedValid)).toEqual({
      ok: true,
      checked: 2,
    });
    expect(fixture.excluded).not.toHaveProperty("payload");
  });

  test("reports modified payloads, broken links, and missing rows", () => {
    const fixture = exportLines();
    const modified = [...fixture.valid];
    modified[0] = JSON.stringify({
      ...fixture.row1,
      payload: { ...fixture.row1.payload, kind: "changed" },
    });
    expect(verifyExport(modified)).toMatchObject({
      ok: false,
      firstBreak: { id: "row-1", reason: "hash_mismatch" },
    });

    const brokenLink = [...fixture.valid];
    brokenLink[1] = JSON.stringify({
      ...fixture.row2,
      prev_hash: "incorrect",
      row_hash: computeRowHash("incorrect", fixture.row2.payload),
    });
    expect(verifyExport(brokenLink)).toMatchObject({
      ok: false,
      firstBreak: { id: "row-2", reason: "prev_mismatch" },
    });

    const missing = fixture.valid.slice();
    missing.splice(1, 1);
    expect(verifyExport(missing)).toMatchObject({
      ok: false,
      firstBreak: { id: "", reason: "verify_mismatch" },
    });

    const mismatchedIdentity = [...fixture.valid];
    mismatchedIdentity[0] = JSON.stringify({
      ...fixture.row1,
      id: "different-id",
    });
    expect(verifyExport(mismatchedIdentity)).toMatchObject({
      ok: false,
      firstBreak: { id: "different-id", reason: "payload_mismatch" },
    });
  });
});
