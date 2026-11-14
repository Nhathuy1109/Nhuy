// Server-only. The old page put this hash in the browser; it must never ship to the client again.
const OWNER_HASH = "7290a160da18ece6e8c9b61d33b7f725e1087f9473eda624fe0a416b9e148c67";

export async function legacyOwnerPasswordMatches(password: string): Promise<boolean> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`tv|${password}`),
  );
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  if (hex.length !== OWNER_HASH.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i += 1) diff |= hex.charCodeAt(i) ^ OWNER_HASH.charCodeAt(i);
  return diff === 0;
}
