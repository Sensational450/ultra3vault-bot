/**
 * 👤 User Model (v5.0)
 * Handles user data (tier, expiration, etc.)
 */
const BaseModel = require('./base');

class UserModel extends BaseModel {
  constructor(db, eventBus, logger) {
    super(db, eventBus, logger);
    this.table = 'users';
  }

  // ✅ Create or replace user
  async upsert(userId, data = {}) {
    const { tier = null, expiresAt = null, createdAt = Date.now() } = data;
    await this.db.run(
      `INSERT OR REPLACE INTO users (id, tier, expiresAt, createdAt)
       VALUES (?, ?, ?, ?)`,
      [userId, tier, expiresAt, createdAt]
    );
    this._emit('user.updated', { userId, tier, expiresAt });
    return this.findById(userId);
  }

  // 🔍 Find user by ID
  async findById(userId) {
    return await this.db.get(`SELECT * FROM users WHERE id = ?`, [userId]);
  }

  // 📋 Get all users (paginated)
  async findAll(limit = 100, offset = 0) {
    return await this.db.all(
      `SELECT * FROM users ORDER BY createdAt DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    );
  }

  // 🔄 Update specific fields
  async update(userId, updates) {
    const allowed = ['tier', 'expiresAt'];
    const setClauses = [];
    const values = [];
    for (const [key, val] of Object.entries(updates)) {
      if (allowed.includes(key) && val !== undefined) {
        setClauses.push(`${key} = ?`);
        values.push(val);
      }
    }
    if (setClauses.length === 0) return;
    values.push(userId);
    await this.db.run(
      `UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`,
      values
    );
    this._emit('user.updated', { userId, ...updates });
    return this.findById(userId);
  }

  // ❌ Delete user
  async delete(userId) {
    await this.db.run(`DELETE FROM users WHERE id = ?`, [userId]);
    this._emit('user.deleted', { userId });
  }

  // ⏰ Get expired users
  async getExpired(now = Date.now()) {
    return await this.db.all(
      `SELECT * FROM users WHERE expiresAt IS NOT NULL AND expiresAt <= ?`,
      [now]
    );
  }
}

module.exports = UserModel;