import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
function key() {
  const k = Buffer.from(process.env.PLAID_TOKEN_ENCRYPTION_KEY ?? "", "base64");
  if (k.length !== 32)
    throw new Error("Token encryption key must contain 32 bytes.");
  return k;
}
export function encryptToken(token: string, owner: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(owner));
  const text = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    text.toString("base64"),
  ].join(".");
}
export function decryptToken(encrypted: string, owner: string) {
  const [version, iv, tag, text] = encrypted.split(".");
  if (version !== "v1") throw new Error("Unsupported token version");
  const cipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(iv, "base64"),
  );
  cipher.setAAD(Buffer.from(owner));
  cipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    cipher.update(Buffer.from(text, "base64")),
    cipher.final(),
  ]).toString("utf8");
}
