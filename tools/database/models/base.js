/**
 * 🧱 Base Model (v5.0)
 * Shared constructor and event emitter for all models.
 */
class BaseModel {
  constructor(db, eventBus = null, logger = null) {
    this.db = db;
    this.eventBus = eventBus;
    this.logger = logger || console;
  }

  // 📡 Emit event (for agents to react)
  _emit(event, data) {
    if (this.eventBus?.emit) {
      this.eventBus.emit(event, data);
    }
  }
}

module.exports = BaseModel;
