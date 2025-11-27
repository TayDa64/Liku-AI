import fs from 'node:fs';
import path from 'node:path';

/**
 * Logs the current game state to a file for AI visibility.
 * 
 * @param screenName - The name of the current screen or game (e.g., "Playing Snake")
 * @param status - A short status string (e.g., "Score: 100", "Game Over")
 * @param visualContent - The ASCII representation of the game board or UI
 * @param controls - Instructions on how to control the game
 */
export const logGameState = (
    screenName: string,
    status: string,
    visualContent: string,
    controls: string = "Use Arrows to move, Enter to select, Esc/Q to quit."
) => {
    const stateFile = path.join(process.cwd(), 'likubuddy-state.txt');
    
    let content = `PROCESS ID: ${process.pid}\n`;
    content += `CURRENT SCREEN: ${screenName}\n`;
    content += `STATUS: ${status}\n`;
    content += `\nVISUAL STATE:\n`;
    content += `${visualContent}\n`;
    content += `\nCONTROLS: ${controls}\n`;

    try {
        fs.writeFileSync(stateFile, content, 'utf-8');
    } catch (err) {
        // Ignore write errors to avoid crashing the game loop
    }
};
