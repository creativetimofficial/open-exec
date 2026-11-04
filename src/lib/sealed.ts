import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

/**
 * AES-256-GCM for Google tokens at rest. Format: "v1.<iv>.<tag>.<ciphertext>",
 * each part base64url. A wrong key or a tampered value fails to open.
 */

export function seal(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  return ["v1", iv, cipher.getAuthTag(), ciphertext].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".")
}

export function unseal(sealed: string, key: Buffer): string {
  const [version, iv, tag, ciphertext] = sealed.split(".")
  if (version !== "v1" || !iv || !tag || ciphertext === undefined) throw new Error("Unrecognised sealed value.")
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"))
  decipher.setAuthTag(Buffer.from(tag, "base64url"))
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8")
}
