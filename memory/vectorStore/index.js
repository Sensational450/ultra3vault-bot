/**
 * 🔍 VectorStore v5.0
 * - Simple in‑memory vector storage (for embeddings)
 * - Cosine similarity search
 * - Persistable to JSON (save/load)
 * - EventBus integration
 */
class VectorStore {
  constructor(options = {}) {
    this.vectors = new Map();       // id -> { vector, metadata }
    this.eventBus = options.eventBus || null;
    this.logger = options.logger || console;
  }

  _emit(event, data) {
    if (this.eventBus?.emit) this.eventBus.emit(event, data);
  }

  // ➕ Add or update a vector
  upsert(id, vector, metadata = {}) {
    this.vectors.set(id, { vector: [...vector], metadata });
    this._emit('vectorStore.upsert', { id });
    return this;
  }

  // 🔍 Get a vector by ID
  get(id) {
    return this.vectors.get(id);
  }

  // 🗑️ Delete a vector
  delete(id) {
    const existed = this.vectors.delete(id);
    if (existed) this._emit('vectorStore.delete', { id });
    return existed;
  }

  // 🔎 Cosine similarity search
  search(queryVector, topK = 5) {
    const results = [];
    for (const [id, { vector }] of this.vectors.entries()) {
      const similarity = this._cosineSimilarity(queryVector, vector);
      results.push({ id, similarity, metadata: this.vectors.get(id).metadata });
    }
    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, topK);
  }

  _cosineSimilarity(vecA, vecB) {
    if (vecA.length !== vecB.length) throw new Error('Vectors must have same length');
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      magA += vecA[i] * vecA[i];
      magB += vecB[i] * vecB[i];
    }
    if (magA === 0 || magB === 0) return 0;
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
  }

  // 📦 Export to JSON
  toJSON() {
    const data = {};
    for (const [id, { vector, metadata }] of this.vectors.entries()) {
      data[id] = { vector, metadata };
    }
    return JSON.stringify(data);
  }

  // 📥 Load from JSON
  fromJSON(jsonStr) {
    const data = JSON.parse(jsonStr);
    for (const [id, entry] of Object.entries(data)) {
      this.vectors.set(id, entry);
    }
    this._emit('vectorStore.loaded', { count: Object.keys(data).length });
    return this;
  }

  // 🧹 Clear all vectors
  clear() {
    this.vectors.clear();
    this._emit('vectorStore.cleared');
    this.logger.info('🗑️ VectorStore cleared');
  }

  stats() {
    return { size: this.vectors.size };
  }
}

module.exports = VectorStore;
