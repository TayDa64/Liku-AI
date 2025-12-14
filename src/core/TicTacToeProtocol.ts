/**
 * TicTacToeProtocol - GameProtocol implementation for TicTacToe
 * 
 * Simple 3x3 grid game - good proof-of-concept for the protocol.
 * Includes minimax AI for suggestions.
 * 
 * @module core/TicTacToeProtocol
 */

import {
  GameProtocol,
  GameAction,
  ActionResult,
  GameMeta,
  AISuggestion,
  BaseGameProtocol,
  registerProtocol,
} from './GameProtocol.js';

// =============================================================================
// Types
// =============================================================================

/** Cell value */
export type TicTacToeCell = 'X' | 'O' | null;

/** Player identifier */
export type TicTacToePlayer = 'X' | 'O';

/** Board position */
export interface TicTacToePosition {
  row: number;
  col: number;
}

/** TicTacToe game state */
export interface TicTacToeState {
  board: TicTacToeCell[][];
  currentPlayer: TicTacToePlayer;
  moveCount: number;
  winner: TicTacToePlayer | 'draw' | null;
  winningLine: TicTacToePosition[] | null;
  lastMove: (TicTacToePosition & { player: TicTacToePlayer }) | null;
}

/** TicTacToe action */
export interface TicTacToeAction extends GameAction {
  type: 'place';
  payload: TicTacToePosition;
}

// =============================================================================
// Winning Lines
// =============================================================================

const WINNING_LINES: TicTacToePosition[][] = [
  // Rows
  [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }],
  [{ row: 1, col: 0 }, { row: 1, col: 1 }, { row: 1, col: 2 }],
  [{ row: 2, col: 0 }, { row: 2, col: 1 }, { row: 2, col: 2 }],
  // Columns
  [{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: 2, col: 0 }],
  [{ row: 0, col: 1 }, { row: 1, col: 1 }, { row: 2, col: 1 }],
  [{ row: 0, col: 2 }, { row: 1, col: 2 }, { row: 2, col: 2 }],
  // Diagonals
  [{ row: 0, col: 0 }, { row: 1, col: 1 }, { row: 2, col: 2 }],
  [{ row: 0, col: 2 }, { row: 1, col: 1 }, { row: 2, col: 0 }],
];

// =============================================================================
// TicTacToeProtocol Implementation
// =============================================================================

export class TicTacToeProtocol extends BaseGameProtocol<TicTacToeState, TicTacToeAction> {
  readonly gameType = 'tictactoe';
  readonly displayName = 'Tic-Tac-Toe';
  readonly timing = 'turn-based' as const;
  readonly playerCount = 2;

  private _state: TicTacToeState;

  constructor(startingPlayer: TicTacToePlayer = 'X') {
    super();
    this._state = this.createInitialState(startingPlayer);
  }

  private createInitialState(startingPlayer: TicTacToePlayer): TicTacToeState {
    return {
      board: [
        [null, null, null],
        [null, null, null],
        [null, null, null],
      ],
      currentPlayer: startingPlayer,
      moveCount: 0,
      winner: null,
      winningLine: null,
      lastMove: null,
    };
  }

  // ---------------------------------------------------------------------------
  // State Management
  // ---------------------------------------------------------------------------

  getState(): TicTacToeState {
    return {
      ...this._state,
      board: this._state.board.map(row => [...row]),
      winningLine: this._state.winningLine ? [...this._state.winningLine] : null,
    };
  }

  getMeta(): GameMeta {
    return {
      gameType: this.gameType,
      turnNumber: this._state.moveCount,
      currentPlayer: this._state.winner ? null : this._state.currentPlayer,
      isTerminal: this._state.winner !== null,
      winner: this._state.winner,
      timing: this.timing,
      lastUpdate: Date.now(),
    };
  }

  serialize(): string {
    return JSON.stringify(this._state);
  }

  deserialize(data: string): void {
    this._state = JSON.parse(data);
    this.notifyStateChange();
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  getLegalActions(): TicTacToeAction[] {
    if (this._state.winner !== null) {
      return []; // Game over
    }

    const actions: TicTacToeAction[] = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        if (this._state.board[row][col] === null) {
          actions.push({
            type: 'place',
            payload: { row, col },
            timestamp: Date.now(),
          });
        }
      }
    }
    return actions;
  }

  isLegalAction(action: TicTacToeAction): boolean {
    if (action.type !== 'place') return false;
    const { row, col } = action.payload;
    if (row < 0 || row > 2 || col < 0 || col > 2) return false;
    if (this._state.board[row][col] !== null) return false;
    if (this._state.winner !== null) return false;
    return true;
  }

  applyAction(action: TicTacToeAction): ActionResult {
    if (!this.isLegalAction(action)) {
      return {
        valid: false,
        error: this._state.winner 
          ? 'Game is over' 
          : 'Invalid move: cell occupied or out of bounds',
      };
    }

    const { row, col } = action.payload;
    const player = this._state.currentPlayer;

    // Make move
    this._state.board[row][col] = player;
    this._state.moveCount++;
    this._state.lastMove = { row, col, player };

    // Check for winner
    const winResult = this.checkWinner();
    if (winResult) {
      this._state.winner = winResult.winner;
      this._state.winningLine = winResult.line;
    } else if (this._state.moveCount >= 9) {
      this._state.winner = 'draw';
    }

    // Switch player
    if (this._state.winner === null) {
      this._state.currentPlayer = player === 'X' ? 'O' : 'X';
    }

    this.notifyStateChange();

    return {
      valid: true,
      reward: this._state.winner === player ? 1 : this._state.winner === 'draw' ? 0 : 0,
      gameEnded: this._state.winner !== null,
      winner: this._state.winner,
    };
  }

  // ---------------------------------------------------------------------------
  // Game Flow
  // ---------------------------------------------------------------------------

  isGameOver(): boolean {
    return this._state.winner !== null;
  }

  getWinner(): TicTacToePlayer | 'draw' | null {
    return this._state.winner;
  }

  getCurrentPlayer(): TicTacToePlayer | null {
    return this._state.winner ? null : this._state.currentPlayer;
  }

  reset(): void {
    this._state = this.createInitialState('X');
    this.notifyStateChange();
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  renderAscii(): string {
    const { board } = this._state;
    const lines: string[] = [];
    
    lines.push('┌───┬───┬───┐');
    for (let row = 0; row < 3; row++) {
      const cells = board[row].map(c => c || ' ');
      lines.push(`│ ${cells[0]} │ ${cells[1]} │ ${cells[2]} │`);
      if (row < 2) {
        lines.push('├───┼───┼───┤');
      }
    }
    lines.push('└───┴───┴───┘');
    
    // Status line
    if (this._state.winner === 'draw') {
      lines.push('Game: Draw!');
    } else if (this._state.winner) {
      lines.push(`Winner: ${this._state.winner}!`);
    } else {
      lines.push(`Turn: ${this._state.currentPlayer}`);
    }

    return lines.join('\n');
  }

  // ---------------------------------------------------------------------------
  // AI
  // ---------------------------------------------------------------------------

  async getAISuggestion(options?: {
    depth?: number;
    difficulty?: 'easy' | 'medium' | 'hard';
  }): Promise<AISuggestion<TicTacToeAction>> {
    const startTime = Date.now();
    const difficulty = options?.difficulty || 'hard';
    
    // Get legal moves
    const legalMoves = this.getLegalActions();
    if (legalMoves.length === 0) {
      throw new Error('No legal moves available');
    }

    // Easy: random move
    if (difficulty === 'easy') {
      const randomMove = legalMoves[Math.floor(Math.random() * legalMoves.length)];
      return {
        action: randomMove,
        evaluation: 0,
        explanation: 'Random move',
        computeTime: Date.now() - startTime,
      };
    }

    // Medium: 50% chance of best move
    if (difficulty === 'medium' && Math.random() < 0.5) {
      const randomMove = legalMoves[Math.floor(Math.random() * legalMoves.length)];
      return {
        action: randomMove,
        evaluation: 0,
        explanation: 'Random move (medium difficulty)',
        computeTime: Date.now() - startTime,
      };
    }

    // Hard: minimax
    const player = this._state.currentPlayer;
    let bestMove = legalMoves[0];
    let bestScore = -Infinity;

    for (const move of legalMoves) {
      // Try move
      const { row, col } = move.payload;
      this._state.board[row][col] = player;
      this._state.moveCount++;

      const score = -this.minimax(player === 'X' ? 'O' : 'X', -Infinity, Infinity);

      // Undo move
      this._state.board[row][col] = null;
      this._state.moveCount--;

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    return {
      action: bestMove,
      evaluation: bestScore,
      explanation: bestScore > 0 ? 'Winning move' : bestScore < 0 ? 'Defensive move' : 'Neutral move',
      depth: 9 - this._state.moveCount,
      computeTime: Date.now() - startTime,
    };
  }

  /**
   * Minimax with alpha-beta pruning
   */
  private minimax(player: TicTacToePlayer, alpha: number, beta: number): number {
    // Check terminal state
    const winResult = this.checkWinner();
    if (winResult) {
      return winResult.winner === player ? 10 - this._state.moveCount : -10 + this._state.moveCount;
    }
    if (this._state.moveCount >= 9) {
      return 0; // Draw
    }

    const opponent = player === 'X' ? 'O' : 'X';
    let bestScore = -Infinity;

    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        if (this._state.board[row][col] === null) {
          // Try move
          this._state.board[row][col] = player;
          this._state.moveCount++;

          const score = -this.minimax(opponent, -beta, -alpha);

          // Undo move
          this._state.board[row][col] = null;
          this._state.moveCount--;

          bestScore = Math.max(bestScore, score);
          alpha = Math.max(alpha, score);

          if (alpha >= beta) {
            return bestScore; // Beta cutoff
          }
        }
      }
    }

    return bestScore;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private checkWinner(): { winner: TicTacToePlayer; line: TicTacToePosition[] } | null {
    for (const line of WINNING_LINES) {
      const [a, b, c] = line;
      const cellA = this._state.board[a.row][a.col];
      const cellB = this._state.board[b.row][b.col];
      const cellC = this._state.board[c.row][c.col];

      if (cellA && cellA === cellB && cellB === cellC) {
        return { winner: cellA, line };
      }
    }
    return null;
  }
}

// =============================================================================
// Register Protocol
// =============================================================================

registerProtocol('tictactoe', () => new TicTacToeProtocol());

// =============================================================================
// Convenience Export
// =============================================================================

export function createTicTacToeGame(startingPlayer?: TicTacToePlayer): TicTacToeProtocol {
  return new TicTacToeProtocol(startingPlayer);
}
