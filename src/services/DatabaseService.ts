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
}

export const db = new DatabaseService();
