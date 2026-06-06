/**
 * 🔗 Referral Model (v5.0)
 * Handles referral codes and tracking
 */
const BaseModel = require('./base');

class ReferralModel extends BaseModel {
  constructor(db, eventBus, logger) {
    super(db, eventBus, logger);
  }

  // 📝 Create or update a referral code
  async setCode(userId, guildId, code) {
    await this.db.run(
      `INSERT OR REPLACE INTO referral_codes (userId, guildId, code, createdAt)
       VALUES (?, ?, ?, ?)`,
      [userId, guildId, code, Date.now()]
    );
    this._emit('referral.code.created', { userId, guildId, code });
  }

  // 🔎 Get code by user
  async getCodeByUser(userId, guildId) {
    const row = await this.db.get(
      `SELECT code FROM referral_codes WHERE userId = ? AND guildId = ?`,
      [userId, guildId]
    );
    return row?.code || null;
  }

  // 🔎 Get user by code
  async getUserByCode(code, guildId) {
    const row = await this.db.get(
      `SELECT userId FROM referral_codes WHERE code = ? AND guildId = ?`,
      [code, guildId]
    );
    return row?.userId || null;
  }

  // 📈 Record a referral
  async recordReferral(referrerId, refereeId, guildId, rewardCoins = 0) {
    await this.db.run(
      `INSERT INTO referrals (referrerId, refereeId, guildId, timestamp, rewardCoins)
       VALUES (?, ?, ?, ?, ?)`,
      [referrerId, refereeId, guildId, Date.now(), rewardCoins]
    );
    this._emit('referral.recorded', { referrerId, refereeId, guildId, rewardCoins });
  }

  // 📊 Check if user already used a referral
  async isReferred(refereeId, guildId) {
    const row = await this.db.get(
      `SELECT id FROM referrals WHERE refereeId = ? AND guildId = ?`,
      [refereeId, guildId]
    );
    return !!row;
  }

  // 📋 Get referrals by referrer
  async getReferralsByReferrer(referrerId, guildId, limit = 10) {
    return await this.db.all(
      `SELECT refereeId, timestamp, rewardCoins FROM referrals
       WHERE referrerId = ? AND guildId = ?
       ORDER BY timestamp DESC LIMIT ?`,
      [referrerId, guildId, limit]
    );
  }

  // 📊 Get referrer stats (count + total rewards)
  async getReferrerStats(referrerId, guildId) {
    const row = await this.db.get(
      `SELECT COUNT(*) as count, SUM(rewardCoins) as totalRewards
       FROM referrals
       WHERE referrerId = ? AND guildId = ?`,
      [referrerId, guildId]
    );
    return { count: row?.count || 0, totalRewards: row?.totalRewards || 0 };
  }
}

module.exports = ReferralModel;