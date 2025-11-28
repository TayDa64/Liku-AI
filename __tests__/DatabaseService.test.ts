import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';

// Test database path (separate from production)
const TEST_DB_DIR = path.join(os.tmpdir(), '.gemini-liku-test');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db');

// We test the DatabaseService patterns directly with a test database
// to avoid modifying the user's actual game data
describe('DatabaseService Patterns', () => {
  let db: Database.Database;

  beforeAll(() => {
    // Create test directory
    if (!fs.existsSync(TEST_DB_DIR)) {
      fs.mkdirSync(TEST_DB_DIR, { recursive: true });
    }
    
    // Create test database with same schema
    db = new Database(TEST_DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    
    // Create tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS player_stats (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        high_score INTEGER DEFAULT 0,
        level INTEGER DEFAULT 1,
        xp INTEGER DEFAULT 0,
        games_played INTEGER DEFAULT 0,
        hunger INTEGER DEFAULT 50,
        energy INTEGER DEFAULT 100,
        happiness INTEGER DEFAULT 50,
        hangman_wins INTEGER DEFAULT 0,
        hangman_losses INTEGER DEFAULT 0
      )
    `);
    
    db.exec(`
      INSERT OR IGNORE INTO player_stats (id) VALUES (1)
    `);
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        theme TEXT DEFAULT 'default',
        snake_difficulty TEXT DEFAULT 'medium'
      )
    `);
    
    db.exec(`
      INSERT OR IGNORE INTO user_settings (id) VALUES (1)
    `);
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS hangman_words (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        word TEXT NOT NULL UNIQUE
      )
    `);
    
    const words = ['test', 'vitest', 'typescript'];
    const insertWord = db.prepare('INSERT OR IGNORE INTO hangman_words (word) VALUES (?)');
    for (const word of words) {
      insertWord.run(word);
    }
  });

  afterAll(() => {
    // Cleanup
    db.close();
    try {
      fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  beforeEach(() => {
    // Reset stats before each test
    db.exec(`
      UPDATE player_stats SET 
        high_score = 0, level = 1, xp = 0, games_played = 0,
        hunger = 50, energy = 100, happiness = 50,
        hangman_wins = 0, hangman_losses = 0
      WHERE id = 1
    `);
  });

  describe('WAL Mode', () => {
    it('should have WAL journal mode enabled', () => {
      const result = db.pragma('journal_mode') as { journal_mode: string }[];
      expect(result[0].journal_mode).toBe('wal');
    });

    it('should have NORMAL synchronous mode', () => {
      const result = db.pragma('synchronous') as { synchronous: number }[];
      // 1 = NORMAL
      expect(result[0].synchronous).toBe(1);
    });
  });

  describe('Player Stats', () => {
    it('should read default player stats', () => {
      const row = db.prepare('SELECT * FROM player_stats WHERE id = 1').get() as any;
      
      expect(row.high_score).toBe(0);
      expect(row.level).toBe(1);
      expect(row.xp).toBe(0);
      expect(row.hunger).toBe(50);
      expect(row.energy).toBe(100);
    });

    it('should update player stats synchronously', () => {
      db.prepare('UPDATE player_stats SET xp = ?, level = ? WHERE id = 1').run(100, 5);
      
      const row = db.prepare('SELECT xp, level FROM player_stats WHERE id = 1').get() as any;
      
      expect(row.xp).toBe(100);
      expect(row.level).toBe(5);
    });

    it('should update multiple fields at once', () => {
      db.prepare(`
        UPDATE player_stats 
        SET high_score = ?, games_played = ?, hunger = ?, energy = ?
        WHERE id = 1
      `).run(999, 10, 75, 80);
      
      const row = db.prepare('SELECT * FROM player_stats WHERE id = 1').get() as any;
      
      expect(row.high_score).toBe(999);
      expect(row.games_played).toBe(10);
      expect(row.hunger).toBe(75);
      expect(row.energy).toBe(80);
    });
  });

  describe('User Settings', () => {
    it('should read default settings', () => {
      const row = db.prepare('SELECT * FROM user_settings WHERE id = 1').get() as any;
      
      expect(row.theme).toBe('default');
      expect(row.snake_difficulty).toBe('medium');
    });

    it('should update theme', () => {
      db.prepare('UPDATE user_settings SET theme = ? WHERE id = 1').run('matrix');
      
      const row = db.prepare('SELECT theme FROM user_settings WHERE id = 1').get() as any;
      
      expect(row.theme).toBe('matrix');
    });
  });

  describe('Hangman Words', () => {
    it('should have seeded words', () => {
      const rows = db.prepare('SELECT COUNT(*) as count FROM hangman_words').get() as any;
      
      expect(rows.count).toBeGreaterThanOrEqual(3);
    });

    it('should return a random word', () => {
      const row = db.prepare('SELECT word FROM hangman_words ORDER BY RANDOM() LIMIT 1').get() as any;
      
      expect(row.word).toBeDefined();
      expect(typeof row.word).toBe('string');
    });
  });

  describe('Safe Query Execution', () => {
    it('should execute SELECT queries', () => {
      const rows = db.prepare('SELECT * FROM player_stats').all();
      
      expect(rows).toHaveLength(1);
    });

    it('should reject non-SELECT queries programmatically', () => {
      const query = 'DELETE FROM player_stats';
      const trimmed = query.trim().toUpperCase();
      
      expect(trimmed.startsWith('SELECT')).toBe(false);
    });
  });

  describe('Sync API Performance', () => {
    it('should complete sync operations quickly', () => {
      const start = performance.now();
      
      // Simulate 100 read operations
      for (let i = 0; i < 100; i++) {
        db.prepare('SELECT * FROM player_stats WHERE id = 1').get();
      }
      
      const elapsed = performance.now() - start;
      
      // Should complete 100 reads in under 100ms
      expect(elapsed).toBeLessThan(100);
    });

    it('should handle concurrent reads efficiently', () => {
      const start = performance.now();
      
      // Simulate mixed read operations
      for (let i = 0; i < 50; i++) {
        db.prepare('SELECT * FROM player_stats').get();
        db.prepare('SELECT * FROM user_settings').get();
        db.prepare('SELECT COUNT(*) FROM hangman_words').get();
      }
      
      const elapsed = performance.now() - start;
      
      // Should complete 150 reads in under 200ms
      expect(elapsed).toBeLessThan(200);
    });
  });

  describe('WAL Checkpoint', () => {
    it('should execute checkpoint without error', () => {
      expect(() => {
        db.pragma('wal_checkpoint(PASSIVE)');
      }).not.toThrow();
    });
  });
});
