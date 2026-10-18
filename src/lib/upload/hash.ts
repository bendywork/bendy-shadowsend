/**
 * SHA-256 helpers shared by the chunk upload and merge download paths.
 *
 * Kept free of Node-only imports so the same normalisation rules can be used
 * by attachment manifest validation (which is also imported from tests that
 * run in a browser-like environment).
 */

export const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/i;

export function normalizeSha256(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return SHA256_HEX_PATTERN.test(normalized) ? normalized : null;
}

export function hasCompleteChunkHashes(
  chunks: ReadonlyArray<{ sha256?: string }>,
): boolean {
  return (
    chunks.length > 0 &&
    chunks.every(
      (chunk) => typeof chunk.sha256 === "string" && SHA256_HEX_PATTERN.test(chunk.sha256),
    )
  );
}

export function manifestIntegrity(
  chunks: ReadonlyArray<{ sha256?: string }>,
): "sha256" | "none" {
  return hasCompleteChunkHashes(chunks) ? "sha256" : "none";
}
