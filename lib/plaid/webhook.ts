import "server-only";
import { decodeProtectedHeader, importJWK, jwtVerify } from "jose";
import { createHash, timingSafeEqual } from "node:crypto";
import { plaidClient } from "./client";
export async function verifyWebhook(raw: string, jwt: string) {
  const header = decodeProtectedHeader(jwt);
  if (header.alg !== "ES256" || !header.kid)
    throw new Error("Invalid webhook signature.");
  const { data } = await plaidClient().webhookVerificationKeyGet({
    key_id: header.kid,
  });
  if (data.key.expired_at) throw new Error("Expired webhook key.");
  const key = await importJWK({ ...data.key, alg: "ES256" }, "ES256");
  const { payload } = await jwtVerify(jwt, key, {
    algorithms: ["ES256"],
    maxTokenAge: "5 minutes",
    clockTolerance: 5,
  });
  if (typeof payload.iat !== "number" || payload.iat > Date.now() / 1000 + 5)
    throw new Error("Invalid webhook timestamp.");
  const expected = Buffer.from(
    String(payload.request_body_sha256 ?? ""),
    "hex",
  );
  const actual = createHash("sha256").update(raw, "utf8").digest();
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
    throw new Error("Webhook body mismatch.");
}
