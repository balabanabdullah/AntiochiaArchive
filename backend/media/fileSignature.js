// Real file-signature (magic-byte) validation — Section 8 of the round
// brief explicitly requires this in addition to MIME/extension checks,
// since a client-supplied Content-Type or filename extension is trivially
// spoofable and must never be trusted alone for what gets written to disk
// and later served back to visitors.

const SIGNATURES = Object.freeze({
  jpg: (buf) => buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  png: (buf) => buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47,
  webp: (buf) => buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP",
  mp3: (buf) => buf.length >= 3 && (buf.toString("ascii", 0, 3) === "ID3" || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)),
  wav: (buf) => buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WAVE",
  m4a: (buf) => buf.length >= 8 && buf.toString("ascii", 4, 8) === "ftyp",
  ogg: (buf) => buf.length >= 4 && buf.toString("ascii", 0, 4) === "OggS",
  pdf: (buf) => buf.length >= 5 && buf.toString("ascii", 0, 5) === "%PDF-",
});

// extension (lowercase, no dot) -> { mediaType, signatureKey, mimeTypes: [accepted client-claimed values] }
export const ACCEPTED_UPLOAD_TYPES = Object.freeze({
  jpg: { mediaType: "image", signatureKey: "jpg", mimeTypes: ["image/jpeg"] },
  jpeg: { mediaType: "image", signatureKey: "jpg", mimeTypes: ["image/jpeg"] },
  png: { mediaType: "image", signatureKey: "png", mimeTypes: ["image/png"] },
  webp: { mediaType: "image", signatureKey: "webp", mimeTypes: ["image/webp"] },
  mp3: { mediaType: "audio", signatureKey: "mp3", mimeTypes: ["audio/mpeg", "audio/mp3"] },
  wav: { mediaType: "audio", signatureKey: "wav", mimeTypes: ["audio/wav", "audio/x-wav", "audio/wave"] },
  m4a: { mediaType: "audio", signatureKey: "m4a", mimeTypes: ["audio/mp4", "audio/x-m4a", "audio/m4a"] },
  ogg: { mediaType: "audio", signatureKey: "ogg", mimeTypes: ["audio/ogg", "application/ogg"] },
  pdf: { mediaType: "document", signatureKey: "pdf", mimeTypes: ["application/pdf"] },
});

export function extensionFromFilename(filename) {
  const match = /\.([a-zA-Z0-9]+)$/.exec(String(filename || ""));
  return match ? match[1].toLowerCase() : "";
}

/**
 * Validates that a claimed extension, a claimed MIME type, and the file's
 * actual leading bytes all agree with each other. Returns { valid, error,
 * mediaType } — never throws, so callers can turn a rejection into a clean
 * 400 rather than a 500.
 */
export function validateUploadedFile({ originalFilename, mimeType, buffer }) {
  const extension = extensionFromFilename(originalFilename);
  const spec = ACCEPTED_UPLOAD_TYPES[extension];
  if (!spec) {
    return { valid: false, error: `Desteklenmeyen dosya uzantısı: .${extension || "?"}. İzin verilenler: ${Object.keys(ACCEPTED_UPLOAD_TYPES).join(", ")}.` };
  }
  if (mimeType && !spec.mimeTypes.includes(mimeType)) {
    return { valid: false, error: `Dosya türü (${mimeType}) uzantıyla (.${extension}) uyuşmuyor.` };
  }
  const signatureCheck = SIGNATURES[spec.signatureKey];
  if (!signatureCheck(buffer)) {
    return { valid: false, error: `Dosya içeriği belirtilen türle (.${extension}) uyuşmuyor — dosya bozuk veya yeniden adlandırılmış olabilir.` };
  }
  return { valid: true, mediaType: spec.mediaType, extension };
}
