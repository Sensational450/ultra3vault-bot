/**
 * 🧪 Database Unit Tests v5.0
 * - Tests connection, queries, transactions, migrations
 * - Mocks sqlite3 and MigrationRunner
 */
const sqlite3 = require('sqlite3');
const { Database } = require('../../../tools/database/db');
const { MigrationRunner } = require('../../../tools/database/migrations');

jest.mock('sqlite3');
jest.mock('../../../tools/database/migrations', () => ({
  MigrationRunner: jest.fn().mockImplementation(() => ({
    up: jest.fn().mockResolvedValue(),
    down: jest.fn(),
    reset: jest.fn(),
  })),
}));

describe('Database', () => {
  let db;
  let mockDbInstance;
  let mockEventBus;
  let mockLogger;

  beforeEach(() => {
    jest.clearAllMocks();
    mockEventBus = { emit: jest.fn() };
    mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

    // Mock sqlite3.Database
    mockDbInstance = {
      run: jest.fn((sql, params, cb) => cb && cb(null)),
      get: jest.fn((sql, params, cb) => cb && cb(null, null)),
      all: jest.fn((sql, params, cb) => cb && cb(null, [])),
      exec: jest.fn((sql, cb) => cb && cb(null)),
      close: jest.fn((cb) => cb && cb(null)),
    };
    sqlite3.Database.mockImplementation((path, cb) => {
      cb(null);
      return mockDbInstance;
    });
  });

  describe('constructor', () => {
    it('should set default options', () => {
      db = new Database();
      expect(db.dbPath).toBe('./data.sqlite');
      expect(db.migrationsPath).toContain('tools/database/migrations');
      expect(db.isReady).toBe(false);
    });
  });

  describe('init', () => {
    it('should open database, enable foreign keys, run migrations', async () => {
      db = new Database({ eventBus: mockEventBus, logger: mockLogger });
      await db.init();
      expect(sqlite3.Database).toHaveBeenCalledWith(db.dbPath, expect.any(Function));
      expect(mockDbInstance.run).toHaveBeenCalledWith('PRAGMA foreign_keys = ON', expect.any(Function));
      expect(MigrationRunner).toHaveBeenCalled();
      expect(db.isReady).toBe(true);
      expect(mockEventBus.emit).toHaveBeenCalledWith('db.ready', { path: db.dbPath });
    });

    it('should reject on connection error', async () => {
      sqlite3.Database.mockImplementation((path, cb) => {
        cb(new Error('Connection failed'));
      });
      db = new Database();
      await expect(db.init()).rejects.toThrow('Connection failed');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('run method', () => {
    beforeEach(async () => {
      db = new Database({ eventBus: mockEventBus, logger: mockLogger });
      await db.init();
    });

    it('should execute a run query and return changes', async () => {
      mockDbInstance.run.mockImplementation((sql, params, cb) => {
        cb(null);
        this.changes = 1;
        this.lastID = 42;
      });
      const result = await db.run('INSERT INTO test (id) VALUES (?)', [1]);
      expect(result).toEqual({ changes: 1, lastID: 42 });
      expect(mockEventBus.emit).toHaveBeenCalledWith('db.query', expect.objectContaining({ sql: 'INSERT INTO test (id) VALUES (?)' }));
    });

    it('should reject on error', async () => {
      mockDbInstance.run.mockImplementation((sql, params, cb) => {
        cb(new Error('SQL error'));
      });
      await expect(db.run('SELECT * FROM test')).rejects.toThrow('SQL error');
      expect(mockEventBus.emit).toHaveBeenCalledWith('db.error', expect.objectContaining({ error: 'SQL error' }));
    });
  });

  describe('get method', () => {
    beforeEach(async () => {
      db = new Database({ eventBus: mockEventBus, logger: mockLogger });
      await db.init();
    });

    it('should return a single row', async () => {
      const row = { id: 1, name: 'test' };
      mockDbInstance.get.mockImplementation((sql, params, cb) => cb(null, row));
      const result = await db.get('SELECT * FROM test WHERE id = ?', [1]);
      expect(result).toEqual(row);
    });
  });

  describe('all method', () => {
    beforeEach(async () => {
      db = new Database({ eventBus: mockEventBus, logger: mockLogger });
      await db.init();
    });

    it('should return all rows', async () => {
      const rows = [{ id: 1 }, { id: 2 }];
      mockDbInstance.all.mockImplementation((sql, params, cb) => cb(null, rows));
      const result = await db.all('SELECT * FROM test');
      expect(result).toEqual(rows);
    });
  });

  describe('exec method', () => {
    beforeEach(async () => {
      db = new Database({ eventBus: mockEventBus, logger: mockLogger });
      await db.init();
    });

    it('should execute multiple SQL statements', async () => {
      mockDbInstance.exec.mockImplementation((sql, cb) => cb(null));
      await db.exec('CREATE TABLE test (id INT); INSERT INTO test VALUES (1)');
      expect(mockDbInstance.exec).toHaveBeenCalled();
    });
  });

  describe('transaction', () => {
    beforeEach(async () => {
      db = new Database({ eventBus: mockEventBus, logger: mockLogger });
      await db.init();
      mockDbInstance.run.mockImplementation((sql, params, cb) => cb(null));
    });

    it('should commit on success', async () => {
      const callback = jest.fn().mockResolvedValue('result');
      const result = await db.transaction(callback);
      expect(mockDbInstance.run).toHaveBeenCalledWith('BEGIN TRANSACTION', expect.any(Function));
      expect(callback).toHaveBeenCalledWith(db);
      expect(mockDbInstance.run).toHaveBeenCalledWith('COMMIT', expect.any(Function));
      expect(result).toBe('result');
    });

    it('should rollback on error', async () => {
      const callback = jest.fn().mockRejectedValue(new Error('Transaction error'));
      await expect(db.transaction(callback)).rejects.toThrow('Transaction error');
      expect(mockDbInstance.run).toHaveBeenCalledWith('ROLLBACK', expect.any(Function));
    });
  });

  describe('close', () => {
    beforeEach(async () => {
      db = new Database({ eventBus: mockEventBus, logger: mockLogger });
      await db.init();
    });

    it('should close the database connection', async () => {
      mockDbInstance.close.mockImplementation((cb) => cb(null));
      await db.close();
      expect(mockDbInstance.close).toHaveBeenCalled();
      expect(db.isReady).toBe(false);
      expect(mockEventBus.emit).toHaveBeenCalledWith('db.closed');
    });

    it('should log error on close failure', async () => {
      mockDbInstance.close.mockImplementation((cb) => cb(new Error('Close error')));
      await expect(db.close()).rejects.toThrow('Close error');
    });
  });
});
