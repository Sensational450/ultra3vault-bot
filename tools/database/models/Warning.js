/**
 * ⚠️ Warning Model (v5.0)
 * Tracks user warnings for moderation
 */
const BaseModel = require('./base');

class WarningModel extends BaseModel {
  constructor(db, eventBus, logger) {
    super(db, eventBus, logger);
  }

  // ➕ Add warning
  async add(userId, guildId, reason, moderatorId) {
    const timestamp = Date.now();
    await this.db.run(
      `INSERT INTO warnings (userId, guildId, reason, moderatorId, timestamp)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, guildId, reason, moderatorId, timestamp]
    );
    const count = await this.getCount(userId, guildId);
    this._emit('warning.added', { userId, guildId, reason, count });
    return count;
  }

  // 📋 Get all warnings for a user
  async get(userId, guildId) {
    return await this.db.all(
      `SELECT id, reason, moderatorId, timestamp
       FROM warnings WHERE userId = ? AND guildId = ?
       ORDER BY timestamp DESC`,
      [userId, guildId]
    );
  }

  // 🔢 Get warning count
  async getCount(userId, guildId) {
    const row = await this.db.get(
      `SELECT COUNT(*) as count FROM warnings WHERE userId = ? AND guildId = ?`,
      [userId, guildId]
    );
    return row?.count || 0;
  }

  // ❌ Clear all warnings for a user
  async clear(userId, guildId) {
    await this.db.run(
      `DELETE FROM warnings WHERE userId = ? AND guildId = ?`,
      [userId, guildId]
    );
    this._emit('warnings.cleared', { userId, guildId });
  }

  // 🗑️ Delete a single warning by ID
  async deleteById(id, userId, guildId) {
    await this.db.run(
      `DELETE FROM warnings WHERE id = ? AND userId = ? AND guildId = ?`,
      [id, userId, guildId]
    );
    this._emit('warning.deleted', { id, userId, guildId });
  }
}

module.exports = WarningModel;