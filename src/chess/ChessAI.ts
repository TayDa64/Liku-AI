/**
 * ChessAI - AI Player Orchestration
 * 
 * Coordinates all chess AI components:
 * - Search engine for minimax move selection
 * - Evaluation for position analysis
 * - Opening book for early game
 * - Gemini API integration for hybrid AI
 * - Difficulty/ELO adjustment
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { Chess } from 'chess.js';
import { ChessEngine } from './ChessEngine.js';
import { ChessEvaluator } from './ChessEvaluator.js';
import { ChessSearch } from './ChessSearch.js';
import { ChessOpenings } from './ChessOpenings.js';
import {
  AIConfig,
  AIDifficulty,
  AIMove,
  AIPersonality,
  ChessState,
  Color,
  DEFAULT_AI_CONFIG,
  EvaluationBreakdown,
  Move,
  SearchResult,
} from './types.js';

// =============================================================================
// Difficulty Presets
// =============================================================================

const DIFFICULTY_CONFIGS: Record<AIDifficulty, Partial<AIConfig>> = {
  beginner: {
    maxDepth: 2,
    maxTime: 1000,
    useOpeningBook: false,
    targetElo: 800,
  },
  intermediate: {
    maxDepth: 4,
    maxTime: 3000,
    useOpeningBook: true,
    targetElo: 1400,
  },
  advanced: {
    maxDepth: 6,
    maxTime: 5000,
    useOpeningBook: true,
    targetElo: 2000,
  },
  grandmaster: {
    maxDepth: 8,
    maxTime: 10000,
    useOpeningBook: true,
    targetElo: 2600,
  },
};

// =============================================================================
// Gemini Prompts
// =============================================================================

const CHESS_SYSTEM_PROMPT = `You are LikuChess, an expert chess AI playing at grandmaster level.
Your task is to analyze chess positions and select the best move.

When analyzing a position, consider:
1. Material balance (who has more pieces and of what value)
2. King safety (is either king exposed or under attack)
3. Piece activity and mobility (which pieces are actively placed)
4. Pawn structure (weaknesses, passed pawns, pawn chains)
5. Center control (who controls the central squares)
6. Tactical opportunities (forks, pins, skewers, discovered attacks)
7. Strategic plans (what should each side be trying to achieve)

CRITICAL RULES:
- You MUST choose ONLY from the provided list of legal moves
- Respond ONLY with valid JSON
- Consider the position carefully before responding

Response format (JSON only, no markdown):
{
  "move": "e4",
  "evaluation": "+0.5",
  "reasoning": "Brief explanation of why this move is best"
}`;

const MOVE_PROMPT_TEMPLATE = `Current position (FEN): {fen}

Position analysis:
- Turn: {turn} to move
- Move number: {moveNumber}
- Material: {material}
- Check: {check}
- Legal moves: {legalMoves}

Recent moves: {history}

Select the best move from the legal moves list. Respond with JSON only.`;

// =============================================================================
// ChessAI Class
// =============================================================================

export class ChessAI {
  private config: AIConfig;
  private evaluator: ChessEvaluator;
  private search: ChessSearch;
  private openings: ChessOpenings;
  private genAI: GoogleGenerativeAI | null = null;
  private chess: Chess;

  constructor(config?: Partial<AIConfig>) {
    this.config = { ...DEFAULT_AI_CONFIG, ...config };
    this.evaluator = new ChessEvaluator();
    this.search = new ChessSearch(this.evaluator);
    this.openings = new ChessOpenings();
    this.chess = new Chess();

    // Initialize Gemini if API key available
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
    if (apiKey && this.config.useGemini) {
      this.genAI = new GoogleGenerativeAI(apiKey);
    }
  }

  /**
   * Get the best move for a position
   * @param fen - Position in FEN notation
   * @returns AI move with evaluation and reasoning
   */
  async getBestMove(fen: string): Promise<AIMove> {
    this.chess.load(fen);
    
    const legalMoves = this.chess.moves();
    if (legalMoves.length === 0) {
      throw new Error('No legal moves available');
    }
    
    // Single move - return immediately
    if (legalMoves.length === 1) {
      return {
        move: legalMoves[0],
        evaluation: this.evaluator.evaluate(fen),
        confidence: 1.0,
        reasoning: 'Only legal move',
      };
    }

    // Check opening book first
    if (this.config.useOpeningBook) {
      const bookMove = this.openings.getMove(fen);
      if (bookMove) {
        return {
          move: bookMove.move,
          evaluation: 0,
          confidence: 0.95,
          reasoning: `Opening book: ${bookMove.opening || 'Theory'}`,
          openingName: bookMove.opening,
        };
      }
    }

    // Use Gemini for move selection if configured
    if (this.config.useGemini && this.genAI) {
      try {
        const geminiMove = await this.getGeminiMove(fen);
        if (geminiMove && legalMoves.includes(geminiMove.move)) {
          return geminiMove;
        }
      } catch (error) {
        console.error('Gemini error, falling back to search:', error);
      }
    }

    // Minimax search
    const searchResult = this.search.search(
      fen,
      this.config.maxDepth,
      this.config.maxTime
    );

    // Apply difficulty adjustment (add randomness for lower ELO)
    let selectedMove = searchResult.bestMove;
    if (this.config.targetElo && this.config.targetElo < 2400) {
      selectedMove = this.applyDifficultyAdjustment(fen, searchResult, legalMoves);
    }

    // Get alternatives
    const alternatives = this.getAlternatives(fen, searchResult.bestMove);

    return {
      move: selectedMove,
      evaluation: searchResult.score,
      confidence: this.calculateConfidence(searchResult),
      searchInfo: searchResult,
      alternatives,
    };
  }

  /**
   * Get move from Gemini API
   */
  private async getGeminiMove(fen: string): Promise<AIMove | null> {
    if (!this.genAI) return null;

    this.chess.load(fen);
    
    const prompt = MOVE_PROMPT_TEMPLATE
      .replace('{fen}', fen)
      .replace('{turn}', this.chess.turn() === 'w' ? 'White' : 'Black')
      .replace('{moveNumber}', String(this.chess.moveNumber()))
      .replace('{material}', this.getMaterialString())
      .replace('{check}', this.chess.isCheck() ? 'YES' : 'No')
      .replace('{legalMoves}', this.chess.moves().join(', '))
      .replace('{history}', this.chess.history().slice(-10).join(' ') || 'Game start');

    try {
      const model = this.genAI.getGenerativeModel({ 
        model: 'gemini-2.5-flash',
        systemInstruction: CHESS_SYSTEM_PROMPT,
      });

      const result = await model.generateContent(prompt);
      const text = result.response.text();
      
      // Parse JSON response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        
        // Validate move
        if (parsed.move && this.chess.moves().includes(parsed.move)) {
          return {
            move: parsed.move,
            evaluation: this.parseEvaluation(parsed.evaluation),
            confidence: 0.9,
            reasoning: parsed.reasoning,
          };
        }
      }
    } catch {
      // Gemini failed, will fall back to search
    }

    return null;
  }

  /**
   * Parse evaluation string to centipawns
   */
  private parseEvaluation(evalStr?: string): number {
    if (!evalStr) return 0;
    
    const cleaned = evalStr.replace(/[+\s]/g, '');
    
    // Check for mate
    if (cleaned.startsWith('M') || cleaned.startsWith('#')) {
      const mateIn = parseInt(cleaned.slice(1), 10) || 1;
      return mateIn > 0 ? 50000 - mateIn : -50000 + mateIn;
    }
    
    // Parse as float and convert to centipawns
    const value = parseFloat(cleaned);
    return isNaN(value) ? 0 : Math.round(value * 100);
  }

  /**
   * Get material string for prompt
   */
  private getMaterialString(): string {
    const board = this.chess.board();
    const material = { w: 0, b: 0 };
    const values: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
    
    for (const row of board) {
      for (const piece of row) {
        if (piece && piece.type !== 'k') {
          material[piece.color] += values[piece.type] || 0;
        }
      }
    }
    
    const diff = material.w - material.b;
    if (diff === 0) return 'Equal material';
    return diff > 0 ? `White +${diff}` : `Black +${Math.abs(diff)}`;
  }

  /**
   * Apply difficulty adjustment to move selection
   */
  private applyDifficultyAdjustment(
    fen: string,
    searchResult: SearchResult,
    legalMoves: string[]
  ): string {
    if (!this.config.targetElo) return searchResult.bestMove;
    
    // Calculate blunder probability based on target ELO
    // Higher ELO = lower chance of selecting suboptimal move
    const blunderChance = Math.max(0, (2400 - this.config.targetElo) / 4000);
    
    if (Math.random() < blunderChance) {
      // Select a random legal move (weighted toward reasonable moves)
      const randomIdx = Math.floor(Math.random() * Math.min(legalMoves.length, 5));
      return legalMoves[randomIdx];
    }
    
    return searchResult.bestMove;
  }

  /**
   * Get alternative moves considered
   */
  private getAlternatives(fen: string, bestMove: string): Array<{ move: string; evaluation: number }> {
    this.chess.load(fen);
    const moves = this.chess.moves();
    const alternatives: Array<{ move: string; evaluation: number }> = [];
    
    // Get top 3 alternatives (quick evaluation)
    for (const move of moves.slice(0, 4)) {
      if (move !== bestMove) {
        this.chess.move(move);
        const eval_ = -this.evaluator.evaluate(this.chess.fen());
        this.chess.undo();
        alternatives.push({ move, evaluation: eval_ });
      }
    }
    
    return alternatives.sort((a, b) => b.evaluation - a.evaluation).slice(0, 3);
  }

  /**
   * Calculate confidence in move selection
   */
  private calculateConfidence(result: SearchResult): number {
    // Higher depth = more confidence
    const depthFactor = Math.min(1, result.depth / 8);
    
    // More nodes = more confidence
    const nodeFactor = Math.min(1, result.nodes / 100000);
    
    // Not aborted = more confidence
    const abortedFactor = result.aborted ? 0.7 : 1.0;
    
    return Math.round((depthFactor * 0.5 + nodeFactor * 0.3 + abortedFactor * 0.2) * 100) / 100;
  }

  /**
   * Analyze a position without making a move
   */
  analyzePosition(fen: string, depth?: number): {
    evaluation: EvaluationBreakdown;
    bestMove: string;
    pv: string[];
    searchResult: SearchResult;
  } {
    const evaluation = this.evaluator.getEvaluationBreakdown(fen);
    const searchResult = this.search.search(fen, depth || this.config.maxDepth, this.config.maxTime);
    
    return {
      evaluation,
      bestMove: searchResult.bestMove,
      pv: searchResult.pv,
      searchResult,
    };
  }

  /**
   * Get a hint for the current position
   */
  async getHint(fen: string): Promise<{ move: string; evaluation: number; explanation: string }> {
    const result = await this.getBestMove(fen);
    
    // Generate explanation
    this.chess.load(fen);
    this.chess.move(result.move);
    const afterFen = this.chess.fen();
    this.chess.undo();
    
    const beforeEval = this.evaluator.getEvaluationBreakdown(fen);
    const afterEval = this.evaluator.getEvaluationBreakdown(afterFen);
    
    let explanation = result.reasoning || '';
    if (!explanation) {
      // Generate explanation from evaluation changes
      if (afterEval.material !== beforeEval.material) {
        explanation = 'Wins material';
      } else if (afterEval.kingSafety > beforeEval.kingSafety) {
        explanation = 'Improves king safety';
      } else if (afterEval.centerControl > beforeEval.centerControl) {
        explanation = 'Controls the center';
      } else if (afterEval.mobility > beforeEval.mobility) {
        explanation = 'Increases piece activity';
      } else {
        explanation = 'Develops position';
      }
    }
    
    return {
      move: result.move,
      evaluation: result.evaluation,
      explanation,
    };
  }

  /**
   * Create AI from difficulty preset
   */
  static fromDifficulty(difficulty: AIDifficulty, overrides?: Partial<AIConfig>): ChessAI {
    const preset = DIFFICULTY_CONFIGS[difficulty];
    return new ChessAI({ ...preset, ...overrides });
  }

  /**
   * Update AI configuration
   */
  setConfig(config: Partial<AIConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Update Gemini instance if needed
    if (config.useGemini !== undefined) {
      if (config.useGemini) {
        const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
        if (apiKey) {
          this.genAI = new GoogleGenerativeAI(apiKey);
        }
      } else {
        this.genAI = null;
      }
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): AIConfig {
    return { ...this.config };
  }

  /**
   * Stop ongoing search
   */
  stop(): void {
    this.search.stop();
  }

  /**
   * Clear search caches
   */
  clearCache(): void {
    this.search.clearTT();
  }
}

/**
 * Create a chess AI instance
 */
export function createChessAI(config?: Partial<AIConfig>): ChessAI {
  return new ChessAI(config);
}

/**
 * Create AI vs AI match controller
 */
export class ChessAIMatch {
  private engine: ChessEngine;
  private whiteAI: ChessAI;
  private blackAI: ChessAI;
  private moveHistory: Array<{ move: string; evaluation: number; time: number }> = [];
  private onMove?: (state: ChessState, aiMove: AIMove) => void;
  private onGameEnd?: (result: string, reason: string) => void;

  constructor(
    whiteConfig: Partial<AIConfig>,
    blackConfig: Partial<AIConfig>,
    startingFen?: string
  ) {
    this.engine = new ChessEngine({ initialFen: startingFen });
    this.whiteAI = new ChessAI({ ...whiteConfig, name: whiteConfig.name || 'White AI' });
    this.blackAI = new ChessAI({ ...blackConfig, name: blackConfig.name || 'Black AI' });
  }

  /**
   * Set move callback
   */
  onMoveCallback(callback: (state: ChessState, aiMove: AIMove) => void): void {
    this.onMove = callback;
  }

  /**
   * Set game end callback
   */
  onGameEndCallback(callback: (result: string, reason: string) => void): void {
    this.onGameEnd = callback;
  }

  /**
   * Play a single move
   */
  async playMove(): Promise<AIMove | null> {
    if (this.engine.isGameOver()) {
      return null;
    }

    const startTime = Date.now();
    const ai = this.engine.turn() === 'w' ? this.whiteAI : this.blackAI;
    
    const aiMove = await ai.getBestMove(this.engine.fen());
    const elapsed = Date.now() - startTime;
    
    this.engine.move(aiMove.move);
    
    this.moveHistory.push({
      move: aiMove.move,
      evaluation: aiMove.evaluation,
      time: elapsed,
    });

    if (this.onMove) {
      this.onMove(this.engine.getState(), aiMove);
    }

    if (this.engine.isGameOver()) {
      const result = this.engine.getGameResult();
      if (this.onGameEnd && result) {
        const resultStr = result.winner === 'w' ? '1-0' : result.winner === 'b' ? '0-1' : '1/2-1/2';
        this.onGameEnd(resultStr, result.reason);
      }
    }

    return aiMove;
  }

  /**
   * Play full game
   */
  async playGame(maxMoves: number = 200, delayMs: number = 0): Promise<{
    pgn: string;
    result: string;
    reason: string;
    moveHistory: Array<{ move: string; evaluation: number; time: number }>;
  }> {
    let moves = 0;
    
    while (!this.engine.isGameOver() && moves < maxMoves) {
      await this.playMove();
      moves++;
      
      if (delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    const result = this.engine.getGameResult();
    
    return {
      pgn: this.engine.pgn(),
      result: result ? result.score : '1/2-1/2',
      reason: result?.reason || 'max_moves',
      moveHistory: this.moveHistory,
    };
  }

  /**
   * Get current state
   */
  getState(): ChessState {
    return this.engine.getState();
  }

  /**
   * Get move history
   */
  getMoveHistory(): typeof this.moveHistory {
    return [...this.moveHistory];
  }

  /**
   * Reset match
   */
  reset(startingFen?: string): void {
    this.engine.reset(startingFen);
    this.moveHistory = [];
  }
}

/**
 * Create an AI vs AI match
 */
export function createChessAIMatch(
  whiteConfig: Partial<AIConfig>,
  blackConfig: Partial<AIConfig>,
  startingFen?: string
): ChessAIMatch {
  return new ChessAIMatch(whiteConfig, blackConfig, startingFen);
}
