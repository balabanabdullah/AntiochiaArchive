// A store-level error that is always safe to show a client verbatim (no
// stack traces, no Firestore internals, no paths, no project IDs). Routes
// use `instanceof V2QueryError` to distinguish "the request itself cannot be
// honored yet" (400) from an unexpected backend failure (500).
export class V2QueryError extends Error {
  constructor(message) {
    super(message);
    this.name = "V2QueryError";
  }
}
