/**
 * ChessEngine - Core game logic wrapper around chess.js
 * 
 * Provides a clean, typed interface for chess game management with
 * additional features for AI integration and WebSocket state broadcasting.
 */

import { Chess, Move as ChessJsMove, Square as ChessJsSquare } from 'chess.js';
import {
  Board,
  CapturedPieces,
  CastlingRights,
  ChessEngineConfig,
  ChessState,
  Color,
  GameEndReason,
  GameResult,
  Move,
  MoveInput,
  MoveOptions,
  Piece,
  PieceOnBoard,
  PieceType,
  Square,
  STARTING_FEN,
  PIECE_VALUES,
} from './types.js';

/**
 * ChessEngine wraps chess.js with additional features for Liku-AI
 */
export class ChessEngine {
  private chess: Chess;
  private config: ChessEngineConfig;
  private moveHistory: Move[] = [];
  private capturedPieces: CapturedPieces = { white: [], black: [] };
  private positionHashes: Map<string, number> = new Map();

  constructor(config: ChessEngineConfig = {}) {
    this.config = {
      validateMoves: true,
      trackHistory: true,
      enableHashing: true,
      ...config,
    };
    
    this.chess = new Chess(config.initialFen || STARTING_FEN);
    
    if (this.config.enableHashing) {
      this.recordPosition();
    }
  }

  // ===========================================================================
  // Core Game Methods
  // ===========================================================================

  /**
   * Make a move on the board
   * @param move - Move in SAN notation ("e4", "Nf3") or MoveInput object
   * @returns The move made, or null if invalid
   */
  move(move: string | MoveInput): Move | null {
    try {
      let result: ChessJsMove | null;
      
      if (typeof move === 'string') {
        result = this.chess.move(move);
      } else {
        result = this.chess.move({
          from: move.from,
          to: move.to,
          promotion: move.promotion,
        });
      }

      if (!result) return null;

      const fullMove = this.convertMove(result);
      
      // Track captured pieces
      if (fullMove.captured) {
        if (fullMove.color === 'w') {
          this.capturedPieces.white.push(fullMove.captured);
        } else {
          this.capturedPieces.black.push(fullMove.captured);
        }
      }

      // Track history
      if (this.config.trackHistory) {
        this.moveHistory.push(fullMove);
      }

      // Record position for repetition detection
      if (this.config.enableHashing) {
        this.recordPosition();
      }

      return fullMove;
    } catch {
      return null;
    }
  }

  /**
   * Undo the last move
   * @returns The undone move, or null if no moves to undo
   */
  undo(): Move | null {
    const result = this.chess.undo();
    if (!result) return null;

    const fullMove = this.convertMove(result);

    // Remove from captured pieces
    if (fullMove.captured) {
      if (fullMove.color === 'w') {
        const idx = this.capturedPieces.white.lastIndexOf(fullMove.captured);
        if (idx !== -1) this.capturedPieces.white.splice(idx, 1);
      } else {
        const idx = this.capturedPieces.black.lastIndexOf(fullMove.captured);
        if (idx !== -1) this.capturedPieces.black.splice(idx, 1);
      }
    }

    // Remove from history
    if (this.config.trackHistory && this.moveHistory.length > 0) {
      this.moveHistory.pop();
    }

    return fullMove;
  }

  /**
   * Reset the board to starting position or specified FEN
   * @param fen - Optional FEN to reset to
   */
  reset(fen?: string): void {
    if (fen) {
      this.chess.load(fen);
    } else {
      this.chess.reset();
    }
    this.moveHistory = [];
    this.capturedPieces = { white: [], black: [] };
    this.positionHashes.clear();
    
    if (this.config.enableHashing) {
      this.recordPosition();
    }
  }

  /**
   * Load a position from FEN
   * @param fen - FEN string
   * @returns true if valid FEN, false otherwise
   */
  load(fen: string): boolean {
    try {
      this.chess.load(fen);
      this.moveHistory = [];
      this.capturedPieces = { white: [], black: [] };
      this.positionHashes.clear();
      
      if (this.config.enableHashing) {
        this.recordPosition();
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Load a game from PGN
   * @param pgn - PGN string
   * @returns true if valid PGN, false otherwise
   */
  loadPgn(pgn: string): boolean {
    try {
      this.chess.loadPgn(pgn);
      this.rebuildStateFromHistory();
      return true;
    } catch {
      return false;
    }
  }

  // ===========================================================================
  // Move Generation
  // ===========================================================================

  /**
   * Get all legal moves
   * @param options - Move generation options
   * @returns Array of moves (string SANs or verbose Move objects)
   */
  getMoves(options?: MoveOptions & { verbose: true }): Move[];
  getMoves(options?: MoveOptions & { verbose?: false }): string[];
  getMoves(options?: MoveOptions): string[] | Move[] {
    const moves = this.chess.moves({
      square: options?.square as ChessJsSquare,
      verbose: options?.verbose ?? false,
      piece: options?.piece,
    });

    if (options?.verbose) {
      return (moves as ChessJsMove[]).map(m => this.convertMove(m));
    }
    return moves as string[];
  }

  /**
   * Check if a move is legal
   * @param move - Move to validate
   */
  isLegalMove(move: string | MoveInput): boolean {
    try {
      // Clone and test move
      const testChess = new Chess(this.chess.fen());
      if (typeof move === 'string') {
        return testChess.move(move) !== null;
      } else {
        return testChess.move({
          from: move.from,
          to: move.to,
          promotion: move.promotion,
        }) !== null;
      }
    } catch {
      return false;
    }
  }

  /**
   * Get moves for a specific square
   * @param square - Square to get moves for
   */
  getMovesForSquare(square: Square): Move[] {
    return this.getMoves({ square, verbose: true });
  }

  // ===========================================================================
  // Game State Queries
  // ===========================================================================

  /** Get FEN string */
  fen(): string {
    return this.chess.fen();
  }

  /** Get PGN string */
  pgn(): string {
    return this.chess.pgn();
  }

  /** Get current turn */
  turn(): Color {
    return this.chess.turn();
  }

  /** Get full move number */
  moveNumber(): number {
    return this.chess.moveNumber();
  }

  /** Get half-move clock */
  halfMoveClock(): number {
    // Parse from FEN
    const parts = this.chess.fen().split(' ');
    return parseInt(parts[4] || '0', 10);
  }

  /** Get the board as 2D array */
  board(): Board {
    const board = this.chess.board();
    return board.map(row => 
      row.map(sq => sq ? { type: sq.type as PieceType, color: sq.color as Color } : null)
    );
  }

  /** Get ASCII representation */
  ascii(): string {
    return this.chess.ascii();
  }

  /** Get move history as SAN strings */
  history(): string[] {
    return this.chess.history();
  }

  /** Get detailed move history */
  historyVerbose(): Move[] {
    return [...this.moveHistory];
  }

  /** Get last move */
  getLastMove(): Move | null {
    return this.moveHistory.length > 0 
      ? this.moveHistory[this.moveHistory.length - 1] 
      : null;
  }

  /** Get captured pieces */
  getCapturedPieces(): CapturedPieces {
    return {
      white: [...this.capturedPieces.white],
      black: [...this.capturedPieces.black],
    };
  }

  /** Get castling rights */
  getCastlingRights(): CastlingRights {
    const fen = this.chess.fen();
    const castlingPart = fen.split(' ')[2];
    return {
      whiteKingside: castlingPart.includes('K'),
      whiteQueenside: castlingPart.includes('Q'),
      blackKingside: castlingPart.includes('k'),
      blackQueenside: castlingPart.includes('q'),
    };
  }

  /** Get en passant square */
  getEnPassantSquare(): Square | null {
    const fen = this.chess.fen();
    const epPart = fen.split(' ')[3];
    return epPart === '-' ? null : epPart as Square;
  }

  // ===========================================================================
  // Game Status
  // ===========================================================================

  /** Is the current player in check */
  isCheck(): boolean {
    return this.chess.isCheck();
  }

  /** Is the game over by checkmate */
  isCheckmate(): boolean {
    return this.chess.isCheckmate();
  }

  /** Is the game over by stalemate */
  isStalemate(): boolean {
    return this.chess.isStalemate();
  }

  /** Is the game a draw */
  isDraw(): boolean {
    return this.chess.isDraw();
  }

  /** Is it threefold repetition */
  isThreefoldRepetition(): boolean {
    return this.chess.isThreefoldRepetition();
  }

  /** Is it insufficient material */
  isInsufficientMaterial(): boolean {
    return this.chess.isInsufficientMaterial();
  }

  /** Is the 50-move rule in effect */
  isFiftyMoveRule(): boolean {
    return this.halfMoveClock() >= 100;
  }

  /** Is the game over */
  isGameOver(): boolean {
    return this.chess.isGameOver();
  }

  /** Get game result if game is over */
  getGameResult(): GameResult | null {
    if (!this.isGameOver()) return null;

    if (this.isCheckmate()) {
      const winner = this.turn() === 'w' ? 'b' : 'w';
      return {
        winner,
        reason: 'checkmate',
        score: winner === 'w' ? '1-0' : '0-1',
      };
    }

    // All draw conditions
    let reason: GameEndReason = 'stalemate';
    if (this.isInsufficientMaterial()) reason = 'insufficient_material';
    else if (this.isThreefoldRepetition()) reason = 'threefold_repetition';
    else if (this.isFiftyMoveRule()) reason = 'fifty_move_rule';

    return {
      winner: null,
      reason,
      score: '1/2-1/2',
    };
  }

  // ===========================================================================
  // Position Analysis
  // ===========================================================================

  /**
   * Get piece at a square
   * @param square - Square to check
   */
  getSquare(square: Square): Piece | null {
    const piece = this.chess.get(square as ChessJsSquare);
    return piece ? { type: piece.type as PieceType, color: piece.color as Color } : null;
  }

  /**
   * Check if a square is attacked by a color
   * @param square - Square to check
   * @param byColor - Attacking color
   */
  isAttacked(square: Square, byColor: Color): boolean {
    return this.chess.isAttacked(square as ChessJsSquare, byColor);
  }

  /**
   * Get all pieces on the board
   */
  getAllPieces(): PieceOnBoard[] {
    const pieces: PieceOnBoard[] = [];
    const board = this.chess.board();
    
    board.forEach((row, rankIdx) => {
      row.forEach((piece, fileIdx) => {
        if (piece) {
          const file = String.fromCharCode(97 + fileIdx);
          const rank = String(8 - rankIdx);
          pieces.push({
            type: piece.type as PieceType,
            color: piece.color as Color,
            square: `${file}${rank}` as Square,
          });
        }
      });
    });

    return pieces;
  }

  /**
   * Get pieces for a specific color
   * @param color - Color to get pieces for
   */
  getPieces(color: Color): PieceOnBoard[] {
    return this.getAllPieces().filter(p => p.color === color);
  }

  /**
   * Get material count for a color
   * @param color - Color to count material for
   */
  getMaterialCount(color: Color): number {
    return this.getPieces(color).reduce((sum, p) => sum + PIECE_VALUES[p.type], 0);
  }

  /**
   * Get king square for a color
   * @param color - Color to find king for
   */
  getKingSquare(color: Color): Square | null {
    const king = this.getPieces(color).find(p => p.type === 'k');
    return king ? king.square : null;
  }

  /**
   * Count piece occurrences
   * @param piece - Piece type to count
   * @param color - Color to count for
   */
  countPiece(piece: PieceType, color: Color): number {
    return this.getPieces(color).filter(p => p.type === piece).length;
  }

  // ===========================================================================
  // Position Hashing (for repetition detection)
  // ===========================================================================

  private recordPosition(): void {
    // Use position part of FEN (ignore move counters)
    const positionKey = this.getPositionKey();
    const count = this.positionHashes.get(positionKey) || 0;
    this.positionHashes.set(positionKey, count + 1);
  }

  private getPositionKey(): string {
    const parts = this.chess.fen().split(' ');
    // Position + turn + castling + en passant (ignore halfmove/fullmove)
    return parts.slice(0, 4).join(' ');
  }

  /**
   * Get position repetition count
   */
  getRepetitionCount(): number {
    return this.positionHashes.get(this.getPositionKey()) || 1;
  }

  // ===========================================================================
  // State Export (for WebSocket)
  // ===========================================================================

  /**
   * Get complete game state for WebSocket transmission
   */
  getState(): ChessState {
    const result = this.getGameResult();
    
    return {
      fen: this.fen(),
      turn: this.turn(),
      moveNumber: this.moveNumber(),
      halfMoveClock: this.halfMoveClock(),
      isCheck: this.isCheck(),
      isCheckmate: this.isCheckmate(),
      isStalemate: this.isStalemate(),
      isDraw: this.isDraw(),
      drawReason: this.getDrawReason(),
      isGameOver: this.isGameOver(),
      result: result || undefined,
      legalMoves: this.getMoves({ verbose: false }),
      legalMovesVerbose: this.getMoves({ verbose: true }),
      lastMove: this.getLastMove(),
      history: this.history(),
      capturedPieces: this.getCapturedPieces(),
      pgn: this.pgn(),
      ascii: this.ascii(),
      castling: this.getCastlingRights(),
      enPassant: this.getEnPassantSquare(),
    };
  }

  private getDrawReason(): ChessState['drawReason'] {
    if (!this.isDraw()) return undefined;
    if (this.isStalemate()) return 'stalemate';
    if (this.isInsufficientMaterial()) return 'insufficient_material';
    if (this.isThreefoldRepetition()) return 'threefold_repetition';
    if (this.isFiftyMoveRule()) return 'fifty_move_rule';
    return undefined;
  }

  // ===========================================================================
  // Internal Helpers
  // ===========================================================================

  private convertMove(m: ChessJsMove): Move {
    return {
      from: m.from as Square,
      to: m.to as Square,
      san: m.san,
      lan: m.lan,
      piece: m.piece as PieceType,
      captured: m.captured as PieceType | undefined,
      promotion: m.promotion as PieceType | undefined,
      flags: m.flags,
      before: m.before,
      after: m.after,
      color: m.color as Color,
    };
  }

  private rebuildStateFromHistory(): void {
    // Rebuild captured pieces and move history from chess.js history
    this.moveHistory = [];
    this.capturedPieces = { white: [], black: [] };
    this.positionHashes.clear();

    const history = this.chess.history({ verbose: true }) as ChessJsMove[];
    
    // Reset to start and replay
    const currentFen = this.chess.fen();
    this.chess.reset();
    
    if (this.config.enableHashing) {
      this.recordPosition();
    }

    for (const m of history) {
      const move = this.convertMove(m);
      this.moveHistory.push(move);
      
      if (move.captured) {
        if (move.color === 'w') {
          this.capturedPieces.white.push(move.captured);
        } else {
          this.capturedPieces.black.push(move.captured);
        }
      }

      this.chess.move(m.san);
      
      if (this.config.enableHashing) {
        this.recordPosition();
      }
    }
  }

  /**
   * Clone the engine
   */
  clone(): ChessEngine {
    const clone = new ChessEngine({
      ...this.config,
      initialFen: this.fen(),
    });
    clone.moveHistory = [...this.moveHistory];
    clone.capturedPieces = {
      white: [...this.capturedPieces.white],
      black: [...this.capturedPieces.black],
    };
    clone.positionHashes = new Map(this.positionHashes);
    return clone;
  }

  /**
   * Get the underlying chess.js instance (for advanced usage)
   */
  getChessJs(): Chess {
    return this.chess;
  }
}

/**
 * Create a new chess engine instance
 */
export function createChessEngine(config?: ChessEngineConfig): ChessEngine {
  return new ChessEngine(config);
}

/**
 * Validate a FEN string
 */
export function isValidFen(fen: string): boolean {
  try {
    new Chess(fen);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse FEN into components
 */
export function parseFen(fen: string): {
  position: string;
  turn: Color;
  castling: string;
  enPassant: string;
  halfMoveClock: number;
  fullMoveNumber: number;
} | null {
  const parts = fen.split(' ');
  if (parts.length !== 6) return null;
  
  return {
    position: parts[0],
    turn: parts[1] as Color,
    castling: parts[2],
    enPassant: parts[3],
    halfMoveClock: parseInt(parts[4], 10),
    fullMoveNumber: parseInt(parts[5], 10),
  };
}

/**
 * Get square color (light or dark)
 */
export function getSquareColor(square: Square): 'light' | 'dark' {
  const file = square.charCodeAt(0) - 97; // a=0, h=7
  const rank = parseInt(square[1], 10) - 1; // 1=0, 8=7
  return (file + rank) % 2 === 0 ? 'dark' : 'light';
}

/**
 * Convert algebraic notation to coordinates
 */
export function squareToCoords(square: Square): { file: number; rank: number } {
  return {
    file: square.charCodeAt(0) - 97,
    rank: parseInt(square[1], 10) - 1,
  };
}

/**
 * Convert coordinates to algebraic notation
 */
export function coordsToSquare(file: number, rank: number): Square {
  return `${String.fromCharCode(97 + file)}${rank + 1}` as Square;
}
