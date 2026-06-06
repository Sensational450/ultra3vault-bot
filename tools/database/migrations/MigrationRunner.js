/**
 * 🏃 MigrationRunner v5.0
 * - Runs SQL migration files in order (supports up/down)
 * - Tracks applied migrations in a `migrations` table
 * - Designed for `tools/database/migrations/`
 */
const fs = require('fs').promises;
const path = require('path');

class MigrationRunner {
  constructor(db, options = {}) {
    this.db = db;
    this.eventBus = options.eventBus || null;
    this.logger = options.logger || console;
    this.migrationsPath = options.migrationsPath || path.join(__dirname); // default to current folder
  }

  _emit(event, data) {
    if (this.eventBus?.emit) this.eventBus.emit(event, data);
  }

  async _ensureMigrationsTable() {
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS migrations (
        name TEXT PRIMARY KEY,
        applied_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);
  }

  async _getAppliedMigrations() {
    const rows = await this.db.all(`SELECT name FROM migrations ORDER BY name`);
    return rows.map(row => row.name);
  }

  async _getMigrationFiles() {
    try {
      const files = await fs.readdir(this.migrationsPath);
      return files.filter(f => f.endsWith('.sql') && !f.includes('_down')).sort();
    } catch (err) {
      if (err.code === 'ENOENT') {
        this.logger.warn(`⚠️ Migrations folder not found: ${this.migrationsPath}`);
        return [];
      }
      throw err;
    }
  }

  async _runMigration(fileName) {
    const filePath = path.join(this.migrationsPath, fileName);
    const sql = await fs.readFile(filePath, 'utf8');
    this.logger.info(`📦 Running migration: ${fileName}`);
    await this.db.exec(sql);
    await this.db.run(`INSERT INTO migrations (name) VALUES (?)`, [fileName]);
    this.logger.info(`✅ Applied migration: ${fileName}`);
    this._emit('migration.applied', { name: fileName });
  }

  async up() {
    await this._ensureMigrationsTable();
    const applied = await this._getAppliedMigrations();
    const files = await this._getMigrationFiles();

    for (const file of files) {
      if (!applied.includes(file)) {
        await this._runMigration(file);
      }
    }

    if (files.length === applied.length) {
      this.logger.info('📭 No pending migrations');
    }
    this._emit('migrations.complete', { total: files.length, applied: files.length - applied.length });
  }

  async down(steps = 1) {
    await this._ensureMigrationsTable();
    const applied = await this._getAppliedMigrations();
    if (applied.length === 0) {
      this.logger.warn('⚠️ No migrations to rollback');
      return;
    }
    const toRollback = applied.slice(-steps);
    for (const name of toRollback.reverse()) {
      const downFile = name.replace('.sql', '_down.sql');
      const downPath = path.join(this.migrationsPath, downFile);
      try {
        const sql = await fs.readFile(downPath, 'utf8');
        await this.db.exec(sql);
        await this.db.run(`DELETE FROM migrations WHERE name = ?`, [name]);
        this.logger.info(`⏪ Rolled back migration: ${name}`);
        this._emit('migration.rolledback', { name });
      } catch (err) {
        this.logger.error(`❌ Rollback failed for ${name}: ${err.message}`);
        throw err;
      }
    }
  }

  async reset() {
    const applied = await this._getAppliedMigrations();
    await this.down(applied.length);
    await this.up();
  }
}

module.exports = MigrationRunner;
