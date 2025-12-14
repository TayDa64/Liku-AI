/**
 * GameProtocol Tests
 * 
 * Tests for the unified game protocol interface and TicTacToe implementation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  TicTacToeProtocol,
  TicTacToeState,
  TicTacToeAction,
  createTicTacToeGame,
} from '../src/core/TicTacToeProtocol.js';
import {
  registerProtocol,
  createProtocol,
  getRegisteredGameTypes,
  hasAISupport,
  isTurnBased,
} from '../src/core/GameProtocol.js';

describe('GameProtocol', () => {
  describe('Protocol Registry', () => {
    it('should register and create protocols', () => {
      // TicTacToe is auto-registered when imported
      const types = getRegisteredGameTypes();
      expect(types).toContain('tictactoe');
    });

    it('should create protocol from factory', () => {
      const game = createProtocol('tictactoe');
      expect(game).toBeDefined();
      expect(game?.gameType).toBe('tictactoe');
    });

    it('should return null for unknown game type', () => {
      const game = createProtocol('unknown-game');
      expect(game).toBeNull();
    });
  });

  describe('TicTacToeProtocol', () => {
    let game: TicTacToeProtocol;

    beforeEach(() => {
      game = new TicTacToeProtocol('X');
    });

    describe('Identity', () => {
      it('should have correct game type', () => {
        expect(game.gameType).toBe('tictactoe');
      });

      it('should have correct display name', () => {
        expect(game.displayName).toBe('Tic-Tac-Toe');
      });

      it('should be turn-based', () => {
        expect(game.timing).toBe('turn-based');
        expect(isTurnBased(game)).toBe(true);
      });

      it('should have 2 players', () => {
        expect(game.playerCount).toBe(2);
      });
    });

    describe('Initial State', () => {
      it('should start with empty board', () => {
        const state = game.getState();
        for (let row = 0; row < 3; row++) {
          for (let col = 0; col < 3; col++) {
            expect(state.board[row][col]).toBeNull();
          }
        }
      });

      it('should start with specified player', () => {
        const gameX = new TicTacToeProtocol('X');
        const gameO = new TicTacToeProtocol('O');
        
        expect(gameX.getCurrentPlayer()).toBe('X');
        expect(gameO.getCurrentPlayer()).toBe('O');
      });

      it('should not be game over initially', () => {
        expect(game.isGameOver()).toBe(false);
        expect(game.getWinner()).toBeNull();
      });

      it('should have 9 legal moves initially', () => {
        const moves = game.getLegalActions();
        expect(moves.length).toBe(9);
      });
    });

    describe('Actions', () => {
      it('should validate legal moves', () => {
        const action: TicTacToeAction = {
          type: 'place',
          payload: { row: 0, col: 0 },
          timestamp: Date.now(),
        };
        expect(game.isLegalAction(action)).toBe(true);
      });

      it('should reject out-of-bounds moves', () => {
        const action: TicTacToeAction = {
          type: 'place',
          payload: { row: 5, col: 0 },
          timestamp: Date.now(),
        };
        expect(game.isLegalAction(action)).toBe(false);
      });

      it('should apply valid move', () => {
        const action: TicTacToeAction = {
          type: 'place',
          payload: { row: 1, col: 1 },
          timestamp: Date.now(),
        };
        
        const result = game.applyAction(action);
        expect(result.valid).toBe(true);
        expect(game.getState().board[1][1]).toBe('X');
      });

      it('should switch players after move', () => {
        expect(game.getCurrentPlayer()).toBe('X');
        
        game.applyAction({
          type: 'place',
          payload: { row: 0, col: 0 },
          timestamp: Date.now(),
        });
        
        expect(game.getCurrentPlayer()).toBe('O');
      });

      it('should reject move on occupied cell', () => {
        const action: TicTacToeAction = {
          type: 'place',
          payload: { row: 0, col: 0 },
          timestamp: Date.now(),
        };
        
        game.applyAction(action);
        const result = game.applyAction(action);
        
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      });

      it('should reduce legal moves after each play', () => {
        expect(game.getLegalActions().length).toBe(9);
        
        game.applyAction({
          type: 'place',
          payload: { row: 0, col: 0 },
          timestamp: Date.now(),
        });
        
        expect(game.getLegalActions().length).toBe(8);
      });
    });

    describe('Game Flow', () => {
      it('should detect horizontal win', () => {
        // X plays top row
        game.applyAction({ type: 'place', payload: { row: 0, col: 0 }, timestamp: 0 });
        game.applyAction({ type: 'place', payload: { row: 1, col: 0 }, timestamp: 0 }); // O
        game.applyAction({ type: 'place', payload: { row: 0, col: 1 }, timestamp: 0 });
        game.applyAction({ type: 'place', payload: { row: 1, col: 1 }, timestamp: 0 }); // O
        game.applyAction({ type: 'place', payload: { row: 0, col: 2 }, timestamp: 0 });
        
        expect(game.isGameOver()).toBe(true);
        expect(game.getWinner()).toBe('X');
      });

      it('should detect vertical win', () => {
        // X plays left column
        game.applyAction({ type: 'place', payload: { row: 0, col: 0 }, timestamp: 0 });
        game.applyAction({ type: 'place', payload: { row: 0, col: 1 }, timestamp: 0 }); // O
        game.applyAction({ type: 'place', payload: { row: 1, col: 0 }, timestamp: 0 });
        game.applyAction({ type: 'place', payload: { row: 0, col: 2 }, timestamp: 0 }); // O
        game.applyAction({ type: 'place', payload: { row: 2, col: 0 }, timestamp: 0 });
        
        expect(game.isGameOver()).toBe(true);
        expect(game.getWinner()).toBe('X');
      });

      it('should detect diagonal win', () => {
        // X plays diagonal
        game.applyAction({ type: 'place', payload: { row: 0, col: 0 }, timestamp: 0 });
        game.applyAction({ type: 'place', payload: { row: 0, col: 1 }, timestamp: 0 }); // O
        game.applyAction({ type: 'place', payload: { row: 1, col: 1 }, timestamp: 0 });
        game.applyAction({ type: 'place', payload: { row: 0, col: 2 }, timestamp: 0 }); // O
        game.applyAction({ type: 'place', payload: { row: 2, col: 2 }, timestamp: 0 });
        
        expect(game.isGameOver()).toBe(true);
        expect(game.getWinner()).toBe('X');
        
        const state = game.getState();
        expect(state.winningLine).toHaveLength(3);
      });

      it('should detect draw', () => {
        // Play to draw:
        // X | O | X
        // X | O | O
        // O | X | X
        game.applyAction({ type: 'place', payload: { row: 0, col: 0 }, timestamp: 0 }); // X
        game.applyAction({ type: 'place', payload: { row: 0, col: 1 }, timestamp: 0 }); // O
        game.applyAction({ type: 'place', payload: { row: 0, col: 2 }, timestamp: 0 }); // X
        game.applyAction({ type: 'place', payload: { row: 1, col: 1 }, timestamp: 0 }); // O
        game.applyAction({ type: 'place', payload: { row: 1, col: 0 }, timestamp: 0 }); // X
        game.applyAction({ type: 'place', payload: { row: 2, col: 0 }, timestamp: 0 }); // O
        game.applyAction({ type: 'place', payload: { row: 2, col: 1 }, timestamp: 0 }); // X
        game.applyAction({ type: 'place', payload: { row: 2, col: 2 }, timestamp: 0 }); // O
        game.applyAction({ type: 'place', payload: { row: 1, col: 2 }, timestamp: 0 }); // X
        
        expect(game.isGameOver()).toBe(true);
        expect(game.getWinner()).toBe('draw');
      });

      it('should have no legal moves after game over', () => {
        // X wins
        game.applyAction({ type: 'place', payload: { row: 0, col: 0 }, timestamp: 0 });
        game.applyAction({ type: 'place', payload: { row: 1, col: 0 }, timestamp: 0 });
        game.applyAction({ type: 'place', payload: { row: 0, col: 1 }, timestamp: 0 });
        game.applyAction({ type: 'place', payload: { row: 1, col: 1 }, timestamp: 0 });
        game.applyAction({ type: 'place', payload: { row: 0, col: 2 }, timestamp: 0 });
        
        expect(game.getLegalActions().length).toBe(0);
      });

      it('should reset game properly', () => {
        game.applyAction({ type: 'place', payload: { row: 0, col: 0 }, timestamp: 0 });
        game.applyAction({ type: 'place', payload: { row: 1, col: 1 }, timestamp: 0 });
        
        game.reset();
        
        expect(game.isGameOver()).toBe(false);
        expect(game.getCurrentPlayer()).toBe('X');
        expect(game.getLegalActions().length).toBe(9);
        expect(game.getState().moveCount).toBe(0);
      });
    });

    describe('Serialization', () => {
      it('should serialize and deserialize state', () => {
        game.applyAction({ type: 'place', payload: { row: 1, col: 1 }, timestamp: 0 });
        game.applyAction({ type: 'place', payload: { row: 0, col: 0 }, timestamp: 0 });
        
        const serialized = game.serialize();
        
        const newGame = new TicTacToeProtocol();
        newGame.deserialize(serialized);
        
        expect(newGame.getState().board[1][1]).toBe('X');
        expect(newGame.getState().board[0][0]).toBe('O');
        expect(newGame.getCurrentPlayer()).toBe('X');
        expect(newGame.getState().moveCount).toBe(2);
      });
    });

    describe('Meta', () => {
      it('should provide correct meta information', () => {
        const meta = game.getMeta();
        
        expect(meta.gameType).toBe('tictactoe');
        expect(meta.turnNumber).toBe(0);
        expect(meta.currentPlayer).toBe('X');
        expect(meta.isTerminal).toBe(false);
        expect(meta.winner).toBeNull();
        expect(meta.timing).toBe('turn-based');
      });

      it('should update meta after moves', () => {
        game.applyAction({ type: 'place', payload: { row: 0, col: 0 }, timestamp: 0 });
        
        const meta = game.getMeta();
        expect(meta.turnNumber).toBe(1);
        expect(meta.currentPlayer).toBe('O');
      });

      it('should reflect terminal state in meta', () => {
        // X wins
        game.applyAction({ type: 'place', payload: { row: 0, col: 0 }, timestamp: 0 });
        game.applyAction({ type: 'place', payload: { row: 1, col: 0 }, timestamp: 0 });
        game.applyAction({ type: 'place', payload: { row: 0, col: 1 }, timestamp: 0 });
        game.applyAction({ type: 'place', payload: { row: 1, col: 1 }, timestamp: 0 });
        game.applyAction({ type: 'place', payload: { row: 0, col: 2 }, timestamp: 0 });
        
        const meta = game.getMeta();
        expect(meta.isTerminal).toBe(true);
        expect(meta.winner).toBe('X');
        expect(meta.currentPlayer).toBeNull();
      });
    });

    describe('Rendering', () => {
      it('should render ASCII board', () => {
        const ascii = game.renderAscii();
        
        expect(ascii).toContain('┌───┬───┬───┐');
        expect(ascii).toContain('└───┴───┴───┘');
        expect(ascii).toContain('Turn: X');
      });

      it('should show pieces on board', () => {
        game.applyAction({ type: 'place', payload: { row: 1, col: 1 }, timestamp: 0 });
        
        const ascii = game.renderAscii();
        expect(ascii).toContain('X');
        expect(ascii).toContain('Turn: O');
      });

      it('should show winner', () => {
        game.applyAction({ type: 'place', payload: { row: 0, col: 0 }, timestamp: 0 });
        game.applyAction({ type: 'place', payload: { row: 1, col: 0 }, timestamp: 0 });
        game.applyAction({ type: 'place', payload: { row: 0, col: 1 }, timestamp: 0 });
        game.applyAction({ type: 'place', payload: { row: 1, col: 1 }, timestamp: 0 });
        game.applyAction({ type: 'place', payload: { row: 0, col: 2 }, timestamp: 0 });
        
        const ascii = game.renderAscii();
        expect(ascii).toContain('Winner: X');
      });
    });

    describe('AI', () => {
      it('should have AI support', () => {
        expect(hasAISupport(game)).toBe(true);
      });

      it('should suggest a legal move', async () => {
        const suggestion = await game.getAISuggestion({ difficulty: 'hard' });
        
        expect(suggestion.action).toBeDefined();
        expect(suggestion.action.type).toBe('place');
        expect(game.isLegalAction(suggestion.action)).toBe(true);
        expect(suggestion.computeTime).toBeGreaterThanOrEqual(0);
      });

      it('should find winning move', async () => {
        // Set up winning opportunity for X
        game.applyAction({ type: 'place', payload: { row: 0, col: 0 }, timestamp: 0 }); // X
        game.applyAction({ type: 'place', payload: { row: 1, col: 0 }, timestamp: 0 }); // O
        game.applyAction({ type: 'place', payload: { row: 0, col: 1 }, timestamp: 0 }); // X
        game.applyAction({ type: 'place', payload: { row: 1, col: 1 }, timestamp: 0 }); // O
        // X can win at (0,2)
        
        const suggestion = await game.getAISuggestion({ difficulty: 'hard' });
        
        expect(suggestion.action.payload.row).toBe(0);
        expect(suggestion.action.payload.col).toBe(2);
        expect(suggestion.evaluation).toBeGreaterThan(0);
      });

      it('should block opponent winning move', async () => {
        // Set up winning threat for X, O to play
        game.applyAction({ type: 'place', payload: { row: 0, col: 0 }, timestamp: 0 }); // X
        game.applyAction({ type: 'place', payload: { row: 1, col: 1 }, timestamp: 0 }); // O
        game.applyAction({ type: 'place', payload: { row: 0, col: 1 }, timestamp: 0 }); // X
        // X threatens to win at (0,2), O should block
        
        const suggestion = await game.getAISuggestion({ difficulty: 'hard' });
        
        expect(suggestion.action.payload.row).toBe(0);
        expect(suggestion.action.payload.col).toBe(2);
      });

      it('should return random move on easy difficulty', async () => {
        const suggestion = await game.getAISuggestion({ difficulty: 'easy' });
        
        expect(suggestion.action).toBeDefined();
        expect(suggestion.explanation).toContain('Random');
      });
    });

    describe('State Change Subscription', () => {
      it('should notify on state change', () => {
        let notified = false;
        const unsubscribe = game.onStateChange(() => {
          notified = true;
        });
        
        game.applyAction({ type: 'place', payload: { row: 0, col: 0 }, timestamp: 0 });
        
        expect(notified).toBe(true);
        unsubscribe();
      });

      it('should support multiple subscribers', () => {
        let count = 0;
        const unsub1 = game.onStateChange(() => count++);
        const unsub2 = game.onStateChange(() => count++);
        
        game.applyAction({ type: 'place', payload: { row: 0, col: 0 }, timestamp: 0 });
        
        expect(count).toBe(2);
        
        unsub1();
        unsub2();
      });

      it('should allow unsubscription', () => {
        let count = 0;
        const unsubscribe = game.onStateChange(() => count++);
        
        game.applyAction({ type: 'place', payload: { row: 0, col: 0 }, timestamp: 0 });
        expect(count).toBe(1);
        
        unsubscribe();
        
        game.applyAction({ type: 'place', payload: { row: 1, col: 1 }, timestamp: 0 });
        expect(count).toBe(1); // Should not increment
      });
    });
  });

  describe('Convenience Functions', () => {
    it('should create game with createTicTacToeGame', () => {
      const game = createTicTacToeGame('O');
      expect(game.getCurrentPlayer()).toBe('O');
    });
  });
});
