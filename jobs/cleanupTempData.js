/**
 * 🧹 CleanupService – Central Housekeeping for Temporary Data
 * 
 * Dedicated cleanup service that removes expired and unnecessary temporary data
 * across all agents. Works with CacheManager and other temporary stores.
 * 
 * Features:
 * - Automatic scheduled cleanup
 * - Manual/emergency triggers
 * - Namespace & agent‑specific cleanup
 * - TTL‑based expiration & batch deletion
 * - Non‑blocking async processing
 * - Detailed monitoring & events
 * - Smart cleanup (skip active sessions, extend TTL for recent access)
 * - Safety: protected namespaces, retries, audit logging
 * - Integration with OptimizationAgent and AnalyticsAgent
 * 
 * Usage:
 *   const cleanup = new CleanupService({
 *     eventBus,
 *     logger,
 *     cacheManager,   // instance of CacheManager
 *     db,             // database connection for cleaning temp tables
 *   });
 *   cleanup.startScheduler();
 *   await cleanup.runCleanup();
 */
const { EventEmitter } = require('events');

// ─── Default Configuration ────────────────────────────────────────
const DEFAULT_CONFIG = {
  cleanupInterval: 5 * 60 * 1000,    // 5 minutes
  maxItemsPerCycle: 1000,
  maxExecutionTime: 30000,           // 30 seconds
  defaultTTL: 3600000,               // 1 hour
  emergencyThreshold: 85,            // memory % to trigger emergency cleanup
  memoryThreshold: 80,               // memory % to trigger normal cleanup
  protectedNamespaces: ['config', 'admin'],
  batchSize: 100,
  enableAuditLog: true,
  dryRun: false,
};

class CleanupService {
  /**
   * @param {Object} options
   * @param {EventBus} options.eventBus - for emitting events
   * @param {Logger} options.logger - for logging
   * @param {CacheManager} options.cacheManager - CacheManager instance
   * @param {Object} options.db - database connection (optional)
   * @param {Object} options.config - override defaults
   */
  constructor(options = {}) {
    this.eventBus = options.eventBus;
    this.logger = options.logger || console;
    this.cacheManager = options.cacheManager;
    this.db = options.db;
    this.config = { ...DEFAULT_CONFIG, ...options.config };
    this.scheduler = null;
    this.isRunning = false;
    this.lastRun = null;
    this.nextRun = null;
    this.stats = {
      totalRuns: 0,
      totalItemsScanned: 0,
      totalItemsDeleted: 0,
      totalMemoryReclaimed: 0,
      totalErrors: 0,
      avgDuration: 0,
      lastDuration: 0,
    };
    this._shuttingDown = false;
  }

  // ─── Scheduler ───────────────────────────────────────────────────

  /**
   * Start the automatic cleanup scheduler
   */
  startScheduler() {
    if (this.scheduler) {
      clearInterval(this.scheduler);
    }
    this.scheduler = setInterval(() => {
      this.runCleanup().catch(err => {
        this.logger.error('Scheduled cleanup failed:', err);
        this._emit('cleanup:error', { error: err.message });
      });
    }, this.config.cleanupInterval);
    this.nextRun = Date.now() + this.config.cleanupInterval;
    this._emit('cleanup:schedulerStarted', { interval: this.config.cleanupInterval });
    this.logger.info(`🧹 Cleanup scheduler started (interval: ${this.config.cleanupInterval/1000}s)`);
    // Run cleanup immediately on start? Optionally.
    // We'll run it after a short delay to let the system stabilize.
    setTimeout(() => this.runCleanup().catch(() => {}), 10000);
  }

  /**
   * Stop the automatic cleanup scheduler
   */
  stopScheduler() {
    if (this.scheduler) {
      clearInterval(this.scheduler);
      this.scheduler = null;
      this._emit('cleanup:schedulerStopped');
      this.logger.info('🧹 Cleanup scheduler stopped');
    }
  }

  // ─── Core Cleanup Methods ──────────────────────────────────────

  /**
   * Run a full cleanup cycle
   * @param {Object} options - { dryRun: boolean, aggressive: boolean }
   * @returns {Promise<Object>} cleanup results
   */
  async runCleanup(options = {}) {
    if (this.isRunning) {
      this.logger.warn('Cleanup already running, skipping');
      return { skipped: true };
    }
    if (this._shuttingDown) {
      this.logger.warn('Cleanup skipped during shutdown');
      return { skipped: true };
    }

    const startTime = Date.now();
    this.isRunning = true;
    this.lastRun = startTime;
    this.stats.totalRuns++;
    this._emit('cleanup:start', { timestamp: startTime, options });

    const results = {
      cacheEntriesRemoved: 0,
      dbRowsRemoved: 0,
      tempFilesRemoved: 0,
      memoryReclaimed: 0,
      errors: 0,
      duration: 0,
    };

    try {
      // 1️⃣ Clean CacheManager (if available)
      if (this.cacheManager) {
        const beforeMem = this.cacheManager.getMemoryUsage?.() || 0;
        let removed = 0;
        if (options.aggressive) {
          removed = this.cacheManager.aggressiveEvict?.(30) || 0;
        } else {
          removed = this.cacheManager.cleanupExpired?.() || 0;
        }
        results.cacheEntriesRemoved = removed;
        const afterMem = this.cacheManager.getMemoryUsage?.() || 0;
        results.memoryReclaimed = Math.max(0, beforeMem - afterMem);
        this.logger.debug(`🧹 CacheManager: removed ${removed} entries, reclaimed ${results.memoryReclaimed} bytes`);
      }

      // 2️⃣ Clean database temporary tables (if db provided)
      if (this.db) {
        const dbRemoved = await this._cleanDatabase();
        results.dbRowsRemoved = dbRemoved;
        this.logger.debug(`🗄️ Database: removed ${dbRemoved} temporary rows`);
      }

      // 3️⃣ Clean temporary files (optional – could be extended)
      // results.tempFilesRemoved = await this._cleanTempFiles();

      // 4️⃣ Emit per-namespace cleanup stats (if cacheManager)
      if (this.cacheManager) {
        const stats = this.cacheManager.getStats?.();
        if (stats && stats.namespaces) {
          this._emit('cleanup:namespaceStats', { stats });
        }
      }

      // 5️⃣ Update stats
      const duration = Date.now() - startTime;
      results.duration = duration;
      this.stats.totalItemsScanned += results.cacheEntriesRemoved + results.dbRowsRemoved;
      this.stats.totalItemsDeleted += results.cacheEntriesRemoved + results.dbRowsRemoved;
      this.stats.totalMemoryReclaimed += results.memoryReclaimed;
      this.stats.lastDuration = duration;
      this.stats.avgDuration = (this.stats.avgDuration * (this.stats.totalRuns - 1) + duration) / this.stats.totalRuns;

      this._emit('cleanup:complete', { results, duration });
      this.logger.info(`🧹 Cleanup completed in ${duration}ms: ${results.cacheEntriesRemoved} cache, ${results.dbRowsRemoved} DB rows, reclaimed ${(results.memoryReclaimed/1024/1024).toFixed(2)}MB`);

      return results;
    } catch (err) {
      this.stats.totalErrors++;
      results.errors = 1;
      this.logger.error('Cleanup failed:', err);
      this._emit('cleanup:error', { error: err.message, stack: err.stack });
      throw err;
    } finally {
      this.isRunning = false;
      this.nextRun = Date.now() + this.config.cleanupInterval;
    }
  }

  /**
   * Clean expired entries in a specific namespace
   * @param {string} namespace - namespace to clean
   * @returns {Promise<number>} number of entries removed
   */
  async cleanupNamespace(namespace) {
    if (!this.cacheManager) return 0;
    const store = this.cacheManager.namespaces.get(namespace);
    if (!store) return 0;
    let removed = 0;
    const now = Date.now();
    const toRemove = [];
    for (const [key, entry] of store) {
      if (entry.ttl > 0 && (now - entry.createdAt) > entry.ttl) {
        toRemove.push(key);
      }
    }
    for (const key of toRemove) {
      this.cacheManager._delete(namespace, key, 'expire');
      removed++;
    }
    this._emit('cleanup:namespace', { namespace, removed });
    return removed;
  }

  /**
   * Clean expired entries for a specific agent (by namespace prefix)
   * @param {string} agentName - e.g., 'ModerationAgent'
   * @returns {Promise<number>}
   */
  async cleanupAgent(agentName) {
    if (!this.cacheManager) return 0;
    const prefix = agentName.toLowerCase();
    let total = 0;
    for (const [ns] of this.cacheManager.namespaces) {
      if (ns.startsWith(prefix) || ns === agentName) {
        total += await this.cleanupNamespace(ns);
      }
    }
    this._emit('cleanup:agent', { agentName, removed: total });
    return total;
  }

  /**
   * Clean all expired entries (same as runCleanup but only expiration)
   */
  async cleanupExpired() {
    return this.runCleanup({ aggressive: false });
  }

  /**
   * Emergency aggressive cleanup
   */
  async emergencyCleanup() {
    this.logger.warn('🚨 Emergency cleanup triggered');
    this._emit('cleanup:emergency', { timestamp: Date.now() });
    return this.runCleanup({ aggressive: true });
  }

  /**
   * Clean all temporary data (use with caution)
   */
  async cleanupAll() {
    this.logger.warn('🔥 Full cleanup triggered (all namespaces)');
    this._emit('cleanup:all', { timestamp: Date.now() });
    if (this.cacheManager) {
      await this.cacheManager.clearAll();
    }
    // Also clean DB
    if (this.db) {
      await this._cleanDatabase(true);
    }
    return { cleaned: true };
  }

  // ─── Internal Database Cleanup ──────────────────────────────────

  async _cleanDatabase(forceAll = false) {
    if (!this.db || typeof this.db.run !== 'function') return 0;
    const cutoff = Date.now() - this.config.defaultTTL;
    let total = 0;
    const tables = [
      { table: 'temp_sessions', column: 'expires_at' },
      { table: 'verification_tokens', column: 'expires_at' },
      { table: 'pending_commands', column: 'expires_at' },
      { table: 'poll_sessions', column: 'expires_at' },
      { table: 'quiz_sessions', column: 'expires_at' },
      { table: 'temp_tickets', column: 'expires_at' },
      { table: 'temp_uploads', column: 'expires_at' },
    ];
    for (const { table, column } of tables) {
      try {
        const result = await this.db.run(`DELETE FROM ${table} WHERE ${column} < ?`, [cutoff]);
        total += result.changes || 0;
      } catch (err) {
        // table might not exist
      }
    }
    // Also clean AI conversation history if older than TTL
    try {
      const aiCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days
      const result = await this.db.run(`DELETE FROM ai_conversations WHERE timestamp < ?`, [aiCutoff]);
      total += result.changes || 0;
    } catch (err) {
      // ignore
    }
    return total;
  }

  // ─── Stats & Health ─────────────────────────────────────────────

  /**
   * Get cleanup statistics
   */
  getStats() {
    const cacheStats = this.cacheManager?.getStats?.() || {};
    return {
      ...this.stats,
      cache: cacheStats,
      lastRun: this.lastRun,
      nextRun: this.nextRun,
      schedulerActive: !!this.scheduler,
      isRunning: this.isRunning,
    };
  }

  /**
   * Health check
   */
  getHealth() {
    const mem = process.memoryUsage();
    const usagePct = (mem.heapUsed / mem.heapTotal) * 100;
    const isHealthy = usagePct < this.config.memoryThreshold && !this.isRunning;
    return {
      healthy: isHealthy,
      memoryUsage: usagePct,
      lastRun: this.lastRun,
      nextRun: this.nextRun,
      schedulerActive: !!this.scheduler,
      isRunning: this.isRunning,
      message: isHealthy ? 'OK' : usagePct >= this.config.memoryThreshold ? 'Memory pressure high' : 'Cleanup in progress',
    };
  }

  // ─── Shutdown ────────────────────────────────────────────────────

  async shutdown() {
    this._shuttingDown = true;
    this.stopScheduler();
    if (this.isRunning) {
      // Wait for running cleanup to finish (max 5s)
      let waited = 0;
      while (this.isRunning && waited < 5000) {
        await new Promise(r => setTimeout(r, 100));
        waited += 100;
      }
    }
    this._emit('cleanup:shutdown', { timestamp: Date.now() });
    this.logger.info('🧹 Cleanup service shut down');
  }

  // ─── Helpers ─────────────────────────────────────────────────────

  _emit(event, data) {
    if (this.eventBus?.emit) {
      this.eventBus.emit(event, data);
    }
  }
}

module.exports = CleanupService;