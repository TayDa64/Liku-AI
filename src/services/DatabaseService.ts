import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';

const DB_DIR = path.join(os.homedir(), '.gemini-liku');
const DB_PATH = path.join(DB_DIR, 'snake.db');

if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
}

export interface PlayerStats {
    highScore: number;
    level: number;
    xp: number;
    gamesPlayed: number;
    hunger: number;
    energy: number;
    happiness: number;
}

export interface UserSettings {
    theme: 'default' | 'matrix' | 'cyberpunk' | 'retro';
    snakeDifficulty: 'easy' | 'medium' | 'hard';
}

export interface ProTokens {
    userId: string;
    balance: number;
    lastReset: string;
}

export interface GameRegistryEntry {
    id: string;
    name: string;
    description: string | null;
    filePath: string;
    createdAt: string;
}

export interface LeaderboardEntry {
    gameId: string;
    userId: string;
    score: number;
    metaData: string; // JSON string
}

class DatabaseService {
    private db: sqlite3.Database;
    private initPromise: Promise<void>;

    constructor() {
        this.db = new sqlite3.Database(DB_PATH);
        this.initPromise = this.init();
    }

    private init(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                // Player Stats Table
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS player_stats (
                        id INTEGER PRIMARY KEY CHECK (id = 1),
                        high_score INTEGER DEFAULT 0,
                        level INTEGER DEFAULT 1,
                        xp INTEGER DEFAULT 0,
                        games_played INTEGER DEFAULT 0
                    )
                `);

                // ... existing migrations for player_stats ...
                const columns = [
                    'ALTER TABLE player_stats ADD COLUMN hunger INTEGER DEFAULT 50',
                    'ALTER TABLE player_stats ADD COLUMN energy INTEGER DEFAULT 100',
                    'ALTER TABLE player_stats ADD COLUMN happiness INTEGER DEFAULT 50'
                ];
                columns.forEach(query => {
                    this.db.run(query, () => {}); 
                });

                this.db.run(`
                    INSERT OR IGNORE INTO player_stats (id, high_score, level, xp, games_played, hunger, energy, happiness)
                    VALUES (1, 0, 1, 0, 0, 50, 100, 50)
                `);

                // User Settings Table
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS user_settings (
                        id INTEGER PRIMARY KEY CHECK (id = 1),
                        theme TEXT DEFAULT 'default',
                        snake_difficulty TEXT DEFAULT 'medium'
                    )
                `);

                this.db.run(`
                    INSERT OR IGNORE INTO user_settings (id, theme, snake_difficulty)
                    VALUES (1, 'default', 'medium')
                `);

                // Pro Tokens Table (Economy System)
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS pro_tokens (
                        user_id TEXT PRIMARY KEY,
                        balance INTEGER DEFAULT 10000,
                        last_reset DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `);

                this.db.run(`
                    INSERT OR IGNORE INTO pro_tokens (user_id, balance)
                    VALUES ('me', 10000)
                `);

                // Game Registry Table (Dynamic Games)
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS game_registry (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        description TEXT,
                        file_path TEXT NOT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `);

                // Universal Leaderboard (Relational)
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS leaderboards (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        game_id TEXT,
                        user_id TEXT,
                        score INTEGER,
                        meta_data TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY(game_id) REFERENCES game_registry(id)
                    )
                `, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        });
    }

    public async getStats(): Promise<PlayerStats> {
        await this.initPromise;
        return new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM player_stats WHERE id = 1', (err, row: any) => {
                if (err) reject(err);
                else {
                    resolve({
                        highScore: row.high_score,
                        level: row.level,
                        xp: row.xp,
                        gamesPlayed: row.games_played,
                        hunger: row.hunger ?? 50,
                        energy: row.energy ?? 100,
                        happiness: row.happiness ?? 50
                    });
                }
            });
        });
    }

    public async getSettings(): Promise<UserSettings> {
        await this.initPromise;
        return new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM user_settings WHERE id = 1', (err, row: any) => {
                if (err) reject(err);
                else {
                    resolve({
                        theme: row.theme,
                        snakeDifficulty: row.snake_difficulty
                    });
                }
            });
        });
    }

    public async updateSettings(settings: Partial<UserSettings>): Promise<void> {
        await this.initPromise;
        return new Promise((resolve, reject) => {
            const fields = [];
            const values = [];

            if (settings.theme !== undefined) {
                fields.push('theme = ?');
                values.push(settings.theme);
            }
            if (settings.snakeDifficulty !== undefined) {
                fields.push('snake_difficulty = ?');
                values.push(settings.snakeDifficulty);
            }

            if (fields.length === 0) {
                resolve();
                return;
            }

            const query = `UPDATE user_settings SET ${fields.join(', ')} WHERE id = 1`;
            this.db.run(query, values, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    public async updateStats(stats: Partial<PlayerStats>): Promise<void> {
        await this.initPromise;
        return new Promise((resolve, reject) => {
            const fields = [];
            const values = [];

            if (stats.highScore !== undefined) {
                fields.push('high_score = ?');
                values.push(stats.highScore);
            }
            if (stats.level !== undefined) {
                fields.push('level = ?');
                values.push(stats.level);
            }
            if (stats.xp !== undefined) {
                fields.push('xp = ?');
                values.push(stats.xp);
            }
            if (stats.gamesPlayed !== undefined) {
                fields.push('games_played = ?');
                values.push(stats.gamesPlayed);
            }
            if (stats.hunger !== undefined) {
                fields.push('hunger = ?');
                values.push(stats.hunger);
            }
            if (stats.energy !== undefined) {
                fields.push('energy = ?');
                values.push(stats.energy);
            }
            if (stats.happiness !== undefined) {
                fields.push('happiness = ?');
                values.push(stats.happiness);
            }

            if (fields.length === 0) {
                resolve();
                return;
            }

            const query = `UPDATE player_stats SET ${fields.join(', ')} WHERE id = 1`;
            this.db.run(query, values, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    // Pro Tokens Methods
    public async getProTokens(userId: string = 'me'): Promise<ProTokens> {
        await this.initPromise;
        return new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM pro_tokens WHERE user_id = ?', [userId], (err, row: any) => {
                if (err) reject(err);
                else if (row) {
                    resolve({
                        userId: row.user_id,
                        balance: row.balance,
                        lastReset: row.last_reset
                    });
                } else {
                    // Create default entry if not exists
                    this.db.run('INSERT INTO pro_tokens (user_id, balance) VALUES (?, 10000)', [userId], (insertErr) => {
                        if (insertErr) reject(insertErr);
                        else resolve({ userId, balance: 10000, lastReset: new Date().toISOString() });
                    });
                }
            });
        });
    }

    public async updateProTokens(userId: string, balance: number): Promise<void> {
        await this.initPromise;
        return new Promise((resolve, reject) => {
            this.db.run('UPDATE pro_tokens SET balance = ? WHERE user_id = ?', [balance, userId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    // Game Registry Methods
    public async registerGame(game: Omit<GameRegistryEntry, 'createdAt'>): Promise<void> {
        await this.initPromise;
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT INTO game_registry (id, name, description, file_path) VALUES (?, ?, ?, ?)',
                [game.id, game.name, game.description, game.filePath],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    public async getRegisteredGames(): Promise<GameRegistryEntry[]> {
        await this.initPromise;
        return new Promise((resolve, reject) => {
            this.db.all('SELECT * FROM game_registry ORDER BY created_at DESC', (err, rows: any[]) => {
                if (err) reject(err);
                else {
                    resolve(rows.map(row => ({
                        id: row.id,
                        name: row.name,
                        description: row.description,
                        filePath: row.file_path,
                        createdAt: row.created_at
                    })));
                }
            });
        });
    }

    public async getGameById(id: string): Promise<GameRegistryEntry | null> {
        await this.initPromise;
        return new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM game_registry WHERE id = ?', [id], (err, row: any) => {
                if (err) reject(err);
                else if (row) {
                    resolve({
                        id: row.id,
                        name: row.name,
                        description: row.description,
                        filePath: row.file_path,
                        createdAt: row.created_at
                    });
                } else {
                    resolve(null);
                }
            });
        });
    }

    // Leaderboard Methods
    public async addLeaderboardEntry(entry: Omit<LeaderboardEntry, 'id' | 'createdAt'>): Promise<void> {
        await this.initPromise;
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT INTO leaderboards (game_id, user_id, score, meta_data) VALUES (?, ?, ?, ?)',
                [entry.gameId, entry.userId, entry.score, entry.metaData],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    public async getLeaderboard(gameId: string, limit: number = 10): Promise<LeaderboardEntry[]> {
        await this.initPromise;
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT * FROM leaderboards WHERE game_id = ? ORDER BY score DESC LIMIT ?',
                [gameId, limit],
                (err, rows: any[]) => {
                    if (err) reject(err);
                    else {
                        resolve(rows.map(row => ({
                            gameId: row.game_id,
                            userId: row.user_id,
                            score: row.score,
                            metaData: row.meta_data
                        })));
                    }
                }
            );
        });
    }

    // Expose database instance for advanced queries (read-only tool access)
    public getDbInstance(): sqlite3.Database {
        return this.db;
    }

    // Safe query execution for AI tools (read-only)
    public async executeSafeQuery(query: string): Promise<any[]> {
        await this.initPromise;
        
        // Security check: only allow SELECT queries
        const trimmedQuery = query.trim().toUpperCase();
        if (!trimmedQuery.startsWith('SELECT')) {
            throw new Error('Only SELECT queries are allowed for safety');
        }

        return new Promise((resolve, reject) => {
            this.db.all(query, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    }
}

export const db = new DatabaseService();
