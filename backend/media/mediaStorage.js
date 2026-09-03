// Media file storage abstraction (Section 4, 23, 35). No media bytes ever
// live in SQLite — this module owns where they actually live on disk (or,
// in a future driver, in an object store), and every caller (contentService,
// admin media routes) only ever deals with an opaque `storageKey` string,
// never a raw filesystem path. Mirrors the exact pluggable-selector pattern
// already used by ../dataStore.js, ../v2/stores/v2Store.js, and
// ../admin/editorialStore.js: a Object.freeze()'d map of driver name ->
// implementation, selected once by an env var, never changeable mid-process.
//
// LocalFilesystemStorage lays files out under LOCAL_STORAGE_ROOT
// (default ./var/storage) as:
//   images/<key>      audio/<key>      documents/<key>
//   originals/<key>   (a copy of the as-uploaded original, never derived)
//   temp/<key>        (short-lived staging before a key is committed)
// `<key>` is always a server-generated opaque identifier (see
// generateStorageKey), never a client-supplied filename — this is what
// keeps "storageKey" portable, collision-free, and safe to expose in an
// admin UI without leaking a real filesystem path.
//
// Upload path is genuinely streaming end to end (see mediaUploadService.js):
// multer's diskStorage writes the incoming multipart stream straight to a
// temp/ file (generateTempFilePath) without ever assembling it into one JS
// Buffer; hashFileStreaming/readFileHead then inspect that on-disk file in
// small chunks; finalizeFromTemp does an atomic same-filesystem rename plus
// one OS-level fs.copyFileSync (not a Buffer read) to place it permanently.
// The old memory-buffered saveOriginal() this module used to expose is gone
// — see the "correctness pass" round's report for why memoryStorage was
// rejected (an entire upload the size of MEDIA_UPLOAD_MAX_BYTES held in RAM
// per concurrent request, unacceptable for ~200MB audio files).

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, "..");

const MEDIA_TYPE_SUBDIR = Object.freeze({ image: "images", audio: "audio", video: "audio", document: "documents" });
// audio and video deliberately share one subdirectory (see MEDIA_TYPE_SUBDIR
// above) — anything that walks "every subdirectory" must walk each UNIQUE
// target directory exactly once, or a shared one gets scanned twice.
const ALL_SUBDIRS = Object.freeze([...new Set(Object.values(MEDIA_TYPE_SUBDIR))]);

export function resolveLocalStorageRoot(value = process.env.LOCAL_STORAGE_ROOT) {
  const configured = String(value || "./var/storage").trim();
  return path.isAbsolute(configured) ? configured : path.resolve(BACKEND_ROOT, configured);
}

/** Server-generated opaque key — never derived from a client-supplied filename (which could contain path traversal, collide, or leak PII). */
export function generateStorageKey(originalFilename = "") {
  const ext = path.extname(String(originalFilename)).toLowerCase().replace(/[^a-z0-9.]/g, "");
  const random = crypto.randomBytes(16).toString("hex");
  return `${Date.now().toString(36)}-${random}${/^\.[a-z0-9]{1,8}$/.test(ext) ? ext : ""}`;
}

export function sha256Of(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function createLocalFilesystemStorage({ root = resolveLocalStorageRoot() } = {}) {
  function subdirFor(mediaType) {
    return MEDIA_TYPE_SUBDIR[mediaType] || "documents";
  }

  function resolveKeyPath(storageKey, mediaType) {
    // storageKey is server-generated (see generateStorageKey) and never
    // contains a path separator, but this is defense-in-depth against a
    // future caller accidentally passing an unsanitized value through.
    const safeKey = path.basename(String(storageKey));
    if (safeKey !== storageKey) throw new Error("Invalid storage key.");
    return path.join(root, subdirFor(mediaType), safeKey);
  }

  return {
    driver: "local",

    ensureDirectories() {
      for (const dir of [...ALL_SUBDIRS, "originals", "temp"]) {
        fs.mkdirSync(path.join(root, dir), { recursive: true });
      }
    },

    tempDir() {
      return path.join(root, "temp");
    },

    /** A fresh, opaque, server-generated path under temp/ for multer's diskStorage to stream a multipart upload directly onto disk — no upload byte is ever assembled into a JS Buffer for a large file (Section 1: "true streaming"). */
    generateTempFilePath() {
      this.ensureDirectories();
      return path.join(root, "temp", crypto.randomBytes(24).toString("hex"));
    },

    /**
     * Streams an already-on-disk file through a SHA-256 hash in fixed-size
     * chunks (fs.createReadStream's default highWaterMark, 64KB) — the whole
     * file is never held in memory at once, only one chunk at a time, no
     * matter how large the upload (Section 1: "calculate SHA-256
     * incrementally/streaming").
     */
    hashFileStreaming(filePath) {
      return new Promise((resolvePromise, reject) => {
        const hash = crypto.createHash("sha256");
        let size = 0;
        const stream = fs.createReadStream(filePath);
        stream.on("data", (chunk) => { hash.update(chunk); size += chunk.length; });
        stream.on("error", reject);
        stream.on("end", () => resolvePromise({ checksum: hash.digest("hex"), size }));
      });
    },

    /** Reads only the first `length` bytes of an on-disk file — enough for magic-byte signature checks (see media/fileSignature.js), never the whole file. */
    readFileHead(filePath, length = 64) {
      const fd = fs.openSync(filePath, "r");
      try {
        const buffer = Buffer.alloc(length);
        const bytesRead = fs.readSync(fd, buffer, 0, length, 0);
        return buffer.subarray(0, bytesRead);
      } finally {
        fs.closeSync(fd);
      }
    },

    /**
     * Moves an already-streamed-to-disk, already-validated, already-hashed
     * temp file into its permanent home: an atomic rename into the
     * type-specific subdirectory (temp/ and the destination are both under
     * `root`, so this is a same-filesystem rename, not a copy) plus one
     * additional OS-level file copy into originals/ (fs.copyFileSync — a
     * native, streamed file-to-file copy, not a JS Buffer read/write; see
     * Section 1: "never hold an entire large upload Buffer in RAM"). Callers
     * must have already computed `checksum`/`size` via hashFileStreaming —
     * this never re-reads the file to recompute them.
     */
    finalizeFromTemp({ tempPath, mediaType, originalFilename, checksum, size }) {
      this.ensureDirectories();
      const storageKey = generateStorageKey(originalFilename);
      const destination = resolveKeyPath(storageKey, mediaType);
      fs.renameSync(tempPath, destination);
      fs.copyFileSync(destination, path.join(root, "originals", storageKey));
      return { storageDriver: "local", storageKey, size, checksum };
    },

    /** Best-effort — safe to call even if the file was already moved/deleted. Every failure path in mediaUploadService.js calls this on its temp file (Section 1: "cleanup temp file on EVERY failure path"). */
    deleteTempFile(tempPath) {
      try {
        fs.unlinkSync(tempPath);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    },

    /**
     * Defense-in-depth against a temp file orphaned by a failure mode with
     * no explicit cleanup call at all — a client that disconnects mid-upload
     * (busboy/multer may leave the partial file with no 'error' event ever
     * firing for this request). Deletes temp/ files older than `maxAgeMs`;
     * safe to run at any time, including unconditionally on every server
     * startup (see server.js), since a legitimate upload finishes in
     * seconds, never hours.
     */
    sweepStaleTempFiles({ maxAgeMs = 60 * 60 * 1000 } = {}) {
      this.ensureDirectories();
      const dir = path.join(root, "temp");
      const now = Date.now();
      let removed = 0;
      for (const filename of fs.readdirSync(dir)) {
        const filePath = path.join(dir, filename);
        try {
          if (now - fs.statSync(filePath).mtimeMs > maxAgeMs) {
            fs.unlinkSync(filePath);
            removed += 1;
          }
        } catch {
          // Removed concurrently by another process/request — not an error.
        }
      }
      return removed;
    },

    readOriginal({ storageKey, mediaType }) {
      return fs.readFileSync(resolveKeyPath(storageKey, mediaType));
    },

    exists({ storageKey, mediaType }) {
      return fs.existsSync(resolveKeyPath(storageKey, mediaType));
    },

    /**
     * Server-internal only (backend/media/mediaRoutes.js) — never sent to a
     * client. Lets the public serving route use fs.createReadStream with a
     * byte range instead of buffering the whole file, so audio/video
     * scrubbing works without reading megabytes into memory per request.
     */
    statFile({ storageKey, mediaType }) {
      const filePath = resolveKeyPath(storageKey, mediaType);
      if (!fs.existsSync(filePath)) return null;
      return { path: filePath, size: fs.statSync(filePath).size };
    },

    delete({ storageKey, mediaType }) {
      const destination = resolveKeyPath(storageKey, mediaType);
      if (fs.existsSync(destination)) fs.unlinkSync(destination);
      const originalPath = path.join(root, "originals", path.basename(storageKey));
      if (fs.existsSync(originalPath)) fs.unlinkSync(originalPath);
    },

    /** Manifest of every stored file + its hash, for backupService.js. */
    buildManifest() {
      this.ensureDirectories();
      const manifest = [];
      for (const dir of ALL_SUBDIRS) {
        const dirPath = path.join(root, dir);
        for (const filename of fs.readdirSync(dirPath)) {
          const filePath = path.join(dirPath, filename);
          const buffer = fs.readFileSync(filePath);
          manifest.push({ subdir: dir, filename, sha256: sha256Of(buffer), size: buffer.length });
        }
      }
      return manifest.sort((a, b) => `${a.subdir}/${a.filename}`.localeCompare(`${b.subdir}/${b.filename}`));
    },
  };
}

const drivers = Object.freeze({
  local: createLocalFilesystemStorage,
  // Future: gcs: createGcsStorage, s3: createS3Storage — same interface
  // (saveOriginal/readOriginal/exists/delete/buildManifest), selected the
  // same way, with zero change required in contentService.js or the admin
  // media routes (Section 35).
});

let selectedStorage = null;
let selectedDriverName = null;

export function normalizeMediaStorageDriverName(value = process.env.MEDIA_STORAGE_DRIVER) {
  const name = String(value || "local").trim().toLowerCase();
  if (!Object.hasOwn(drivers, name)) {
    throw new Error(`MEDIA_STORAGE_DRIVER must be one of: ${Object.keys(drivers).join(", ")}.`);
  }
  return name;
}

export function initializeMediaStorage() {
  const name = normalizeMediaStorageDriverName();
  selectedDriverName = name;
  selectedStorage = drivers[name]();
  selectedStorage.ensureDirectories();
  return selectedStorage;
}

export function getMediaStorage() {
  if (!selectedStorage) throw new Error("Media storage has not been initialized. Call initializeMediaStorage() first.");
  return selectedStorage;
}

export function getSelectedMediaStorageDriverName() {
  return selectedDriverName || normalizeMediaStorageDriverName();
}
