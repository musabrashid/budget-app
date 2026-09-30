import { describe, it, expect } from "vitest";
import { collectSync, providerErrorCode } from "@/lib/plaid/paging";
import { encryptToken, decryptToken } from "@/lib/plaid/crypto";
import { randomBytes } from "node:crypto";
describe("incremental sync", () => {
  it("deduplicates modified Plaid ids and removes deleted records", async () => {
    let page = 0;
    const result = await collectSync(null, async () => {
      page++;
      return page === 1
        ? {
            added: [
              { transaction_id: "a", amount: 10 },
              { transaction_id: "b", amount: 2 },
            ],
            modified: [],
            removed: [],
            has_more: true,
            next_cursor: "one",
          }
        : {
            added: [],
            modified: [{ transaction_id: "a", amount: 12 }],
            removed: [{ transaction_id: "b" }],
            has_more: false,
            next_cursor: "two",
          };
    });
    expect(result.changed).toEqual([{ transaction_id: "a", amount: 12 }]);
    expect(result.removed).toEqual(["b"]);
    expect(result.cursor).toBe("two");
  });
  it("restarts from the original cursor after pagination mutation", async () => {
    const cursors: (string | undefined)[] = [];
    let calls = 0;
    const result = await collectSync("original", async (cursor) => {
      cursors.push(cursor);
      calls++;
      if (calls === 2)
        throw {
          response: {
            data: {
              error_code: "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION",
            },
          },
        };
      return {
        added: [{ transaction_id: calls === 1 ? "discard" : "posted" }],
        modified: [],
        removed: [],
        has_more: calls === 1,
        next_cursor: "next",
      };
    });
    expect(cursors).toEqual(["original", "next", "original"]);
    expect(result.changed).toEqual([{ transaction_id: "posted" }]);
  });
  it("does not checkpoint partial failed pages", async () => {
    await expect(
      collectSync(null, async () => {
        throw new Error("upstream unavailable");
      }),
    ).rejects.toThrow("upstream unavailable");
  });
  it("bounds sync duration to keep Vercel calls recoverable", async () => {
    await expect(
      collectSync(
        null,
        async () => ({
          added: [],
          modified: [],
          removed: [],
          has_more: false,
          next_cursor: "x",
        }),
        Date.now() - 1,
      ),
    ).rejects.toThrow("time limit");
  });
});
describe("token encryption", () => {
  it("encrypts at rest, binds tokens to owner, and rejects tampering", () => {
    process.env.PLAID_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    const ciphertext = encryptToken("access-sandbox-secret", "owner");
    expect(ciphertext).not.toContain("access-sandbox-secret");
    expect(decryptToken(ciphertext, "owner")).toBe("access-sandbox-secret");
    expect(() => decryptToken(ciphertext, "other")).toThrow();
    const parts = ciphertext.split(".");
    const b = Buffer.from(parts[3], "base64");
    b[0] ^= 1;
    parts[3] = b.toString("base64");
    expect(() => decryptToken(parts.join("."), "owner")).toThrow();
  });
});

describe("safe diagnostics", () => {
  it("retains provider codes without exposing request secrets", () => {
    expect(
      providerErrorCode({
        response: {
          data: {
            error_code: "ITEM_LOGIN_REQUIRED",
            access_token: "private-token",
          },
        },
      }),
    ).toBe("ITEM_LOGIN_REQUIRED");
    expect(
      providerErrorCode({
        response: { data: { error_code: "access-sandbox-private-token" } },
      }),
    ).toBeNull();
    expect(providerErrorCode(null)).toBeNull();
  });
});
