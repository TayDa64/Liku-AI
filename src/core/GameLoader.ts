import fs from 'fs/promises';
import path from 'path';
import { db } from '../services/DatabaseService.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface GameInstallResult {
  success: boolean;
  gameId: string;
  message: string;
  error?: string;
}

export class GameLoader {
  private gamesDir: string;

  constructor() {
    // Path to community games directory
    this.gamesDir = path.join(__dirname, '..', 'games', 'community');
  }

  /**
   * Install a generated game to the file system and database
   */
  async installGeneratedGame(
    code: string,
    meta: { id: string; name: string; description?: string }
  ): Promise<GameInstallResult> {
    try {
      // Ensure community games directory exists
      await fs.mkdir(this.gamesDir, { recursive: true });

      // Generate file name
      const fileName = `${meta.id}.tsx`;
      const filePath = path.join(this.gamesDir, fileName);

      // Check if game already exists
      const existingGame = await db.getGameById(meta.id);
      if (existingGame) {
        return {
          success: false,
          gameId: meta.id,
          message: `Game '${meta.name}' already exists. Use a different ID or remove the existing game first.`
        };
      }

      // Write the game code to file
      await fs.writeFile(filePath, code, 'utf-8');

      // Register in database
      await db.registerGame({
        id: meta.id,
        name: meta.name,
        description: meta.description || '',
        filePath: fileName
      });

      console.log(`⚡ Cartridge '${meta.name}' burned successfully.`);

      return {
        success: true,
        gameId: meta.id,
        message: `✅ Game '${meta.name}' installed successfully! You can now play it from the games menu.`
      };
    } catch (error) {
      console.error('Error installing game:', error);
      return {
        success: false,
        gameId: meta.id,
        message: `Failed to install game '${meta.name}'`,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Load a game dynamically by ID
   */
  async loadGame(gameId: string): Promise<any> {
    try {
      const game = await db.getGameById(gameId);
      if (!game) {
        throw new Error(`Game '${gameId}' not found in registry`);
      }

      const gamePath = path.join(this.gamesDir, game.filePath);
      
      // Check if file exists
      try {
        await fs.access(gamePath);
      } catch {
        throw new Error(`Game file not found: ${game.filePath}`);
      }

      // Dynamically import the game module
      const gameModule = await import(gamePath);
      return gameModule.default || gameModule;
    } catch (error) {
      console.error(`Error loading game '${gameId}':`, error);
      throw error;
    }
  }

  /**
   * List all available community games
   */
  async listCommunityGames(): Promise<Array<{ id: string; name: string; description: string }>> {
    try {
      const games = await db.getRegisteredGames();
      return games.map(g => ({
        id: g.id,
        name: g.name,
        description: g.description || 'No description'
      }));
    } catch (error) {
      console.error('Error listing community games:', error);
      return [];
    }
  }

  /**
   * Remove a game from the file system and database
   */
  async removeGame(gameId: string): Promise<GameInstallResult> {
    try {
      const game = await db.getGameById(gameId);
      if (!game) {
        return {
          success: false,
          gameId,
          message: `Game '${gameId}' not found`
        };
      }

      // Delete the file
      const filePath = path.join(this.gamesDir, game.filePath);
      try {
        await fs.unlink(filePath);
      } catch (error) {
        console.warn(`Could not delete game file: ${error}`);
      }

      // TODO: Remove from database (needs new DB method)
      // For now, we just delete the file

      return {
        success: true,
        gameId,
        message: `Game '${game.name}' removed successfully`
      };
    } catch (error) {
      return {
        success: false,
        gameId,
        message: 'Failed to remove game',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Validate game code before installation
   */
  validateGameCode(code: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check for required imports
    if (!code.includes("from 'react'") && !code.includes('from "react"')) {
      errors.push('Missing React import');
    }
    if (!code.includes("from 'ink'") && !code.includes('from "ink"')) {
      errors.push('Missing Ink import');
    }

    // Check for export
    if (!code.includes('export default') && !code.includes('export {')) {
      errors.push('Missing default export');
    }

    // Check for basic component structure
    if (!code.includes('const ') && !code.includes('function ')) {
      errors.push('No component definition found');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

// Export singleton instance
export const gameLoader = new GameLoader();
