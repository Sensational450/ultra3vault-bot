const cron = require('node-cron');

/**
 * Scheduler v5.0
 * - Cron and one‑time delayed jobs
 * - Pause / resume (global and per job)
 * - EventBus integration
 * - Stats
 */
class Scheduler {
  constructor(eventBus = null, logger = null, options = {}) {
    this.eventBus = eventBus;
    this.logger = logger || console;
    this.timezone = options.timezone || 'UTC';
    this.jobs = new Map();
    this.delayedJobs = new Map();
    this.globalPaused = false;
    this.stats = { totalJobs: 0, totalExecutions: 0, totalErrors: 0 };
  }

  registerJob(id, cronExpression, task, options = {}) {
    if (this.jobs.has(id)) throw new Error(`Job "${id}" already exists.`);
    const job = cron.schedule(cronExpression, async () => {
      if (this.globalPaused) return;
      const data = this.jobs.get(id);
      if (!data || data.paused) return;
      await this._executeJob(id, task);
    }, { scheduled: true, timezone: options.timezone || this.timezone });
    this.jobs.set(id, { job, cronExpression, task, running: false, paused: false, type: 'cron', options });
    this.stats.totalJobs++;
    this._emit('scheduler.job.registered', { id, cronExpression });
    return id;
  }

  registerDelayedJob(id, delayMs, task) {
    if (this.jobs.has(id) || this.delayedJobs.has(id)) throw new Error(`Job "${id}" already exists.`);
    const timeout = setTimeout(async () => {
      if (this.globalPaused) return;
      await this._executeJob(id, task);
      this.delayedJobs.delete(id);
      this.jobs.delete(id);
    }, delayMs);
    this.delayedJobs.set(id, { timeout, task });
    this.jobs.set(id, { job: null, cronExpression: null, task, running: false, paused: false, type: 'delayed', delayMs });
    this.stats.totalJobs++;
    this._emit('scheduler.job.registered', { id, type: 'delayed', delayMs });
    return id;
  }

  async _executeJob(id, task) {
    const data = this.jobs.get(id);
    if (!data || data.running) {
      if (data?.running) this._emit('scheduler.job.skip', { id, reason: 'already running' });
      return;
    }
    data.running = true;
    this.stats.totalExecutions++;
    this._emit('scheduler.job.start', { id, timestamp: Date.now() });
    try {
      await task();
      this._emit('scheduler.job.complete', { id, timestamp: Date.now() });
    } catch (err) {
      this.stats.totalErrors++;
      this.logger.error(`Scheduler: Job "${id}" failed:`, err);
      this._emit('scheduler.job.error', { id, error: err.message, stack: err.stack });
    } finally {
      data.running = false;
      if (data.type === 'delayed') this.removeJob(id);
    }
  }

  removeJob(id) {
    const data = this.jobs.get(id);
    if (data?.type === 'cron' && data.job) data.job.stop();
    this.jobs.delete(id);
    const delayed = this.delayedJobs.get(id);
    if (delayed) clearTimeout(delayed.timeout);
    this.delayedJobs.delete(id);
    this._emit('scheduler.job.removed', { id });
  }

  pauseJob(id) {
    const data = this.jobs.get(id);
    if (data) {
      data.paused = true;
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
      if (data.type === 'cron' && data.job) data.job.start();
      else if (data.type === 'delayed' && !data.running) {
        const delay = data.delayMs;
        this.removeJob(id);
        this.registerDelayedJob(id, delay, data.task);
      }
    }
    this._emit('scheduler.job.resumed', { id });
  }

  pauseAll() {
    this.globalPaused = true;
    for (const [id, data] of this.jobs.entries()) {
      if (data.type === 'cron' && data.job) data.job.stop();
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
    };
  }

  listJobs() { return Array.from(this.jobs.keys()); }

  getStats() {
    return {
      ...this.stats,
      activeJobs: this.jobs.size,
      delayedJobs: this.delayedJobs.size,
      globalPaused: this.globalPaused,
    };
  }

  shutdown() {
    for (const [, data] of this.jobs.entries()) {
      if (data.type === 'cron' && data.job) data.job.stop();
    }
    for (const [, delayed] of this.delayedJobs.entries()) clearTimeout(delayed.timeout);
    this.jobs.clear();
    this.delayedJobs.clear();
    this._emit('scheduler.shutdown');
  }

  _emit(event, data) {
    if (this.eventBus?.emit) this.eventBus.emit(event, data);
  }
}

module.exports = { Scheduler };