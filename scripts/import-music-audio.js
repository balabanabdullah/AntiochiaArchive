#!/usr/bin/env node
// Deterministic, human-in-the-loop ingestion of one audio file for one
// existing `music` entity. See MUSIC ARCHIVE round report for the full
// design rationale; the short version:
//
//   IMPORT (this script) -> VALIDATE (this script, fail-closed) ->
//   STAGED (a `media` entity is written either way) ->
//   HUMAN APPROVAL (a person asserts --rights cleared, having actually
//   checked) -> PUBLIC (only then is the file copied into public/media/ and
//   only then does the frontend's rights gate — public/js/music.js's
//   isPlayablePublicAudio() — ever render it as a player).
//
// This script never invents cultural metadata and never marks anything
// "cleared" on its own initiative — --rights is always required, and
// anything other than an explicit `cleared` value stages the media record
// (for provenance/tracking) WITHOUT copying the file into public/media/ and
// WITHOUT attaching it to the music entity's audioMediaIds — because
// `media` entities have no publication-status gate of their own (see
// backend/v2/serializers/publicVisibility.js: media is always "public" once
// it exists), the only thing that keeps an unresolved-rights file out of
// public reach is never placing it under the public static directory and
// never wiring it up in the first place. Re-run with --rights cleared once
// a human has actually cleared the file to promote it.
//
// Usage:
//   node scripts/import-music-audio.js \
//     --music-id music-0001 \
//     --file /path/to/recording.mp3 \
//     --rights cleared \
//     [--credit "Recorded by ..."] [--license "CC BY-SA 4.0"] \
//     [--rights-note "..."] [--duration 163] [--data-dir data/v2]
//
// `--data-dir` (default "data/v2") lets tests/dry-runs point this at a
// scratch copy instead of the real repository data — this script never
// hardcodes the real data/v2/entities.json path internally.

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { validateEntity } from "../backend/v2/schemas/index.js";
import { RIGHTS_STATUS } from "../backend/v2/constants/vocabularies.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

export const MAX_AUDIO_FILE_BYTES = 25 * 1024 * 1024; // 25MB — a generous ceiling for a single spoken/sung track, not a media library.

export const SUPPORTED_AUDIO_EXTENSIONS = Object.freeze({
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
});

/** Strips path separators/traversal and anything not a safe filename character; the extension is preserved and re-validated separately by the caller. */
export function sanitizeFilename(originalName) {
  const base = path.basename(String(originalName || ""));
  const ext = path.extname(base);
  const stem = base.slice(0, base.length - ext.length)
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${stem || "track"}${ext.toLowerCase()}`;
}

/** Pure validation of the source file's basic safety properties — no filesystem access beyond what the caller already did (existence/size/checksum are passed in). */
export function validateAudioFileMeta({ extension, size, rights }) {
  const errors = [];
  const mimeType = SUPPORTED_AUDIO_EXTENSIONS[extension?.toLowerCase()];
  if (!mimeType) {
    errors.push(`Unsupported audio extension '${extension}'. Supported: ${Object.keys(SUPPORTED_AUDIO_EXTENSIONS).join(", ")}.`);
  }
  if (typeof size !== "number" || size <= 0) {
    errors.push("File is empty or its size could not be determined.");
  } else if (size > MAX_AUDIO_FILE_BYTES) {
    errors.push(`File is ${(size / 1024 / 1024).toFixed(1)}MB, over the ${MAX_AUDIO_FILE_BYTES / 1024 / 1024}MB limit.`);
  }
  if (!rights || !RIGHTS_STATUS.includes(rights)) {
    errors.push(`--rights is required and must be one of: ${RIGHTS_STATUS.join(", ")}.`);
  }
  return { valid: errors.length === 0, errors, mimeType };
}

/** SHA-256 of a file's bytes — used for duplicate detection against media entities already on record. */
export function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

/** Next sequential media-XXXX id given the ids already present in the archive. */
export function nextMediaId(existingEntities) {
  let max = 0;
  for (const entity of existingEntities) {
    if (entity.entityType !== "media") continue;
    const match = /^media-(\d+)$/.exec(entity.id || "");
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `media-${String(max + 1).padStart(4, "0")}`;
}

/** Finds a media entity already on record with the same checksum (stored in `checksum`, per backend/v2/schemas/media.js). */
export function findDuplicateByChecksum(existingEntities, checksum) {
  return existingEntities.find((e) => e.entityType === "media" && e.checksum === checksum) || null;
}

/**
 * Builds the media entity object for this import — pure, no I/O. `isCleared`
 * decides whether derivativeStoragePaths points at a real public path (only
 * when rights are cleared) or stays empty (staged, not publicly reachable —
 * see file header).
 */
export function buildMediaEntity({
  id, safeFilename, mimeType, size, checksum, rights, credit, license, rightsNote, duration, isCleared,
}) {
  const entity = {
    id,
    entityType: "media",
    mediaType: "audio",
    mediaRole: "realArchiveMedia",
    derivativeStoragePaths: isCleared ? [`/media/music/${safeFilename}`] : [],
    mimeType,
    size,
    checksum,
    rightsStatus: rights,
    aiGenerated: false,
    createdAt: new Date().toISOString(),
  };
  if (typeof duration === "number" && duration > 0) entity.duration = duration;
  if (credit) entity.source = credit;
  if (license) entity.license = license;
  if (rightsNote) entity.rightsNote = rightsNote;
  return entity;
}

/** Textual, whitespace-preserving append of one entity object to the end of an entities.json `entities` array. Never re-serializes the rest of the file — see file header of tmp/publish-new-toponyms.mjs (this session's earlier established pattern) for why. */
export function appendEntityToEntitiesFile(filePath, entityObject) {
  const raw = fs.readFileSync(filePath, "utf-8");
  const lines = raw.split("\n");
  let closeArrayIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() === "]") { closeArrayIdx = i; break; }
  }
  if (closeArrayIdx === -1) throw new Error(`Could not find the entities array's closing bracket in ${filePath}.`);
  const prevIdx = closeArrayIdx - 1;
  if (lines[prevIdx].trim() === "}") lines[prevIdx] = `${lines[prevIdx]},`;

  const body = JSON.stringify(entityObject, null, 2).split("\n").map((line) => `    ${line}`).join("\n");
  lines.splice(closeArrayIdx, 0, body);
  fs.writeFileSync(filePath, lines.join("\n"));
}

/**
 * Adds `mediaId` to an existing music entity's `audioMediaIds` array in the
 * raw file text — inserts a new field (right after the `"status"` line,
 * present on every entity) if the entity has none yet, or appends to the
 * existing array otherwise. Scoped to the exact entity by first locating its
 * `"id": "<musicId>"` line, then bounding the search to that entity's own
 * closing `    }`/`    },` line so a same-named field on a different entity
 * is never touched.
 */
export function attachAudioToMusicEntity(filePath, musicId, mediaId) {
  const raw = fs.readFileSync(filePath, "utf-8");
  const lines = raw.split("\n");
  const idLineIdx = lines.findIndex((l) => l.trim() === `"id": "${musicId}",`);
  if (idLineIdx === -1) throw new Error(`Could not find music entity '${musicId}' in ${filePath}.`);

  // Brace-depth tracking (not a naive "}"-line match) — a naive match breaks
  // as soon as it hits the FIRST nested object's closing brace (e.g. a
  // multilingual title: { "en": "..." }), well before the entity's own
  // closing brace. Depth starts at 1: idLineIdx is already one level inside
  // the entity's own opening "{" (the line above it in the array).
  let depth = 1;
  let endIdx = -1;
  for (let i = idLineIdx + 1; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
    }
    if (depth <= 0) { endIdx = i; break; }
  }
  if (endIdx === -1) throw new Error(`Could not find the end of entity '${musicId}' in ${filePath}.`);

  let audioLineIdx = -1;
  for (let i = idLineIdx + 1; i < endIdx; i++) {
    if (lines[i].trim().startsWith('"audioMediaIds"')) { audioLineIdx = i; break; }
  }

  if (audioLineIdx === -1) {
    const statusIdx = lines.slice(idLineIdx, endIdx).findIndex((l) => l.trim().startsWith('"status"'));
    if (statusIdx === -1) throw new Error(`Could not find an anchor field ("status") on entity '${musicId}'.`);
    const insertAt = idLineIdx + statusIdx;
    const indent = lines[insertAt].match(/^(\s*)/)[1];
    lines.splice(insertAt, 0, `${indent}"audioMediaIds": [\n${indent}  "${mediaId}"\n${indent}],`);
  } else {
    // Single- or multi-line array; safest general transform is to re-parse
    // just this array's own lines (bounded by its matching brackets) rather
    // than assume a specific line count.
    let arrEnd = audioLineIdx;
    if (!lines[audioLineIdx].includes("]")) {
      for (let i = audioLineIdx + 1; i < endIdx; i++) {
        if (lines[i].includes("]")) { arrEnd = i; break; }
      }
    }
    const arrText = lines.slice(audioLineIdx, arrEnd + 1).join("\n").replace(/^"audioMediaIds":\s*/, (m) => m).trim();
    const bracketStart = arrText.indexOf("[");
    const jsonArrText = arrText.slice(bracketStart).replace(/,\s*$/, "");
    const currentIds = JSON.parse(jsonArrText);
    if (!currentIds.includes(mediaId)) currentIds.push(mediaId);
    const indent = lines[audioLineIdx].match(/^(\s*)/)[1];
    const trailingComma = lines[arrEnd].trim().endsWith(",") ? "," : "";
    const rebuilt = `${indent}"audioMediaIds": ${JSON.stringify(currentIds)}${trailingComma}`;
    lines.splice(audioLineIdx, arrEnd - audioLineIdx + 1, rebuilt);
  }
  fs.writeFileSync(filePath, lines.join("\n"));
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      args[key] = value;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const musicId = args["music-id"];
  const filePath = args.file;
  const rights = args.rights;
  const dataDir = path.resolve(REPO_ROOT, args["data-dir"] || "data/v2");
  const entitiesPath = path.join(dataDir, "entities.json");

  if (!musicId || !filePath) {
    console.error("Usage: node scripts/import-music-audio.js --music-id <id> --file <path> --rights <status> [--credit ...] [--license ...] [--rights-note ...] [--duration <seconds>] [--data-dir data/v2]");
    process.exitCode = 1;
    return;
  }
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exitCode = 1;
    return;
  }

  const stat = fs.statSync(filePath);
  const extension = path.extname(filePath);
  const check = validateAudioFileMeta({ extension, size: stat.size, rights });
  if (!check.valid) {
    console.error("Validation failed:\n" + check.errors.map((e) => `  - ${e}`).join("\n"));
    process.exitCode = 1;
    return;
  }

  const entities = JSON.parse(fs.readFileSync(entitiesPath, "utf-8")).entities;
  const musicEntity = entities.find((e) => e.id === musicId);
  if (!musicEntity || musicEntity.entityType !== "music") {
    console.error(`No music entity with id '${musicId}' found in ${entitiesPath}.`);
    process.exitCode = 1;
    return;
  }

  const checksum = sha256File(filePath);
  const duplicate = findDuplicateByChecksum(entities, checksum);
  if (duplicate) {
    console.error(`This exact file (sha256 ${checksum}) is already recorded as media entity '${duplicate.id}'. Not importing a duplicate.`);
    process.exitCode = 1;
    return;
  }

  const isCleared = rights === "cleared";
  const safeFilename = `${sha256File(filePath).slice(0, 8)}-${sanitizeFilename(path.basename(filePath))}`;
  const mediaId = nextMediaId(entities);
  const mediaEntity = buildMediaEntity({
    id: mediaId,
    safeFilename,
    mimeType: check.mimeType,
    size: stat.size,
    checksum,
    rights,
    credit: args.credit,
    license: args.license,
    rightsNote: args["rights-note"],
    duration: args.duration ? Number(args.duration) : undefined,
    isCleared,
  });

  const validation = validateEntity(mediaEntity);
  if (!validation.valid) {
    console.error(`Constructed media entity failed schema validation: ${validation.error}`);
    process.exitCode = 1;
    return;
  }

  if (isCleared) {
    const publicDir = path.resolve(REPO_ROOT, "public/media/music");
    fs.mkdirSync(publicDir, { recursive: true });
    fs.copyFileSync(filePath, path.join(publicDir, safeFilename));
  }

  appendEntityToEntitiesFile(entitiesPath, mediaEntity);

  if (isCleared) {
    attachAudioToMusicEntity(entitiesPath, musicId, mediaId);
    console.log(`Imported '${mediaId}' (rights: cleared) and attached it to '${musicId}'.audioMediaIds. File copied to public/media/music/${safeFilename}.`);
  } else {
    console.log(`Staged '${mediaId}' (rights: ${rights}) — NOT copied to public storage and NOT attached to '${musicId}'.audioMediaIds. It will not be reachable or playable until a human re-runs this import with --rights cleared after actually clearing it.`);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
