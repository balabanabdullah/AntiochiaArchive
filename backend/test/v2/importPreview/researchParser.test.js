// All fixtures here are synthetic and obviously fictional (e.g.
// "hist-test-1") — never real research content. They exist only to prove
// the parser's mechanics: fenced YAML blocks, section splitting, the
// "---"-stream format, CRLF line endings, and recovery from trailing prose
// with no separator (a real issue found in the actual research files).

import test from "node:test";
import assert from "node:assert/strict";
import {
  parseFencedYamlBlocks, splitIntoSections, parseYamlStream, parsePart1, parsePart4,
} from "../../../v2/importPreview/researchParser.js";

test("parseFencedYamlBlocks extracts id and parsed data from fenced yaml blocks", () => {
  const text = [
    "# Title",
    "",
    '```yaml id="abc123"',
    "id: hist-test-1",
    "entityType: historicalContext",
    "title:",
    "  en: Test Title",
    "```",
    "",
    "some prose in between",
    "",
    '```yaml id="def456"',
    "id: hist-test-2",
    "entityType: historicalContext",
    "```",
  ].join("\n");

  const blocks = parseFencedYamlBlocks(text);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].blockId, "abc123");
  assert.equal(blocks[0].data.id, "hist-test-1");
  assert.deepEqual(blocks[0].data.title, { en: "Test Title" });
  assert.equal(blocks[1].data.id, "hist-test-2");
});

test("parseFencedYamlBlocks handles CRLF line endings", () => {
  const text = ['```yaml id="x"', "id: hist-test-1", "entityType: historicalContext", "```"].join("\r\n");
  const blocks = parseFencedYamlBlocks(text);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].data.id, "hist-test-1");
});

test("splitIntoSections handles both single-line and multi-line section titles", () => {
  const text = [
    "============================================================",
    "J. TEST SECTION",
    "============================================================",
    "",
    "body one",
    "",
    "============================================================",
    "K. WRAPPED TITLE LINE ONE",
    "CONTINUES ON LINE TWO",
    "============================================================",
    "",
    "body two",
  ].join("\n");

  const sections = splitIntoSections(text);
  assert.equal(sections.length, 2);
  assert.equal(sections[0].title, "J. TEST SECTION");
  assert.match(sections[0].body, /body one/);
  assert.equal(sections[1].title, "K. WRAPPED TITLE LINE ONE CONTINUES ON LINE TWO");
  assert.match(sections[1].body, /body two/);
});

test("parseYamlStream parses '---'-separated documents", () => {
  const body = [
    "",
    "someHeaderMapping:",
    "  flag: true",
    "",
    "---",
    "mediaId: media-test-1",
    "mediaType: photo",
    "",
    "---",
    "mediaId: media-test-2",
    "mediaType: photo",
  ].join("\n");

  const docs = parseYamlStream(body);
  assert.equal(docs.length, 3);
  assert.deepEqual(docs[0], { someHeaderMapping: { flag: true } });
  assert.equal(docs[1].mediaId, "media-test-1");
  assert.equal(docs[2].mediaId, "media-test-2");
});

test("parseYamlStream recovers a document followed by trailing prose with no separator", () => {
  // Mirrors the real research-file quirk: the last document in a section is
  // followed by loose notes/list content with no "---" before the next
  // section boundary, which would otherwise fail to parse as one blob.
  const body = [
    "---",
    "mediaId: media-test-1",
    "mediaType: photo",
    "rightsNote: ok",
    "",
    "SOME TRAILING NOTE:",
    "  - not a real yaml document field, no separator precedes it",
  ].join("\n");

  const docs = parseYamlStream(body);
  assert.equal(docs.length, 1);
  assert.equal(docs[0].mediaId, "media-test-1");
  assert.equal(docs[0].rightsNote, "ok");
});

test("parsePart1 buckets fenced blocks by entityType and extracts dataset metadata", () => {
  const text = [
    '```yaml id="a"',
    "dataset:",
    "  id: test-dataset",
    "  status: inReview",
    "```",
    "",
    '```yaml id="b"',
    "id: hist-test-1",
    "entityType: historicalContext",
    "title:",
    "  en: T",
    "```",
    "",
    '```yaml id="c"',
    "id: comm-test-1",
    "entityType: community",
    "title:",
    "  en: T",
    "```",
    "",
    '```yaml id="d"',
    "id: belief-test-1",
    "entityType: belief",
    "title:",
    "  en: T",
    "```",
  ].join("\n");

  const result = parsePart1(text);
  assert.equal(result.metadata.id, "test-dataset");
  assert.equal(result.historicalContext.length, 1);
  assert.equal(result.community.length, 1);
  assert.equal(result.belief.length, 1);
});

test("parsePart4 extracts media, sources, and relationships from their respective sections", () => {
  const text = [
    "============================================================",
    "J. MEDIA ASSETS",
    "============================================================",
    "",
    "mediaRegistryStatus:",
    "  note: test",
    "",
    "---",
    "mediaId: media-test-1",
    "mediaType: photo",
    "safeToPublish: false",
    "",
    "============================================================",
    "K. SOURCES",
    "============================================================",
    "",
    "sourceRegistryStatus:",
    "  note: test",
    "",
    "---",
    "sourceId: source-test-1",
    "type: NEEDS METADATA RECOVERY",
    "title: UNKNOWN",
    "",
    "============================================================",
    "L. RELATIONSHIPS",
    "============================================================",
    "",
    "relationshipGenerationPolicy:",
    "  automaticInverseEdges: false",
    "",
    "---",
    "relationshipId: relationship-test-1",
    "sourceEntityId: media-test-1",
    "sourceType: media",
    "type: depicts",
    "targetEntityId: structure-test-1",
    "targetType: structure",
  ].join("\n");

  const result = parsePart4(text);
  assert.equal(result.media.length, 1);
  assert.equal(result.media[0].mediaId, "media-test-1");
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].sourceId, "source-test-1");
  assert.equal(result.relationships.length, 1);
  assert.equal(result.relationships[0].relationshipId, "relationship-test-1");
  assert.equal(result.relationshipGenerationPolicy.automaticInverseEdges, false);
});
