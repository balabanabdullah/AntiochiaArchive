// Public (unauthenticated) media-serving route — Section 11 of the round
// brief. The ONLY way a browser ever reaches a locally-stored media file:
// no static directory is ever exposed (no express.static over var/storage/,
// no directory listing), and the URL only ever contains the opaque media
// entity id — never a storage key, never an absolute path.
//
// Rights gate enforced HERE too, not just in the entity-detail renderer
// (defense in depth): even a direct, guessed request for an uncleared
// media id's serving URL is refused. This is the literal backstop for
// "an uncleared audio upload must never produce a public player."

import { Router } from "express";
import fs from "fs";
import { getV2Store } from "../v2/stores/v2Store.js";
import { getMediaStorage } from "./mediaStorage.js";

const router = Router();

router.get("/:id", async (req, res) => {
  try {
    const media = await getV2Store().getEntityById(req.params.id);
    if (!media || media.entityType !== "media") return res.status(404).end();
    if (media.rightsStatus !== "cleared") return res.status(403).end();
    // A future gcs/s3 driver's media isn't fetchable through this
    // local-filesystem route — see media/mediaStorage.js's driver map.
    // storageDriver defaults to "local" for records created before this
    // field existed (Section 35's additive-field contract).
    if ((media.storageDriver || "local") !== "local") return res.status(404).end();
    if (!media.originalStoragePath) return res.status(404).end();

    let storage;
    try {
      storage = getMediaStorage();
    } catch {
      return res.status(404).end(); // media storage was never initialized in this deployment mode
    }
    const stat = storage.statFile({ storageKey: media.originalStoragePath, mediaType: media.mediaType });
    if (!stat) return res.status(404).end();

    const contentType = media.mimeType || "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Accept-Ranges", "bytes");

    const range = req.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2])) {
        return res.status(416).setHeader("Content-Range", `bytes */${stat.size}`).end();
      }
      const start = match[1] ? parseInt(match[1], 10) : stat.size - parseInt(match[2], 10);
      const end = match[2] && match[1] ? parseInt(match[2], 10) : stat.size - 1;
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start < 0 || end >= stat.size) {
        return res.status(416).setHeader("Content-Range", `bytes */${stat.size}`).end();
      }
      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${stat.size}`);
      res.setHeader("Content-Length", String(end - start + 1));
      fs.createReadStream(stat.path, { start, end }).pipe(res);
      return;
    }

    res.setHeader("Content-Length", String(stat.size));
    fs.createReadStream(stat.path).pipe(res);
  } catch (error) {
    console.error("[MediaRoutes]", error.message);
    res.status(500).end();
  }
});

export default router;
