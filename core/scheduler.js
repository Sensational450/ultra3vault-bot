const cron = require('node-cron');

/**
 * Scheduler v6.0 – Memory‑Safe
 * - Cron and one‑time delayed jobs
 * - Pause / resume (global and per job)
 * - EventBus integration
 * - Retry logic for failed jobs
 * - Max runs limit
 * - Immediate execution option on registration
 * - Cleanup on retry exhaustion
 * - Periodic stale job cleanup
 * - Stats and job status
 */
class Scheduler {
  constructor(eventBus = null, logger = null, options = {}) {
    this.eventBus = eventBus;
    this.logger = logger || console;
    this.timezone = options.timezone || 'UTC';
    this.defaultRetries = options.defaultRetries || 0;
    this.jobs = new Map();       // id -> job metadata
    this.delayedJobs = new Map();
    this.globalPaused = false;
    this.stats = { totalJobs: 0, totalExecutions: 0, totalErrors: 0 };
    // Track failed jobs that are pending removal
    this._pendingRemovals = new Set();

    // Periodic cleanup of stale paused jobs (every hour)
    this._cleanupInterval = setInterval(() => this._cleanupStaleJobs(), 60 * 60 * 1000);
  }

  // ---------- Internal Helpers ----------
  _emit(event, data) {
    if (this.eventBus?.emit) this.eventBus.emit(event, data);
  }

  _cleanupStaleJobs() {
    const now = Date.now();
    const staleThreshold = 7 * 24 * 60 * 60 * 1000; // 7 days
    for (const [id, data] of this.jobs.entries()) {
      if (data.paused && data._pausedSince && (now - data._pausedSince) > staleThreshold) {
        this.logger.warn(`🧹 Removing stale paused job: ${id}`);
        this.removeJob(id);
      }
    }
  }

  async _executeJob(id, task, retryCount = 0) {
    const data = this.jobs.get(id);
    if (!data || data.running) {
      if (data?.running) this._emit('scheduler.job.skip', { id, reason: 'already running' });
      return;
    }
    data.running = true;
    this.stats.totalExecutions++;
    this._emit('scheduler.job.start', { id, timestamp: Date.now(), attempt: retryCount + 1 });

    try {
      await task();
      this._emit('scheduler.job.complete', { id, timestamp: Date.now() });
      data.failures = 0;
    } catch (err) {
      this.stats.totalErrors++;
      this.logger.error(`Scheduler: Job "${id}" failed:`, err);
      this._emit('scheduler.job.error', { id, error: err.message, stack: err.stack });

      data.failures = (data.failures || 0) + 1;
      const maxRetries = data.retries ?? this.defaultRetries;
      if (maxRetries > 0 && data.failures <= maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, data.failures), 30000);
        this.logger.warn(`⚠️ Job "${id}" failed, retrying in ${delay}ms (attempt ${data.failures}/${maxRetries})`);
        setTimeout(() => {
          if (!data.paused && !this.globalPaused) {
            this._executeJob(id, task, data.failures);
          }
        }, delay);
      } else {
        // ✅ FIX: Exhausted retries – remove the job
        this.logger.error(`❌ Job "${id}" exhausted all ${maxRetries} retries. Removing.`);
        this._emit('scheduler.job.aborted', { id, failures: data.failures });
        this.removeJob(id);
      }
    } finally {
      data.running = false;
      // If job is delayed, remove it (success or failure without retry)
      if (data.type === 'delayed') {
        // But only if it's not already removed (e.g., exhausted retries removed it)
        if (this.jobs.has(id)) {
          this.removeJob(id);
        }
      }
      if (data.maxRuns && data.runCount !== undefined) {
        data.runCount++;
        if (data.runCount >= data.maxRuns) {
          this.removeJob(id);
        }
      }
    }
  }

  // ---------- Public API ----------
  registerJob(id, cronExpression, task, options = {}) {
    if (this.jobs.has(id)) throw new Error(`Job "${id}" already exists.`);

    const {
      timezone = this.timezone,
      retries = this.defaultRetries,
      maxRuns = 0,
      runImmediately = false,
    } = options;

    const job = cron.schedule(cronExpression, async () => {
      if (this.globalPaused) return;
      const data = this.jobs.get(id);
      if (!data || data.paused) return;
      if (data.maxRuns && data.runCount >= data.maxRuns) {
        this.removeJob(id);
        return;
      }
      await this._executeJob(id, task);
    }, { scheduled: true, timezone });

    this.jobs.set(id, {
      job,
      cronExpression,
      task,
      running: false,
      paused: false,
      _pausedSince: null,
      type: 'cron',
      retries,
      maxRuns,
      runCount: 0,
      failures: 0,
    });
    this.stats.totalJobs++;
    this._emit('scheduler.job.registered', { id, cronExpression });

    if (runImmediately) {
      setImmediate(() => this._executeJob(id, task));
    }
    return id;
  }

  registerDelayedJob(id, delayMs, task, options = {}) {
    if (this.jobs.has(id) || this.delayedJobs.has(id)) throw new Error(`Job "${id}" already exists.`);

    const { retries = this.defaultRetries, maxRuns = 0 } = options;

    const timeout = setTimeout(async () => {
      if (this.globalPaused) return;
      const data = this.jobs.get(id);
      if (!data || data.paused) return;
      await this._executeJob(id, task);
      // _executeJob will remove it if type is delayed
    }, delayMs);

    this.delayedJobs.set(id, { timeout, task, paused: false });
    this.jobs.set(id, {
      job: null,
      cronExpression: null,
      task,
      running: false,
      paused: false,
      _pausedSince: null,
      type: 'delayed',
      delayMs,
      retries,
      maxRuns,
      runCount: 0,
      failures: 0,
    });
    this.stats.totalJobs++;
    this._emit('scheduler.job.registered', { id, type: 'delayed', delayMs });
    return id;
  }

  removeJob(id) {
    const data = this.jobs.get(id);
    if (data?.type === 'cron' && data.job) data.job.stop();
    this.jobs.delete(id);
    const delayed = this.delayedJobs.get(id);
    if (delayed) {
      clearTimeout(delayed.timeout);
      this.delayedJobs.delete(id);
    }
    this._emit('scheduler.job.removed', { id });
  }

  pauseJob(id) {
    const data = this.jobs.get(id);
    if (data) {
      data.paused = true;
      data._pausedSince = Date.now();
      if (data.type === 'cron' && data.job) data.job.stop();
    }
    const delayed = this.delayedJobs.get(id);
    if (delayed) {
      clearTimeout(delayed.timeout);
      delayed.paused = true;
    }
    this._emit('scheduler.job.paused', { id });
  }

  resumeJob(id) {
    const data = this.jobs.get(id);
    if (data) {
      data.paused = false;
      data._pausedSince = null;
      if (data.type === 'cron' && data.job) data.job.start();
      else if (data.type === 'delayed' && !data.running) {
        const delay = data.delayMs;
        this.removeJob(id);
        this.registerDelayedJob(id, delay, data.task, { retries: data.retries, maxRuns: data.maxRuns });
      }
    }
    this._emit('scheduler.job.resumed', { id });
  }

  pauseAll() {
    this.globalPaused = true;
    for (const [id, data] of this.jobs.entries()) {
      if (data.type === 'cron' && data.job) data.job.stop();
      data._pausedSince = Date.now();
    }
    for (const [id, delayed] of this.delayedJobs.entries()) {
      clearTimeout(delayed.timeout);
      delayed.paused = true;
    }
    this._emit('scheduler.all.paused');
  }

  resumeAll() {
    this.globalPaused = false;
    for (const [id, data] of this.jobs.entries()) {
      if (!data.paused && data.type === 'cron' && data.job) data.job.start();
      else if (data.paused && data.type === 'delayed') this.resumeJob(id);
      data._pausedSince = null;
    }
    this._emit('scheduler.all.resumed');
  }

  getJobStatus(id) {
    const data = this.jobs.get(id);
    if (!data) return null;
    return {
      id,
      type: data.type,
      paused: data.paused,
      running: data.running,
      cronExpression: data.cronExpression,
      delayMs: data.delayMs,
      retries: data.retries,
      failures: data.failures,
      maxRuns: data.maxRuns,
      runCount: data.runCount,
      pausedSince: data._pausedSince,
    };
  }

  listJobs() { return Array.from(this.jobs.keys()); }

  getStats() {
    return {
      ...this.stats,
      activeJobs: this.jobs.size,
      delayedJobs: this.delayedJobs.size,
      globalPaused: this.globalPaused,
      pendingRemovals: this._pendingRemovals.size,
    };
  }

  shutdown() {
    clearInterval(this._cleanupInterval);
    for (const [, data] of this.jobs.entries()) {
      if (data.type === 'cron' && data.job) data.job.stop();
    }
    for (const [, delayed] of this.delayedJobs.entries()) clearTimeout(delayed.timeout);
    this.jobs.clear();
    this.delayedJobs.clear();
    this._pendingRemovals.clear();
    this._emit('scheduler.shutdown');
  }
}

module.exports = { Scheduler };