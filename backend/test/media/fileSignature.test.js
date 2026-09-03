import test from "node:test";
import assert from "node:assert/strict";
import { validateUploadedFile, extensionFromFilename, ACCEPTED_UPLOAD_TYPES } from "../../media/fileSignature.js";

const REAL_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const REAL_PDF = Buffer.from("%PDF-1.4\n%fake but correct header");
const REAL_MP3_ID3 = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(20)]);
const REAL_WAV = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVE")]);

test("extensionFromFilename lowercases and strips the leading dot", () => {
  assert.equal(extensionFromFilename("Photo.JPG"), "jpg");
  assert.equal(extensionFromFilename("no-extension"), "");
  assert.equal(extensionFromFilename("archive.tar.gz"), "gz");
});

test("a real PNG passes with the correct extension and MIME type", () => {
  const result = validateUploadedFile({ originalFilename: "photo.png", mimeType: "image/png", buffer: REAL_PNG });
  assert.equal(result.valid, true);
  assert.equal(result.mediaType, "image");
});

test("a text file renamed to .png is rejected by signature check, not just extension", () => {
  const result = validateUploadedFile({ originalFilename: "fake.png", mimeType: "image/png", buffer: Buffer.from("just some text") });
  assert.equal(result.valid, false);
  assert.match(result.error, /uyuşmuyor/);
});

test("a claimed MIME type that disagrees with the extension is rejected", () => {
  const result = validateUploadedFile({ originalFilename: "photo.png", mimeType: "application/pdf", buffer: REAL_PNG });
  assert.equal(result.valid, false);
});

test("an unsupported extension (.exe) is rejected outright, before any signature check", () => {
  const result = validateUploadedFile({ originalFilename: "malware.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ") });
  assert.equal(result.valid, false);
  assert.match(result.error, /uzantı/);
});

test("a real PDF, MP3 (ID3), and WAV each pass validation with the expected mediaType", () => {
  assert.equal(validateUploadedFile({ originalFilename: "doc.pdf", mimeType: "application/pdf", buffer: REAL_PDF }).mediaType, "document");
  assert.equal(validateUploadedFile({ originalFilename: "song.mp3", mimeType: "audio/mpeg", buffer: REAL_MP3_ID3 }).mediaType, "audio");
  assert.equal(validateUploadedFile({ originalFilename: "song.wav", mimeType: "audio/wav", buffer: REAL_WAV }).mediaType, "audio");
});

test("every accepted extension maps to exactly one of image/audio/document — no silent 'video' or unexpected category", () => {
  for (const spec of Object.values(ACCEPTED_UPLOAD_TYPES)) {
    assert.ok(["image", "audio", "document"].includes(spec.mediaType));
  }
});
