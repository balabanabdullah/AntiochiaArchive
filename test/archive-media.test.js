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

test("record images use localized metadata while held records keep placeholders", () => {
  const context = createRendererContext();
  context.beliefItems = archive.beliefs;

  const turkish = vm.runInContext('renderBeliefs(beliefItems, "tr")', context);
  const english = vm.runInContext('renderBeliefs(beliefItems, "en")', context);
  const arabic = vm.runInContext('renderBeliefs(beliefItems, "ar")', context);

  assert.match(turkish, /class="belief-image"/);
  assert.match(turkish, /Habib-i Neccar Camii'nin altındaki/);
  assert.match(english, /Tomb attributed to Habib-i Neccar/);
  assert.match(arabic, /القبر المنسوب إلى حبيب النجار/);
  assert.equal((turkish.match(/class="belief-image"/g) || []).length, 2);
  assert.match(turkish, /🕍/);
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
