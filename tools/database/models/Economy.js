/**
 * 💰 Economy Model (v5.0)
 * Manages user balances and leaderboards
 */
const BaseModel = require('./base');

class EconomyModel extends BaseModel {
  constructor(db, eventBus, logger) {
    super(db, eventBus, logger);
  }

  // 💵 Get balance
  async getBalance(userId, guildId) {
    const row = await this.db.get(
      `SELECT balance FROM economy WHERE userId = ? AND guildId = ?`,
      [userId, guildId]
    );
    return row?.balance ?? 0;
  }

  // 💸 Set balance (overwrites)
  async setBalance(userId, guildId, amount) {
    await this.db.run(
      `INSERT OR REPLACE INTO economy (userId, guildId, balance)
       VALUES (?, ?, ?)`,
      [userId, guildId, amount]
    );
    this._emit('economy.updated', { userId, guildId, balance: amount });
  }

  // ➕ Add to balance (positive or negative)
  async addBalance(userId, guildId, delta) {
    const current = await this.getBalance(userId, guildId);
    const newBalance = current + delta;
    if (newBalance < 0) throw new Error('Insufficient funds');
    await this.setBalance(userId, guildId, newBalance);
    this._emit('economy.changed', { userId, guildId, delta, newBalance });
    return newBalance;
  }

  // 🏆 Leaderboard (top users)
  async getLeaderboard(guildId, limit = 10) {
    return await this.db.all(
      `SELECT userId, balance FROM economy
       WHERE guildId = ? AND balance > 0
       ORDER BY balance DESC LIMIT ?`,
      [guildId, limit]
    );
  }
}

module.exports = EconomyModel;