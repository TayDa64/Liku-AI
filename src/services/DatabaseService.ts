import Database from 'better-sqlite3';
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
    hangman_wins: number;
    hangman_losses: number;
}

export interface UserSettings {
    theme: 'default' | 'matrix' | 'cyberpunk' | 'retro';
    snakeDifficulty: 'easy' | 'medium' | 'hard' | 'ai';
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

// Liku Learn Types
export interface LearnSettings {
    enabled: boolean;
    hintStyle: 'progressive' | 'direct';
    saveHistory: boolean;
    maxHistoryItems: number;
    safeSearch: boolean;
    maxSearchResults: number;
    codebaseScope: 'likubuddy' | 'custom' | 'gemini';
    customCodebasePath?: string;
    wolframAppId?: string;
    showSources: boolean;
    showConfidence: boolean;
}

export interface LearnHistoryEntry {
    id: number;
    query: string;
    queryType: string;
    response: string;
    sources: string | null;
    isFavorite: boolean;
    createdAt: string;
}

class DatabaseService {
    private db: Database.Database;
    private initialized: boolean = false;

    constructor() {
        this.db = new Database(DB_PATH);
        // Enable WAL mode for better concurrency (reads during writes)
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('synchronous = NORMAL'); // Balanced perf/safety
        this.init();
    }

    private init(): void {
        if (this.initialized) return;
        
        // Player Stats Table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS player_stats (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                high_score INTEGER DEFAULT 0,
                level INTEGER DEFAULT 1,
                xp INTEGER DEFAULT 0,
                games_played INTEGER DEFAULT 0
            )
        `);

        // Add new columns if they don't exist (migrations)
        const columns = [
            { name: 'hunger', sql: 'ALTER TABLE player_stats ADD COLUMN hunger INTEGER DEFAULT 50' },
            { name: 'energy', sql: 'ALTER TABLE player_stats ADD COLUMN energy INTEGER DEFAULT 100' },
            { name: 'happiness', sql: 'ALTER TABLE player_stats ADD COLUMN happiness INTEGER DEFAULT 50' },
            { name: 'hangman_wins', sql: 'ALTER TABLE player_stats ADD COLUMN hangman_wins INTEGER DEFAULT 0' },
            { name: 'hangman_losses', sql: 'ALTER TABLE player_stats ADD COLUMN hangman_losses INTEGER DEFAULT 0' }
        ];

        // Check existing columns
        const tableInfo = this.db.prepare('PRAGMA table_info(player_stats)').all() as { name: string }[];
        const existingColumns = new Set(tableInfo.map(col => col.name));

        for (const col of columns) {
            if (!existingColumns.has(col.name)) {
                try {
                    this.db.exec(col.sql);
                } catch {
                    // Column might already exist
                }
            }
        }

        // Insert default row if not exists
        this.db.exec(`
            INSERT OR IGNORE INTO player_stats (id, high_score, level, xp, games_played, hunger, energy, happiness, hangman_wins, hangman_losses)
            VALUES (1, 0, 1, 0, 0, 50, 100, 50, 0, 0)
        `);

        // User Settings Table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS user_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                theme TEXT DEFAULT 'default',
                snake_difficulty TEXT DEFAULT 'medium'
            )
        `);

        this.db.exec(`
            INSERT OR IGNORE INTO user_settings (id, theme, snake_difficulty)
            VALUES (1, 'default', 'medium')
        `);

        // Hangman Words Table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS hangman_words (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                word TEXT NOT NULL UNIQUE
            )
        `);

        // Seed Hangman words
        const words = ['react', 'typescript', 'javascript', 'nodejs', 'gemini', 'python', 'docker', 'database', 'component', 'interface'];
        const insertWord = this.db.prepare('INSERT OR IGNORE INTO hangman_words (word) VALUES (?)');
        for (const word of words) {
            insertWord.run(word);
        }

        // Pro Tokens Table (Economy System)
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS pro_tokens (
                user_id TEXT PRIMARY KEY,
                balance INTEGER DEFAULT 10000,
                last_reset DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        this.db.exec(`
            INSERT OR IGNORE INTO pro_tokens (user_id, balance)
            VALUES ('me', 10000)
        `);

        // Game Registry Table (Dynamic Games)
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS game_registry (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                file_path TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Universal Leaderboard (Relational)
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS leaderboards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id TEXT,
                user_id TEXT,
                score INTEGER,
                meta_data TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(game_id) REFERENCES game_registry(id)
            )
        `);

        // Liku Learn - Research History Table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS learn_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                query TEXT NOT NULL,
                query_type TEXT NOT NULL,
                response TEXT NOT NULL,
                sources TEXT,
                is_favorite INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Liku Learn - Settings Table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS learn_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                enabled INTEGER DEFAULT 1,
                hint_style TEXT DEFAULT 'progressive',
                save_history INTEGER DEFAULT 1,
                max_history_items INTEGER DEFAULT 100,
                safe_search INTEGER DEFAULT 1,
                max_search_results INTEGER DEFAULT 5,
                codebase_scope TEXT DEFAULT 'likubuddy',
                custom_codebase_path TEXT,
                wolfram_app_id TEXT,
                show_sources INTEGER DEFAULT 1,
                show_confidence INTEGER DEFAULT 0
            )
        `);

        this.db.exec(`
            INSERT OR IGNORE INTO learn_settings (id) VALUES (1)
        `);

        this.initialized = true;
    }

    /**
     * Run a WAL checkpoint to prevent bloat during frequent polling
     */
    public checkpoint(): void {
        try {
            this.db.pragma('wal_checkpoint(PASSIVE)');
        } catch {
            // Ignore checkpoint errors
        }
    }

    // Sync methods returning promises for backward compatibility
    public async getStats(): Promise<PlayerStats> {
        const row = this.db.prepare('SELECT * FROM player_stats WHERE id = 1').get() as any;
        return {
            highScore: row.high_score,
            level: row.level,
            xp: row.xp,
            gamesPlayed: row.games_played,
            hunger: row.hunger ?? 50,
            energy: row.energy ?? 100,
            happiness: row.happiness ?? 50,
            hangman_wins: row.hangman_wins ?? 0,
            hangman_losses: row.hangman_losses ?? 0
        };
    }

    /**
     * Sync version of getStats for polling scenarios
     */
    public getStatsSync(): PlayerStats {
        const row = this.db.prepare('SELECT * FROM player_stats WHERE id = 1').get() as any;
        return {
            highScore: row.high_score,
            level: row.level,
            xp: row.xp,
            gamesPlayed: row.games_played,
            hunger: row.hunger ?? 50,
            energy: row.energy ?? 100,
            happiness: row.happiness ?? 50,
            hangman_wins: row.hangman_wins ?? 0,
            hangman_losses: row.hangman_losses ?? 0
        };
    }

    public async getSettings(): Promise<UserSettings> {
        const row = this.db.prepare('SELECT * FROM user_settings WHERE id = 1').get() as any;
        return {
            theme: row.theme,
            snakeDifficulty: row.snake_difficulty
        };
    }

    public getSettingsSync(): UserSettings {
        const row = this.db.prepare('SELECT * FROM user_settings WHERE id = 1').get() as any;
        return {
            theme: row.theme,
            snakeDifficulty: row.snake_difficulty
        };
    }

    public async updateSettings(settings: Partial<UserSettings>): Promise<void> {
        const fields: string[] = [];
        const values: any[] = [];

        if (settings.theme !== undefined) {
            fields.push('theme = ?');
            values.push(settings.theme);
        }
        if (settings.snakeDifficulty !== undefined) {
            fields.push('snake_difficulty = ?');
            values.push(settings.snakeDifficulty);
        }

        if (fields.length === 0) return;

        const query = `UPDATE user_settings SET ${fields.join(', ')} WHERE id = 1`;
        this.db.prepare(query).run(...values);
    }

    public async updateStats(stats: Partial<PlayerStats>): Promise<void> {
        const fields: string[] = [];
        const values: any[] = [];

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
        if (stats.hangman_wins !== undefined) {
            fields.push('hangman_wins = ?');
            values.push(stats.hangman_wins);
        }
        if (stats.hangman_losses !== undefined) {
            fields.push('hangman_losses = ?');
            values.push(stats.hangman_losses);
        }

        if (fields.length === 0) return;

        const query = `UPDATE player_stats SET ${fields.join(', ')} WHERE id = 1`;
        this.db.prepare(query).run(...values);
        
        // Checkpoint to prevent WAL bloat on frequent updates
        this.checkpoint();
    }

    // Pro Tokens Methods
    public async getProTokens(userId: string = 'me'): Promise<ProTokens> {
        let row = this.db.prepare('SELECT * FROM pro_tokens WHERE user_id = ?').get(userId) as any;
        
        if (!row) {
            // Create default entry if not exists
            this.db.prepare('INSERT INTO pro_tokens (user_id, balance) VALUES (?, 10000)').run(userId);
            return { userId, balance: 10000, lastReset: new Date().toISOString() };
        }

        return {
            userId: row.user_id,
            balance: row.balance,
            lastReset: row.last_reset
        };
    }

    public async updateProTokens(userId: string, balance: number): Promise<void> {
        this.db.prepare('UPDATE pro_tokens SET balance = ? WHERE user_id = ?').run(balance, userId);
    }

    // Game Registry Methods
    public async registerGame(game: Omit<GameRegistryEntry, 'createdAt'>): Promise<void> {
        this.db.prepare(
            'INSERT OR REPLACE INTO game_registry (id, name, description, file_path) VALUES (?, ?, ?, ?)'
        ).run(game.id, game.name, game.description, game.filePath);
    }

    public async getRegisteredGames(): Promise<GameRegistryEntry[]> {
        const rows = this.db.prepare('SELECT * FROM game_registry ORDER BY created_at DESC').all() as any[];
        return rows.map(row => ({
            id: row.id,
            name: row.name,
            description: row.description,
            filePath: row.file_path,
            createdAt: row.created_at
        }));
    }

    public async getGameById(id: string): Promise<GameRegistryEntry | null> {
        const row = this.db.prepare('SELECT * FROM game_registry WHERE id = ?').get(id) as any;
        if (!row) return null;
        
        return {
            id: row.id,
            name: row.name,
            description: row.description,
            filePath: row.file_path,
            createdAt: row.created_at
        };
    }

    public async registerHangmanGame(): Promise<void> {
        const hangmanGame = {
            id: 'hangman',
            name: 'Hangman',
            description: 'Guess the word before you run out of attempts!',
            filePath: './games/Hangman.js'
        };
        return this.registerGame(hangmanGame);
    }

    // Leaderboard Methods
    public async addLeaderboardEntry(entry: Omit<LeaderboardEntry, 'id' | 'createdAt'>): Promise<void> {
        this.db.prepare(
            'INSERT INTO leaderboards (game_id, user_id, score, meta_data) VALUES (?, ?, ?, ?)'
        ).run(entry.gameId, entry.userId, entry.score, entry.metaData);
    }

    public async getLeaderboard(gameId: string, limit: number = 10): Promise<LeaderboardEntry[]> {
        const rows = this.db.prepare(
            'SELECT * FROM leaderboards WHERE game_id = ? ORDER BY score DESC LIMIT ?'
        ).all(gameId, limit) as any[];
        
        return rows.map(row => ({
            gameId: row.game_id,
            userId: row.user_id,
            score: row.score,
            metaData: row.meta_data
        }));
    }

    // Expose database instance for advanced queries
    public getDbInstance(): Database.Database {
        return this.db;
    }

    // Safe query execution for AI tools (read-only)
    public async executeSafeQuery(query: string): Promise<any[]> {
        // Security check: only allow SELECT queries
        const trimmedQuery = query.trim().toUpperCase();
        if (!trimmedQuery.startsWith('SELECT')) {
            throw new Error('Only SELECT queries are allowed for safety');
        }

        return this.db.prepare(query).all();
    }

    /**
     * Sync version for read-only queries
     */
    public executeSafeQuerySync(query: string): any[] {
        const trimmedQuery = query.trim().toUpperCase();
        if (!trimmedQuery.startsWith('SELECT')) {
            throw new Error('Only SELECT queries are allowed for safety');
        }
        return this.db.prepare(query).all();
    }

    // Get a random hangman word
    public async getRandomHangmanWord(): Promise<string> {
        const row = this.db.prepare('SELECT word FROM hangman_words ORDER BY RANDOM() LIMIT 1').get() as any;
        if (!row) {
            throw new Error('No words found in hangman_words table.');
        }
        return row.word;
    }

    public getRandomHangmanWordSync(): string {
        const row = this.db.prepare('SELECT word FROM hangman_words ORDER BY RANDOM() LIMIT 1').get() as any;
        if (!row) {
            throw new Error('No words found in hangman_words table.');
        }
        return row.word;
    }

    // ============================================================================
    // Liku Learn Methods
    // ============================================================================

    /**
     * Get Liku Learn settings
     */
    public async getLearnSettings(): Promise<LearnSettings> {
        const row = this.db.prepare('SELECT * FROM learn_settings WHERE id = 1').get() as any;
        return {
            enabled: !!row.enabled,
            hintStyle: row.hint_style as 'progressive' | 'direct',
            saveHistory: !!row.save_history,
            maxHistoryItems: row.max_history_items,
            safeSearch: !!row.safe_search,
            maxSearchResults: row.max_search_results,
            codebaseScope: row.codebase_scope as 'likubuddy' | 'custom' | 'gemini',
            customCodebasePath: row.custom_codebase_path,
            wolframAppId: row.wolfram_app_id,
            showSources: !!row.show_sources,
            showConfidence: !!row.show_confidence,
        };
    }

    /**
     * Update Liku Learn settings
     */
    public async updateLearnSettings(settings: Partial<LearnSettings>): Promise<void> {
        const fields: string[] = [];
        const values: any[] = [];

        if (settings.enabled !== undefined) {
            fields.push('enabled = ?');
            values.push(settings.enabled ? 1 : 0);
        }
        if (settings.hintStyle !== undefined) {
            fields.push('hint_style = ?');
            values.push(settings.hintStyle);
        }
        if (settings.saveHistory !== undefined) {
            fields.push('save_history = ?');
            values.push(settings.saveHistory ? 1 : 0);
        }
        if (settings.maxHistoryItems !== undefined) {
            fields.push('max_history_items = ?');
            values.push(settings.maxHistoryItems);
        }
        if (settings.safeSearch !== undefined) {
            fields.push('safe_search = ?');
            values.push(settings.safeSearch ? 1 : 0);
        }
        if (settings.maxSearchResults !== undefined) {
            fields.push('max_search_results = ?');
            values.push(settings.maxSearchResults);
        }
        if (settings.codebaseScope !== undefined) {
            fields.push('codebase_scope = ?');
            values.push(settings.codebaseScope);
        }
        if (settings.customCodebasePath !== undefined) {
            fields.push('custom_codebase_path = ?');
            values.push(settings.customCodebasePath);
        }
        if (settings.wolframAppId !== undefined) {
            fields.push('wolfram_app_id = ?');
            values.push(settings.wolframAppId);
        }
        if (settings.showSources !== undefined) {
            fields.push('show_sources = ?');
            values.push(settings.showSources ? 1 : 0);
        }
        if (settings.showConfidence !== undefined) {
            fields.push('show_confidence = ?');
            values.push(settings.showConfidence ? 1 : 0);
        }

        if (fields.length === 0) return;

        const query = `UPDATE learn_settings SET ${fields.join(', ')} WHERE id = 1`;
        this.db.prepare(query).run(...values);
    }

    /**
     * Add a research query to history
     */
    public async addLearnHistoryEntry(
        query: string,
        queryType: string,
        response: string,
        sources?: string
    ): Promise<number> {
        const result = this.db.prepare(
            'INSERT INTO learn_history (query, query_type, response, sources) VALUES (?, ?, ?, ?)'
        ).run(query, queryType, response, sources || null);
        
        // Cleanup old entries if exceeding max
        const settings = await this.getLearnSettings();
        this.db.prepare(`
            DELETE FROM learn_history 
            WHERE id NOT IN (
                SELECT id FROM learn_history 
                ORDER BY created_at DESC 
                LIMIT ?
            )
        `).run(settings.maxHistoryItems);

        return result.lastInsertRowid as number;
    }

    /**
     * Get research history
     */
    public async getLearnHistory(limit: number = 20): Promise<LearnHistoryEntry[]> {
        const rows = this.db.prepare(
            'SELECT * FROM learn_history ORDER BY created_at DESC LIMIT ?'
        ).all(limit) as any[];

        return rows.map(row => ({
            id: row.id,
            query: row.query,
            queryType: row.query_type,
            response: row.response,
            sources: row.sources,
            isFavorite: !!row.is_favorite,
            createdAt: row.created_at,
        }));
    }

    /**
     * Toggle favorite status of a history entry
     */
    public async toggleLearnFavorite(id: number): Promise<void> {
        this.db.prepare(
            'UPDATE learn_history SET is_favorite = NOT is_favorite WHERE id = ?'
        ).run(id);
    }

    /**
     * Get favorite research entries
     */
    public async getLearnFavorites(): Promise<LearnHistoryEntry[]> {
        const rows = this.db.prepare(
            'SELECT * FROM learn_history WHERE is_favorite = 1 ORDER BY created_at DESC'
        ).all() as any[];

        return rows.map(row => ({
            id: row.id,
            query: row.query,
            queryType: row.query_type,
            response: row.response,
            sources: row.sources,
            isFavorite: true,
            createdAt: row.created_at,
        }));
    }

    /**
     * Clear all research history (except favorites)
     */
    public async clearLearnHistory(includeFavorites: boolean = false): Promise<void> {
        if (includeFavorites) {
            this.db.prepare('DELETE FROM learn_history').run();
        } else {
            this.db.prepare('DELETE FROM learn_history WHERE is_favorite = 0').run();
        }
    }

    /**
     * Search history
     */
    public async searchLearnHistory(searchTerm: string): Promise<LearnHistoryEntry[]> {
        const rows = this.db.prepare(
            'SELECT * FROM learn_history WHERE query LIKE ? OR response LIKE ? ORDER BY created_at DESC LIMIT 20'
        ).all(`%${searchTerm}%`, `%${searchTerm}%`) as any[];

        return rows.map(row => ({
            id: row.id,
            query: row.query,
            queryType: row.query_type,
            response: row.response,
            sources: row.sources,
            isFavorite: !!row.is_favorite,
            createdAt: row.created_at,
        }));
    }

    /**
     * Close the database connection (for cleanup)
     */
    public close(): void {
        this.db.close();
    }
}

export const db = new DatabaseService();
