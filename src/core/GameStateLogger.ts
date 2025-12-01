import fs from 'node:fs';
import path from 'node:path';
import { wsServer } from '../websocket/server.js';
import { stateManager, type UnifiedGameState, type StructuredGameData } from '../websocket/state.js';
import { GameEventType } from '../websocket/protocol.js';

// Configuration flags
let websocketEnabled = true;
let fileLoggingEnabled = true;

/**
 * Enable or disable WebSocket broadcasting
 */
export const setWebSocketEnabled = (enabled: boolean): void => {
    websocketEnabled = enabled;
};

/**
 * Enable or disable file logging
 */
export const setFileLoggingEnabled = (enabled: boolean): void => {
    fileLoggingEnabled = enabled;
};

/**
 * Logs the current game state to a file for AI visibility
 * and broadcasts via WebSocket for real-time AI agents.
 * 
 * @param screenName - The name of the current screen or game (e.g., "Playing Snake")
 * @param status - A short status string (e.g., "Score: 100", "Game Over")
 * @param visualContent - The ASCII representation of the game board or UI
 * @param controls - Instructions on how to control the game
 * @param structuredState - Optional structured game state for AI decision making
 */
export const logGameState = (
    screenName: string,
    status: string,
    visualContent: string,
    controls: string = "Use Arrows to move, Enter to select, Esc/Q to quit.",
    structuredState?: StructuredGameData
) => {
    const now = Date.now();
    
    // Build unified state
    const unifiedState: UnifiedGameState = {
        timestamp: now,
        pid: process.pid,
        screen: screenName,
        status: status,
        version: '2.0.0',
        game: structuredState,
    };

    // Update state manager (notifies all subscribers)
    stateManager.update(unifiedState);

    // Broadcast via WebSocket if enabled and server is running
    if (websocketEnabled && wsServer.isRunning) {
        try {
            wsServer.broadcastState(unifiedState);
        } catch (err) {
            // Ignore broadcast errors to avoid crashing the game loop
        }
    }

    // Write to file if enabled (legacy compatibility)
    if (fileLoggingEnabled) {
        const stateFile = path.join(process.cwd(), 'likubuddy-state.txt');
        
        let content = `PROCESS ID: ${process.pid}\n`;
        content += `TIMESTAMP: ${now}\n`;
        content += `CURRENT SCREEN: ${screenName}\n`;
        content += `STATUS: ${status}\n`;
        content += `\nVISUAL STATE:\n`;
        content += `${visualContent}\n`;
        content += `\nCONTROLS: ${controls}\n`;
        
        // Add structured state info if available
        if (structuredState) {
            content += `\n--- STRUCTURED STATE (JSON) ---\n`;
            content += JSON.stringify(structuredState, null, 2);
            content += `\n--- END STRUCTURED STATE ---\n`;
        }

        try {
            fs.writeFileSync(stateFile, content, 'utf-8');
        } catch (err) {
            // Ignore write errors to avoid crashing the game loop
        }
    }
};

/**
 * Broadcast a game event without full state update
 * Useful for transient events like score changes, collisions, etc.
 */
export const broadcastEvent = (
    eventType: GameEventType | string,
    data: Record<string, unknown>
): void => {
    if (websocketEnabled && wsServer.isRunning) {
        try {
            wsServer.broadcastEvent(eventType, data);
        } catch (err) {
            // Ignore broadcast errors
        }
    }
};

/**
 * Get the current state from the state manager
 */
export const getCurrentState = (): UnifiedGameState | null => {
    return stateManager.get();
};

/**
 * Get recent state history for replay/training
 */
export const getStateHistory = (limit?: number): UnifiedGameState[] => {
    return stateManager.getHistory(limit);
};

/**
 * Subscribe to state updates
 * Returns an unsubscribe function
 */
export const subscribeToState = (callback: (state: UnifiedGameState) => void): () => void => {
    return stateManager.subscribe(callback);
};
