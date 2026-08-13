// Parses the raw canonical research text files (research-input/*.txt, not
// committed — see V2-ARCHITECTURE.md "Import preview workflow") into plain
// JS data structures. This module is a pure text -> structured-data parser:
// it does not apply any policy (uncertainty handling, publication status,
// schema mapping) and does not validate against the v2 schemas — that is
// normalizeResearch.js's job. It never writes anything.
//
// Two source formats appear across the six files:
//   - PART 1-3: fenced ```yaml id="..."``` code blocks, one per record.
//   - PART 4/5 (regenerated) and the registry-recovery file: a
//     "====...====\nSECTION TITLE\n====...====" section header followed by
//     a stream of YAML documents separated by "---" lines (no code fence).
//
// The PART 4/5 stream format has a recurring quirk: the last YAML document
// in several sections is followed by loose prose/list content with no "---"
// separator before the next section boundary (e.g. a trailing "SOURCE
// NORMALIZATION RULES:" note after the last source record). A naive split
// merges that trailing prose into the last document and fails to parse it.
// parseYamlStream() below recovers from this generically: on a parse
// failure, it retries with progressively fewer trailing lines until the
// document parses, rather than dropping the record.

import { load as loadYaml } from "js-yaml";

// The research files mix LF and CRLF line endings (varies by section within
// the same file). Every parser below relies on "\n"-anchored regexes, so
// normalize once at each entry point rather than patching every pattern.
function normalizeLineEndings(text) {
  return text.replace(/\r\n/g, "\n");
}

const FENCED_YAML_RE = /```yaml(?:\s+id="([^"]+)")?\r?\n([\s\S]*?)```/g;
// Title may span one or more lines (e.g. registry_recovery.txt's
// "PART 3'TEN GERİ KAZANILAN FAKAT BİBLİYOGRAFİK KİMLİĞİ\nTAMAMLANAMAYAN
// SOURCE CONTEXT'LERİ" header wraps across two lines).
const SECTION_HEADER_RE = /^=+\s*\n((?:[^\n=][^\n]*\n)+?)=+\s*$/gm;
const DOC_SEPARATOR_RE = /^---\s*$/m;

/** Extracts every fenced ```yaml ... ``` block in a markdown file as parsed objects. */
export function parseFencedYamlBlocks(rawText) {
  const text = normalizeLineEndings(rawText);
  const blocks = [];
  let match;
  FENCED_YAML_RE.lastIndex = 0;
  while ((match = FENCED_YAML_RE.exec(text))) {
    const [, blockId, body] = match;
    let data;
    try {
      data = loadYaml(body);
    } catch (error) {
      throw new Error(`Fenced YAML block '${blockId || "?"}' failed to parse: ${error.message}`);
    }
    blocks.push({ blockId, data });
  }
  return blocks;
}

/**
 * Parses one "---"-separated chunk as YAML, recovering from trailing
 * non-YAML content by retrying with fewer trailing lines. Throws only if no
 * prefix of the chunk parses to a non-null value.
 */
function parseStreamDocument(rawChunk) {
  const lines = rawChunk.replace(/^\n+/, "").replace(/\s+$/, "").split("\n");
  for (let cut = lines.length; cut > 0; cut -= 1) {
    const candidate = lines.slice(0, cut).join("\n");
    if (!candidate.trim()) continue;
    try {
      const parsed = loadYaml(candidate);
      if (parsed != null) return parsed;
    } catch {
      // Try a shorter prefix — the failure is usually trailing loose prose
      // (e.g. a note/list with no preceding "---") appended to a document
      // that already parsed validly up to that point.
    }
  }
  throw new Error(`Could not parse any valid YAML prefix from stream chunk:\n${rawChunk.slice(0, 200)}`);
}

/** Splits markdown text into "====...====\nTITLE\n====...====" delimited sections. */
export function splitIntoSections(rawText) {
  const text = normalizeLineEndings(rawText);
  const headers = [...text.matchAll(SECTION_HEADER_RE)];
  return headers.map((match, index) => {
    const title = match[1].trim().replace(/\s+/g, " ");
    const start = match.index + match[0].length;
    const end = index + 1 < headers.length ? headers[index + 1].index : text.length;
    return { title, body: text.slice(start, end) };
  });
}

/** Parses every "---"-separated YAML document within a section body. */
export function parseYamlStream(body) {
  const chunks = body.split(DOC_SEPARATOR_RE).map((chunk) => chunk.trim()).filter(Boolean);
  return chunks.map((chunk) => parseStreamDocument(chunk));
}

export function parsePart1(text) {
  const blocks = parseFencedYamlBlocks(text);
  const byType = { historicalContext: [], community: [], belief: [] };
  let metadata = null;
  for (const { data } of blocks) {
    if (!data || typeof data !== "object") continue;
    if (data.dataset) { metadata = data.dataset; continue; }
    const type = data.entityType;
    if (type && byType[type]) byType[type].push(data);
  }
  return { metadata, ...byType };
}

export function parsePart2(text) {
  const blocks = parseFencedYamlBlocks(text);
  const byType = { place: [], structure: [] };
  for (const { data } of blocks) {
    if (!data || typeof data !== "object") continue;
    const type = data.entityType;
    if (type && byType[type]) byType[type].push(data);
  }
  return byType;
}

export function parsePart3(text) {
  const blocks = parseFencedYamlBlocks(text);
  const byType = { story: [], music: [] };
  let proverbMeta = null;
  let qualitySummary = null;
  for (const { data } of blocks) {
    if (!data || typeof data !== "object") continue;
    const type = data.entityType;
    if (type && byType[type]) { byType[type].push(data); continue; }
    if (data.proverbCanonicalEntityCountInThisPart != null) { proverbMeta = data; continue; }
    if (data.storyEntities) { qualitySummary = data; continue; }
  }
  return { ...byType, proverbMeta, qualitySummary };
}

export function parsePart4(text) {
  const sections = splitIntoSections(text);
  const mediaSection = sections.find((s) => s.title.startsWith("J. MEDIA"));
  const sourceSection = sections.find((s) => s.title.startsWith("K. SOURCES"));
  const relationshipSection = sections.find((s) => s.title.startsWith("L. RELATIONSHIPS"));

  const mediaDocs = mediaSection ? parseYamlStream(mediaSection.body) : [];
  const sourceDocs = sourceSection ? parseYamlStream(sourceSection.body) : [];
  const relationshipDocs = relationshipSection ? parseYamlStream(relationshipSection.body) : [];

  return {
    media: mediaDocs.filter((d) => d && typeof d === "object" && d.mediaId),
    mediaRegistryStatus: mediaDocs.find((d) => d && d.mediaRegistryStatus)?.mediaRegistryStatus ?? null,
    sources: sourceDocs.filter((d) => d && typeof d === "object" && d.sourceId),
    sourceRegistryStatus: sourceDocs.find((d) => d && d.sourceRegistryStatus)?.sourceRegistryStatus ?? null,
    relationships: relationshipDocs.filter((d) => d && typeof d === "object" && d.relationshipId),
    relationshipGenerationPolicy:
      relationshipDocs.find((d) => d && d.relationshipGenerationPolicy)?.relationshipGenerationPolicy ?? null,
  };
}

export function parsePart5(text) {
  const sections = splitIntoSections(text);
  const find = (prefix) => sections.find((s) => s.title.startsWith(prefix));

  const parseSingleDocSection = (section) => {
    if (!section) return null;
    const docs = parseYamlStream(section.body);
    return docs[0] ?? null;
  };

  return {
    duplicateResolutionLog: parseSingleDocSection(find("M. DUPLICATE")),
    rightsIssues: parseSingleDocSection(find("N. RIGHTS")),
    unresolvedQuestions: parseSingleDocSection(find("O. UNRESOLVED")),
    qualityReport: parseSingleDocSection(find("P. DATASET QUALITY")),
    validationReport: parseSingleDocSection(find("MASTER DATASET VALIDATION REPORT")),
  };
}

/**
 * registry_recovery.txt mixes Turkish narrative prose with YAML-shaped
 * blocks in a way that isn't a uniform "---"-stream, so this is a
 * targeted (not generic) parse: it locates each known sub-section by its
 * numbered header and parses only the YAML-shaped content within it.
 */
export function parseRegistryRecovery(text) {
  const sections = splitIntoSections(text);
  const find = (prefix) => sections.find((s) => s.title.startsWith(prefix));

  // "1. RESTORED SOURCE RECORDS": per-source blocks headed by
  // "SOURCE-XXXX" and a dashed rule, then "PART 3'TEN..." context-only
  // stubs as one combined YAML mapping.
  const restoredSection = find("1. RESTORED SOURCE RECORDS");
  const restoredSources = [];
  let recoveredContextSources = {};
  if (restoredSection) {
    const dashBlocks = restoredSection.body.split(/^-{10,}\s*$/m);
    for (const block of dashBlocks) {
      const trimmed = block.trim();
      if (!/^sourceId:/m.test(trimmed)) continue;
      restoredSources.push(parseStreamDocument(trimmed));
    }
  }
  const contextSection = find("PART 3'TEN GERİ KAZANILAN");
  if (contextSection) {
    try {
      recoveredContextSources = loadYaml(contextSection.body) || {};
    } catch (error) {
      throw new Error(`Failed to parse recovered-context source stubs: ${error.message}`);
    }
  }

  // "2. UNRESOLVED SOURCE IDS": a flat "unresolvedSourceIds:" list.
  const unresolvedSection = find("2. UNRESOLVED SOURCE IDS");
  let unresolvedSourceIds = [];
  let unrecoverableRegistryRecordCount = null;
  if (unresolvedSection) {
    const listMatch = unresolvedSection.body.match(/unresolvedSourceIds:\n((?:\s+-\s+\S+\n)+)/);
    if (listMatch) {
      const parsed = loadYaml(`unresolvedSourceIds:\n${listMatch[1]}`);
      unresolvedSourceIds = parsed.unresolvedSourceIds;
    }
    const countMatch = unresolvedSection.body.match(/unrecoveredRegistryRecordCount:\s*(\d+)/);
    if (countMatch) unrecoverableRegistryRecordCount = Number(countMatch[1]);
  }

  // "4. RESTORED MEDIA RECORDS": per-media blocks (dashed rule headers),
  // same shape as PART 4's media docs, with a couple of extra provenance
  // fields recovered.
  const mediaSection = find("4. RESTORED MEDIA RECORDS");
  const restoredMediaExtra = [];
  if (mediaSection) {
    const dashBlocks = mediaSection.body.split(/^-{10,}\s*$/m);
    for (const block of dashBlocks) {
      const trimmed = block.trim();
      if (!/^mediaId:/m.test(trimmed)) continue;
      restoredMediaExtra.push(parseStreamDocument(trimmed));
    }
  }

  // "7. RELATIONSHIP EVIDENCE CORRECTIONS": the corrected relationship-0049
  // block (second "relationshipId: ..." occurrence in the section is the
  // corrected version — "Doğrusu:" precedes it).
  const correctionSection = find("7. RELATIONSHIP EVIDENCE CORRECTIONS");
  const relationshipCorrections = [];
  if (correctionSection) {
    // Captures the full corrected YAML document (relationshipId through the
    // trailing folded `note:` block) between "Doğrusu:" and the next prose
    // paragraph, and parses it as one document rather than hand-splitting
    // fields — more robust to the exact blank-line count around `note:`.
    const correctedMatch = correctionSection.body.match(
      /Doğrusu:\n\n(relationshipId:[\s\S]*?)\n\n\nDiğer/,
    );
    if (correctedMatch) {
      const parsed = loadYaml(correctedMatch[1]);
      relationshipCorrections.push(parsed);
    }
  }

  // "8. RECOVERY VALIDATION REPORT": one YAML-shaped block.
  const validationSection = find("8. RECOVERY VALIDATION REPORT");
  let recoveryValidationReport = null;
  if (validationSection) {
    try {
      recoveryValidationReport = loadYaml(validationSection.body);
    } catch (error) {
      throw new Error(`Failed to parse recovery validation report: ${error.message}`);
    }
  }

  return {
    restoredSources,
    recoveredContextSources,
    unresolvedSourceIds,
    unrecoverableRegistryRecordCount,
    restoredMediaExtra,
    relationshipCorrections,
    recoveryValidationReport,
  };
}
