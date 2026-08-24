import test from "node:test";
import assert from "node:assert/strict";

await import("../public/js/music.js");

const {
  SUPPORTED_AUDIO_MIME_TYPES, isSafeAudioSrc, isPlayablePublicAudio, resolvePlayableAudio, musicIdsWithPlayableAudio,
} = globalThis.AntiochiaArchiveMusic;

function media(id, overrides = {}) {
  return {
    id,
    entityType: "media",
    mediaType: "audio",
    rightsStatus: "cleared",
    mimeType: "audio/mpeg",
    derivativeStoragePaths: ["/media/music/example.mp3"],
    ...overrides,
  };
}

function music(id, audioMediaIds) {
  return { id, entityType: "music", slug: id, audioMediaIds };
}

test("isSafeAudioSrc accepts a same-origin absolute path or an https URL only", () => {
  assert.equal(isSafeAudioSrc("/media/music/a.mp3"), true);
  assert.equal(isSafeAudioSrc("https://example.org/a.mp3"), true);
  assert.equal(isSafeAudioSrc("//evil.example/a.mp3"), false);
  assert.equal(isSafeAudioSrc("http://example.org/a.mp3"), false);
  assert.equal(isSafeAudioSrc("javascript:alert(1)"), false);
  assert.equal(isSafeAudioSrc("data:audio/mpeg;base64,AAAA"), false);
  assert.equal(isSafeAudioSrc("../../etc/passwd"), false);
  assert.equal(isSafeAudioSrc(""), false);
  assert.equal(isSafeAudioSrc(null), false);
  assert.equal(isSafeAudioSrc(undefined), false);
});

test("isPlayablePublicAudio: a fully cleared, supported-format audio media entity is playable", () => {
  assert.equal(isPlayablePublicAudio(media("media-0001")), true);
});

test("isPlayablePublicAudio: rightsStatus must be exactly 'cleared' — unknown/pendingReview/restricted/doNotPublish are all hidden", () => {
  for (const rightsStatus of ["unknown", "pendingReview", "restricted", "doNotPublish", undefined, null]) {
    assert.equal(isPlayablePublicAudio(media("media-0001", { rightsStatus })), false, `rightsStatus=${rightsStatus} must not be playable`);
  }
});

test("isPlayablePublicAudio: mediaType must be 'audio' — an image/video/document media entity is never treated as playable", () => {
  for (const mediaType of ["image", "video", "document"]) {
    assert.equal(isPlayablePublicAudio(media("media-0001", { mediaType })), false);
  }
});

test("isPlayablePublicAudio: unsupported MIME types are rejected even when rights are cleared", () => {
  assert.equal(isPlayablePublicAudio(media("media-0001", { mimeType: "audio/webm" })), false);
  assert.equal(isPlayablePublicAudio(media("media-0001", { mimeType: "application/octet-stream" })), false);
  for (const mimeType of SUPPORTED_AUDIO_MIME_TYPES) {
    assert.equal(isPlayablePublicAudio(media("media-0001", { mimeType })), true, `${mimeType} should be supported`);
  }
});

test("isPlayablePublicAudio: a missing/empty derivativeStoragePaths (nothing actually to play) is never playable", () => {
  assert.equal(isPlayablePublicAudio(media("media-0001", { derivativeStoragePaths: [] })), false);
  assert.equal(isPlayablePublicAudio(media("media-0001", { derivativeStoragePaths: undefined })), false);
});

test("isPlayablePublicAudio: never throws on missing/malformed input", () => {
  assert.equal(isPlayablePublicAudio(null), false);
  assert.equal(isPlayablePublicAudio(undefined), false);
  assert.equal(isPlayablePublicAudio({}), false);
  assert.equal(isPlayablePublicAudio({ entityType: "place" }), false);
});

test("resolvePlayableAudio: a music entity with no audioMediaIds resolves to [] — normal 'no audio' state, not an error", () => {
  assert.deepEqual(resolvePlayableAudio(music("music-0001", undefined), []), []);
  assert.deepEqual(resolvePlayableAudio(music("music-0001", []), [media("media-0001")]), []);
});

test("resolvePlayableAudio: resolves audioMediaIds to the matching media entities, filtering out non-playable ones", () => {
  const entities = [
    media("media-0001"),
    media("media-0002", { rightsStatus: "unknown" }),
  ];
  assert.deepEqual(
    resolvePlayableAudio(music("music-0001", ["media-0001", "media-0002"]), entities).map((m) => m.id),
    ["media-0001"],
  );
});

test("resolvePlayableAudio: a music entity + restricted audio -> metadata stays visible to the caller, but zero playable assets are returned (the render-time gate)", () => {
  const entities = [media("media-0001", { rightsStatus: "restricted" })];
  assert.deepEqual(resolvePlayableAudio(music("music-0001", ["media-0001"]), entities), []);
});

test("resolvePlayableAudio: an audioMediaIds entry with no matching media entity in the archive is silently skipped, never a crash", () => {
  assert.deepEqual(resolvePlayableAudio(music("music-0001", ["media-does-not-exist"]), []), []);
});

test("musicIdsWithPlayableAudio: builds the badge-eligible id set from a mixed list", () => {
  const musicEntities = [
    music("music-0001", ["media-0001"]),
    music("music-0002", ["media-0002"]), // unknown rights, not eligible
    music("music-0003", []),
  ];
  const allEntities = [media("media-0001"), media("media-0002", { rightsStatus: "unknown" })];
  const eligible = musicIdsWithPlayableAudio(musicEntities, allEntities);
  assert.deepEqual([...eligible], ["music-0001"]);
});
