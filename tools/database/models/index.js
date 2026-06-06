/**
 * 🏭 Models Index (v5.0)
 * Aggregates all models for easy import
 */
const UserModel = require('./User');
const EconomyModel = require('./Economy');
const ReferralModel = require('./Referral');
const SubscriptionModel = require('./Subscription');
const WarningModel = require('./Warning');

class Models {
  constructor(db, eventBus = null, logger = null) {
    this.db = db;
    this.eventBus = eventBus;
    this.logger = logger;

    this.User = new UserModel(db, eventBus, logger);
    this.Economy = new EconomyModel(db, eventBus, logger);
    this.Referral = new ReferralModel(db, eventBus, logger);
    this.Subscription = new SubscriptionModel(db, eventBus, logger);
    this.Warning = new WarningModel(db, eventBus, logger);
  }
}

module.exports = Models;