import path from "node:path";

export const UPLOAD_PUBLIC_PREFIX = "/uploads/";

export function getUploadDir() {
  return (
    process.env.UPLOAD_DIR ??
    path.join(/* turbopackIgnore: true */ "/var/www", "uploads")
  );
}

function stripUploadUrlNoise(value: string) {
  let normalized = value.trim();

  try {
    const parsed = new URL(normalized, "https://fwqgo.local");
    normalized = parsed.pathname;
  } catch {
    normalized = normalized.split("#")[0]?.split("?")[0] ?? normalized;
  }

  return normalized.replace(/[),.;，。]+$/g, "");
}

export function normalizeUploadPath(value: string) {
  const cleaned = stripUploadUrlNoise(value);

  if (!cleaned.startsWith(UPLOAD_PUBLIC_PREFIX)) {
    throw new Error("Invalid upload path");
  }

  let decoded = cleaned;
  try {
    decoded = decodeURIComponent(cleaned);
  } catch {
    decoded = cleaned;
  }

  const decodedFileName = path.basename(decoded);
  if (!decodedFileName || decodedFileName === "." || decodedFileName === "..") {
    throw new Error("Invalid upload path");
  }

  return `${UPLOAD_PUBLIC_PREFIX}${path.basename(cleaned)}`;
}

export function toUploadPath(value: string | null | undefined) {
  if (!value) return null;

  const decodedCandidates = new Set<string>([value]);
  try {
    decodedCandidates.add(decodeURIComponent(value));
  } catch {
    // Keep the raw candidate when decoding fails.
  }

  for (const candidate of decodedCandidates) {
    const cleaned = stripUploadUrlNoise(candidate);
    const uploadIndex = cleaned.indexOf(UPLOAD_PUBLIC_PREFIX);
    if (uploadIndex === -1) continue;

    try {
      return normalizeUploadPath(cleaned.slice(uploadIndex));
    } catch {
      continue;
    }
  }

  return null;
}

export function uploadPathToFilePath(publicPath: string) {
  const normalized = normalizeUploadPath(publicPath);
  return path.join(
    /* turbopackIgnore: true */ getUploadDir(),
    path.basename(normalized),
  );
}
