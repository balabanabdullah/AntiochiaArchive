// Local-only placeholder store. It holds no records, reaches no external
// system, and connects to neither Firestore nor Cloud Storage. It exists so
// the v2 API surface and its pagination/filter contract can be exercised
// end-to-end before any real v2 persistence layer is built.

function emptyPage() {
  return { items: [], nextCursor: null, count: 0 };
}

export const emptyV2Store = {
  async initialize() {
    return undefined;
  },

  async listEntities(_options = {}) {
    return emptyPage();
  },

  async getEntityById(_id) {
    return null;
  },

  async listByType(_type, _options = {}) {
    return emptyPage();
  },

  async listRelationships(_options = {}) {
    return emptyPage();
  },

  async getRelatedEntities(_id, _options = {}) {
    return emptyPage();
  },
};
