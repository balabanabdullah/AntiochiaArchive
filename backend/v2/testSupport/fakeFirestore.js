// Minimal in-memory fake implementing just enough of the
// @google-cloud/firestore query builder surface (collection/doc/where/
// orderBy/limit/startAfter/get/getAll) for FirestoreV2Store's tests. It is
// deliberately not a full Firestore emulator — only equality and
// array-contains filters, and ordering by document id (the only ordering
// FirestoreV2Store ever performs), are implemented.

function makeSnapshot(id, data) {
  return { id, exists: data !== undefined, data: () => data };
}

function makeQuery(getDocs, state) {
  return {
    where(field, op, value) {
      return makeQuery(getDocs, { ...state, wheres: [...state.wheres, { field, op, value }] });
    },
    orderBy() {
      return makeQuery(getDocs, { ...state, ordered: true });
    },
    limit(value) {
      return makeQuery(getDocs, { ...state, limitValue: value });
    },
    startAfter(snapshot) {
      return makeQuery(getDocs, { ...state, startAfterId: snapshot.id });
    },
    async get() {
      let entries = getDocs();

      for (const clause of state.wheres) {
        entries = entries.filter(([, data]) => {
          if (clause.op === "==") return data[clause.field] === clause.value;
          if (clause.op === "array-contains") {
            return Array.isArray(data[clause.field]) && data[clause.field].includes(clause.value);
          }
          throw new Error(`fakeFirestore: unsupported operator '${clause.op}'`);
        });
      }

      entries = [...entries].sort(([idA], [idB]) => idA.localeCompare(idB));

      if (state.startAfterId) {
        const index = entries.findIndex(([id]) => id === state.startAfterId);
        entries = index === -1 ? [] : entries.slice(index + 1);
      }

      if (state.limitValue != null) entries = entries.slice(0, state.limitValue);

      return { docs: entries.map(([id, data]) => makeSnapshot(id, data)) };
    },
  };
}

export function createFakeFirestore(seedData = {}) {
  const collections = new Map();
  for (const [name, docs] of Object.entries(seedData)) {
    collections.set(name, new Map(Object.entries(docs)));
  }

  function getCollectionMap(name) {
    if (!collections.has(name)) collections.set(name, new Map());
    return collections.get(name);
  }

  function makeDocRef(name, id) {
    return {
      id,
      async get() {
        return makeSnapshot(id, getCollectionMap(name).get(id));
      },
    };
  }

  function makeCollectionRef(name) {
    const base = makeQuery(() => [...getCollectionMap(name).entries()], {
      wheres: [], ordered: false, limitValue: null, startAfterId: null,
    });
    return {
      doc(id) { return makeDocRef(name, id); },
      where: base.where,
      orderBy: base.orderBy,
      limit: base.limit,
      get: base.get,
    };
  }

  return {
    collection(name) {
      return makeCollectionRef(name);
    },
    async getAll(...refs) {
      return Promise.all(refs.map((ref) => ref.get()));
    },
  };
}
