import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const archive = JSON.parse(fs.readFileSync(new URL("../data/archive.json", import.meta.url), "utf8"));

function createRendererContext() {
  const context = vm.createContext({
    URL,
    clearTimeout,
    console,
    document: {
      addEventListener() {},
    },
    setTimeout,
    window: {
      location: { origin: "http://localhost:5173" },
    },
  });

  vm.runInContext(fs.readFileSync(new URL("../public/lang.js", import.meta.url), "utf8"), context);
  vm.runInContext(fs.readFileSync(new URL("../public/script.js", import.meta.url), "utf8"), context);
  return context;
}

test("gallery record images use localized metadata (TR/EN/AR) while held records keep placeholders", () => {
  // Superseded, by Phase 3 of the v2 frontend integration, the old
  // renderBeliefs-based version of this test: beliefs-grid-container is now
  // fed by v2 data (renderV2Beliefs), so v1's renderBeliefs has no live
  // caller left and was removed. renderGallery remains v1-shaped forever
  // (gallery stays v1-sourced — see V2-ARCHITECTURE.md), and g1 is a real,
  // still-committed "held" placeholder record (src: null) alongside 5 real
  // images, so it exercises the exact same localized-metadata /
  // placeholder-fallback pipeline this test always cared about.
  const context = createRendererContext();
  context.galleryItems = archive.gallery;

  const turkish = vm.runInContext('renderGallery(galleryItems, "tr")', context);
  const english = vm.runInContext('renderGallery(galleryItems, "en")', context);
  const arabic = vm.runInContext('renderGallery(galleryItems, "ar")', context);

  assert.match(turkish, /class="gallery-img"/);
  assert.match(turkish, /Antakya Demirkapı'daki su kemeri kalıntıları, 1905/);
  assert.match(english, /Aqueduct remains at the Iron Gate in Antioch, 1905/);
  assert.match(arabic, /بقايا القناة المائية عند بوابة الحديد في أنطاكية، 1905/);
  assert.equal((turkish.match(/class="gallery-img"/g) || []).length, 5);
  assert.doesNotMatch(turkish, /generated with artificial intelligence/);
});

test("gallery rendering and attribution use the integrated nested metadata", () => {
  const context = createRendererContext();
  context.galleryItems = archive.gallery;
  context.galleryMetadata = archive.gallery.find((item) => item.id === "g6").imageMetadata;

  const gallery = vm.runInContext('renderGallery(galleryItems, "en")', context);
  const attribution = vm.runInContext('formatImageAttribution(galleryMetadata, "en")', context);

  assert.equal((gallery.match(/class="gallery-img"/g) || []).length, 5);
  assert.match(gallery, /Aqueduct remains at the Iron Gate in Antioch, 1905/);
  assert.match(attribution, /Photo: Gertrude Bell/);
  assert.match(attribution, /Source: Gertrude Bell archive \/ Wikimedia Commons/);
  assert.match(attribution, /License: Public Domain/);
});
