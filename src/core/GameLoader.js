import fs from 'node:fs';
import path from 'node:path';
import { db } from '../services/DatabaseService.js';

class GameLoader {
    validateGameCode(code) {
        // For now, we'll do a simple validation.
        // A real implementation would use a parser like Babel or Acorn.
        if (typeof code !== 'string' || !code.includes('React')) {
            return { valid: false, errors: ['Code is not a valid React component.'] };
        }
        return { valid: true, errors: [] };
    }

    async installGeneratedGame(code, gameMetadata) {
        try {
            // 1. Define the path for the new game file.
            // We'll place it in `src/ui/games/community` to keep it separate.
            const communityGamesDir = path.join(process.cwd(), 'src', 'ui', 'games', 'community');
            if (!fs.existsSync(communityGamesDir)) {
                fs.mkdirSync(communityGamesDir, { recursive: true });
            }
            
            // The file path should be relative to the project root for dynamic import.
            const relativeFilePath = `./ui/games/community/${gameMetadata.id}.js`;
            const absoluteFilePath = path.join(process.cwd(), 'src', relativeFilePath);

            // 2. Write the generated code to the file.
            // NOTE: In a real project, we would compile this from TSX to JS.
            // For this example, we are assuming the AI generates plain JS with JSX.
            // A simple transformation can be done here if needed.
            fs.writeFileSync(absoluteFilePath, code, 'utf-8');

            // 3. Register the game in the database.
            await db.registerGame({
                id: gameMetadata.id,
                name: gameMetadata.name,
                description: gameMetadata.description,
                filePath: relativeFilePath // Store the relative path for dynamic import
            });

            return { success: true, message: `Successfully installed game '${gameMetadata.name}'!` };
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    }
}

export const gameLoader = new GameLoader();
