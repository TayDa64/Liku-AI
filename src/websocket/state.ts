/**
 * Unified State Management for Liku-AI
 * 
 * Creates a shared state object that works for both file-based logging
 * and WebSocket broadcasting, ensuring consistency across all AI interfaces.
 * 
 * @module websocket/state
 */

/**
 * Game-specific structured state for AI decision making
 */
export interface DinoGameState {
  type: 'dino';
  isPlaying: boolean;
  isGameOver: boolean;
  isCountdown: boolean;
  countdownValue: number | null;
  score: number;
  dinoY: number;
  velocity: number;
  obstacles: Array<{
    x: number;
    y: number;
    type: 'CACTUS' | 'ROCK' | 'BUG' | 'BAT';
    distanceToDino: number;
  }>;
  nextObstacle: {
    distance: number;
    type: string;
    isFlying: boolean;
    shouldJump: boolean;
    urgency: 'none' | 'prepare' | 'now' | 'critical';
  } | null;
  recommendations: string[];
}

export interface SnakeGameState {
  type: 'snake';
  isPlaying: boolean;
  isGameOver: boolean;
  isCountdown: boolean;
  countdownValue: number | null;
  score: number;
  level: number;
  xp: number;
  fieldSize: number;
  snake: {
    head: { x: number; y: number };
    body: Array<{ x: number; y: number }>;
    length: number;
    direction: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
  };
  food: {
    x: number;
    y: number;
    type: 'APPLE' | 'BANANA' | 'CHILI' | 'ICE';
    deltaX: number;
    deltaY: number;
  };
  dangers: {
    willHitWall: boolean;
    willHitSelf: boolean;
    dangerDirection: string | null;
  };
  pathfinding: {
    optimalDirection: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | null;
    alternativeDirections: Array<'UP' | 'DOWN' | 'LEFT' | 'RIGHT'>;
    blockedDirections: Array<'UP' | 'DOWN' | 'LEFT' | 'RIGHT'>;
  };
  recommendations: string[];
}

export interface TicTacToeGameState {
  type: 'tictactoe';
  isPlaying: boolean;
  isGameOver: boolean;
  board: Array<Array<'X' | 'O' | null>>;
  currentPlayer: 'X' | 'O';
  isPlayerTurn: boolean;
  winner: 'X' | 'O' | 'draw' | null;
  validMoves: Array<{ row: number; col: number }>;
  minimax: {
    bestMove: { row: number; col: number } | null;
    score: number;
    winningLine: Array<{ row: number; col: number }> | null;
  };
  recommendations: string[];
}

export interface MenuState {
  type: 'menu';
  screen: string;
  selectedIndex: number;
  menuItems: Array<{
    index: number;
    text: string;
    selected: boolean;
  }>;
  stats: {
    level: number;
    xp: number;
    hunger: number;
    energy: number;
    happiness: number;
  } | null;
  recommendations: string[];
}

/**
 * Structured Chess game state for AI agents
 * Includes FEN notation for machine-readable board representation
 */
export interface ChessGameState {
  type: 'chess';
  isPlaying: boolean;
  isGameOver: boolean;
  
  // FEN string - THE key field for AI to understand board position
  fen: string;
  
  // Turn info
  turn: 'w' | 'b';
  moveNumber: number;
  isPlayerTurn: boolean;
  playerColor: 'w' | 'b';
  
  // Board as 8x8 array (for visual parsing)
  // Piece notation: K Q R B N P (white), k q r b n p (black), null for empty
  board: Array<Array<string | null>>;
  
  // Legal moves in UCI format (e.g., "e2e4", "g1f3")
  legalMoves: string[];
  
  // Legal moves in SAN format (e.g., "e4", "Nf3") 
  legalMovesSan: string[];
  
  // Game state flags
  isCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  isDraw: boolean;
  drawReason?: string;
  
  // Last move info
  lastMove: {
    from: string;
    to: string;
    san: string;
    piece: string;
    captured?: string;
  } | null;
  
  // Captured pieces
  capturedPieces: {
    white: string[];  // Pieces captured BY white (black pieces)
    black: string[];  // Pieces captured BY black (white pieces)
  };
  
  // Position evaluation (centipawns, positive = white advantage)
  evaluation: number;
  
  // Move history in SAN notation
  history: string[];
  
  // AI recommendations
  recommendations: string[];
  
  // Difficulty level if playing vs AI
  difficulty?: string;
  
  // Opening name if recognized
  opening?: string;
}

export type StructuredGameData = DinoGameState | SnakeGameState | TicTacToeGameState | ChessGameState | MenuState;

/**
 * Unified state container for all AI interfaces
 * Extends the base GameState but uses StructuredGameData instead of the raw game object
 */
export interface UnifiedGameState {
  timestamp: number;
  pid: number;
  screen: string;
  status: string;
  version: string;
  game?: StructuredGameData;
}

/**
 * StateManager - Singleton that manages unified game state
 * 
 * Provides a single source of truth for game state that can be:
 * - Written to file for legacy compatibility
 * - Broadcast via WebSocket for real-time AI
 * - Queried synchronously for internal use
 */
class StateManager {
  private currentState: UnifiedGameState | null = null;
  private stateHistory: UnifiedGameState[] = [];
  private maxHistorySize = 100;
  private subscribers: Set<(state: UnifiedGameState) => void> = new Set();
  private updateCount = 0;

  /**
   * Update the current game state
   * Notifies all subscribers and maintains history
   */
  update(state: Partial<UnifiedGameState>): UnifiedGameState {
    const now = Date.now();
    
    this.currentState = {
      ...this.currentState,
      ...state,
      timestamp: now,
      pid: process.pid,
      version: '2.0.0',
    } as UnifiedGameState;

    // Maintain history for replay/training
    this.stateHistory.push({ ...this.currentState });
    if (this.stateHistory.length > this.maxHistorySize) {
      this.stateHistory.shift();
    }

    this.updateCount++;

    // Notify subscribers
    for (const subscriber of this.subscribers) {
      try {
        subscriber(this.currentState);
      } catch (err) {
        console.error('[StateManager] Subscriber error:', err);
      }
    }

    return this.currentState;
  }

  /**
   * Get the current state
   */
  get(): UnifiedGameState | null {
    return this.currentState;
  }

  /**
   * Get state history for training/replay
   */
  getHistory(limit?: number): UnifiedGameState[] {
    if (limit) {
      return this.stateHistory.slice(-limit);
    }
    return [...this.stateHistory];
  }

  /**
   * Subscribe to state updates
   * Returns unsubscribe function
   */
  subscribe(callback: (state: UnifiedGameState) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  /**
   * Get statistics about state updates
   */
  getStats(): { updateCount: number; historySize: number; subscriberCount: number } {
    return {
      updateCount: this.updateCount,
      historySize: this.stateHistory.length,
      subscriberCount: this.subscribers.size,
    };
  }

  /**
   * Clear state, history, and subscribers
   */
  reset(): void {
    this.currentState = null;
    this.stateHistory = [];
    this.updateCount = 0;
    this.subscribers.clear();
  }
}

// Singleton instance
export const stateManager = new StateManager();

/**
 * Helper to create structured Dino game state
 */
export function createDinoState(params: {
  isPlaying: boolean;
  isGameOver: boolean;
  isCountdown?: boolean;
  countdownValue?: number | null;
  score: number;
  dinoY: number;
  velocity: number;
  obstacles: Array<{ x: number; y: number; type: string }>;
  dinoX: number;
}): DinoGameState {
  const { isPlaying, isGameOver, isCountdown = false, countdownValue = null, 
          score, dinoY, velocity, obstacles, dinoX } = params;

  // Calculate distances and sort obstacles
  const processedObstacles = obstacles.map(obs => ({
    x: obs.x,
    y: obs.y,
    type: obs.type as DinoGameState['obstacles'][0]['type'],
    distanceToDino: dinoX - obs.x,
  })).filter(obs => obs.distanceToDino > 0).sort((a, b) => a.distanceToDino - b.distanceToDino);

  // Find next obstacle and determine urgency
  const nextObs = processedObstacles[0] || null;
  let nextObstacle: DinoGameState['nextObstacle'] = null;
  const recommendations: string[] = [];

  if (nextObs) {
    const dist = nextObs.distanceToDino;
    const isFlying = nextObs.y > 0;
    
    // Determine urgency based on distance and game speed
    let urgency: 'none' | 'prepare' | 'now' | 'critical' = 'none';
    let shouldJump = false;

    if (dist <= 2 && !isFlying) {
      urgency = 'critical';
      shouldJump = dinoY === 0;
      if (shouldJump) recommendations.push('JUMP IMMEDIATELY - obstacle imminent!');
    } else if (dist <= 5 && !isFlying) {
      urgency = 'now';
      shouldJump = dinoY === 0;
      if (shouldJump) recommendations.push('Jump now for optimal timing');
    } else if (dist <= 10) {
      urgency = 'prepare';
      recommendations.push('Prepare to jump - obstacle approaching');
    }

    if (isFlying && dinoY > 0) {
      recommendations.push('Stay low - flying obstacle ahead');
    }

    nextObstacle = {
      distance: dist,
      type: nextObs.type,
      isFlying,
      shouldJump,
      urgency,
    };
  } else {
    recommendations.push('No obstacles - safe to proceed');
  }

  if (isCountdown) {
    recommendations.unshift(`Game starting in ${countdownValue} seconds`);
  }

  return {
    type: 'dino',
    isPlaying,
    isGameOver,
    isCountdown,
    countdownValue,
    score,
    dinoY,
    velocity,
    obstacles: processedObstacles,
    nextObstacle,
    recommendations,
  };
}

/**
 * Helper to create structured Snake game state
 */
export function createSnakeState(params: {
  isPlaying: boolean;
  isGameOver: boolean;
  isCountdown?: boolean;
  countdownValue?: number | null;
  score: number;
  level: number;
  xp: number;
  fieldSize: number;
  snake: Array<{ x: number; y: number }>;
  direction: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
  food: { x: number; y: number; type: string };
}): SnakeGameState {
  const { isPlaying, isGameOver, isCountdown = false, countdownValue = null,
          score, level, xp, fieldSize, snake, direction, food } = params;

  const head = snake[0];
  const body = snake.slice(1);
  
  // Calculate food delta
  const deltaX = food.x - head.x;
  const deltaY = food.y - head.y;

  // Calculate next position based on current direction
  const directionVectors: Record<string, { x: number; y: number }> = {
    UP: { x: 0, y: -1 },
    DOWN: { x: 0, y: 1 },
    LEFT: { x: -1, y: 0 },
    RIGHT: { x: 1, y: 0 },
  };

  const vec = directionVectors[direction];
  const nextPos = { x: head.x + vec.x, y: head.y + vec.y };

  // Check dangers
  const willHitWall = nextPos.x < 0 || nextPos.x >= fieldSize || 
                      nextPos.y < 0 || nextPos.y >= fieldSize;
  const willHitSelf = snake.some(s => s.x === nextPos.x && s.y === nextPos.y);

  // Calculate pathfinding
  const opposites: Record<string, string> = {
    UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT'
  };
  const opposite = opposites[direction];

  const allDirections: Array<'UP' | 'DOWN' | 'LEFT' | 'RIGHT'> = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
  const blockedDirections: Array<'UP' | 'DOWN' | 'LEFT' | 'RIGHT'> = [];
  const safeDirections: Array<'UP' | 'DOWN' | 'LEFT' | 'RIGHT'> = [];

  for (const dir of allDirections) {
    if (dir === opposite) {
      blockedDirections.push(dir); // Can't reverse
      continue;
    }
    
    const v = directionVectors[dir];
    const testPos = { x: head.x + v.x, y: head.y + v.y };
    const hitsWall = testPos.x < 0 || testPos.x >= fieldSize || 
                     testPos.y < 0 || testPos.y >= fieldSize;
    const hitsSelf = snake.some(s => s.x === testPos.x && s.y === testPos.y);
    
    if (hitsWall || hitsSelf) {
      blockedDirections.push(dir);
    } else {
      safeDirections.push(dir);
    }
  }

  // Determine optimal direction toward food
  let optimalDirection: SnakeGameState['pathfinding']['optimalDirection'] = null;
  
  // Prioritize larger delta first for efficiency
  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    if (deltaX < 0 && safeDirections.includes('LEFT')) optimalDirection = 'LEFT';
    else if (deltaX > 0 && safeDirections.includes('RIGHT')) optimalDirection = 'RIGHT';
    else if (deltaY < 0 && safeDirections.includes('UP')) optimalDirection = 'UP';
    else if (deltaY > 0 && safeDirections.includes('DOWN')) optimalDirection = 'DOWN';
  } else {
    if (deltaY < 0 && safeDirections.includes('UP')) optimalDirection = 'UP';
    else if (deltaY > 0 && safeDirections.includes('DOWN')) optimalDirection = 'DOWN';
    else if (deltaX < 0 && safeDirections.includes('LEFT')) optimalDirection = 'LEFT';
    else if (deltaX > 0 && safeDirections.includes('RIGHT')) optimalDirection = 'RIGHT';
  }

  // Fallback to any safe direction
  if (!optimalDirection && safeDirections.length > 0) {
    optimalDirection = safeDirections[0];
  }

  const recommendations: string[] = [];
  
  if (willHitWall || willHitSelf) {
    recommendations.push(`DANGER! Will hit ${willHitWall ? 'wall' : 'self'} - TURN NOW!`);
    if (safeDirections.length > 0) {
      recommendations.push(`Safe directions: ${safeDirections.join(', ')}`);
    }
  } else if (optimalDirection && optimalDirection !== direction) {
    recommendations.push(`Turn ${optimalDirection} to approach food`);
  } else if (direction === optimalDirection) {
    recommendations.push('On optimal path - continue straight');
  }

  if (isCountdown) {
    recommendations.unshift(`Game starting in ${countdownValue} seconds`);
  }

  return {
    type: 'snake',
    isPlaying,
    isGameOver,
    isCountdown,
    countdownValue,
    score,
    level,
    xp,
    fieldSize,
    snake: {
      head,
      body,
      length: snake.length,
      direction,
    },
    food: {
      x: food.x,
      y: food.y,
      type: food.type as SnakeGameState['food']['type'],
      deltaX,
      deltaY,
    },
    dangers: {
      willHitWall,
      willHitSelf,
      dangerDirection: (willHitWall || willHitSelf) ? direction : null,
    },
    pathfinding: {
      optimalDirection,
      alternativeDirections: safeDirections.filter(d => d !== optimalDirection),
      blockedDirections,
    },
    recommendations,
  };
}

/**
 * Helper to create structured TicTacToe game state with minimax
 */
export function createTicTacToeState(params: {
  board: Array<Array<'X' | 'O' | null>>;
  currentPlayer: 'X' | 'O';
  isPlayerTurn: boolean;
  isPlaying: boolean;
  isGameOver: boolean;
  winner?: 'X' | 'O' | 'draw' | null;
}): TicTacToeGameState {
  const { board, currentPlayer, isPlayerTurn, isPlaying, isGameOver, winner = null } = params;

  // Find valid moves
  const validMoves: Array<{ row: number; col: number }> = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      if (!board[row][col]) {
        validMoves.push({ row, col });
      }
    }
  }

  // Minimax evaluation
  function checkWinner(b: Array<Array<'X' | 'O' | null>>): 'X' | 'O' | null {
    // Rows
    for (let i = 0; i < 3; i++) {
      if (b[i][0] && b[i][0] === b[i][1] && b[i][1] === b[i][2]) return b[i][0];
    }
    // Columns
    for (let i = 0; i < 3; i++) {
      if (b[0][i] && b[0][i] === b[1][i] && b[1][i] === b[2][i]) return b[0][i];
    }
    // Diagonals
    if (b[0][0] && b[0][0] === b[1][1] && b[1][1] === b[2][2]) return b[0][0];
    if (b[0][2] && b[0][2] === b[1][1] && b[1][1] === b[2][0]) return b[0][2];
    return null;
  }

  function minimax(b: Array<Array<'X' | 'O' | null>>, isMaximizing: boolean, depth: number): number {
    const w = checkWinner(b);
    if (w === 'X') return -10 + depth; // AI is O, player is X
    if (w === 'O') return 10 - depth;
    
    // Check for draw
    const hasEmpty = b.some(row => row.some(cell => cell === null));
    if (!hasEmpty) return 0;

    if (isMaximizing) {
      let best = -Infinity;
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          if (!b[i][j]) {
            b[i][j] = 'O';
            best = Math.max(best, minimax(b, false, depth + 1));
            b[i][j] = null;
          }
        }
      }
      return best;
    } else {
      let best = Infinity;
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          if (!b[i][j]) {
            b[i][j] = 'X';
            best = Math.min(best, minimax(b, true, depth + 1));
            b[i][j] = null;
          }
        }
      }
      return best;
    }
  }

  let bestMove: { row: number; col: number } | null = null;
  let bestScore = -Infinity;
  
  if (validMoves.length > 0 && !isGameOver) {
    const boardCopy = board.map(row => [...row]);
    
    for (const move of validMoves) {
      boardCopy[move.row][move.col] = currentPlayer;
      const score = currentPlayer === 'O' 
        ? minimax(boardCopy, false, 0)
        : -minimax(boardCopy, true, 0);
      boardCopy[move.row][move.col] = null;
      
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }
  }

  // Find winning line if game is over
  let winningLine: Array<{ row: number; col: number }> | null = null;
  if (winner && winner !== 'draw') {
    // Check rows
    for (let i = 0; i < 3; i++) {
      if (board[i][0] === winner && board[i][1] === winner && board[i][2] === winner) {
        winningLine = [{ row: i, col: 0 }, { row: i, col: 1 }, { row: i, col: 2 }];
        break;
      }
    }
    // Check columns
    if (!winningLine) {
      for (let i = 0; i < 3; i++) {
        if (board[0][i] === winner && board[1][i] === winner && board[2][i] === winner) {
          winningLine = [{ row: 0, col: i }, { row: 1, col: i }, { row: 2, col: i }];
          break;
        }
      }
    }
    // Check diagonals
    if (!winningLine) {
      if (board[0][0] === winner && board[1][1] === winner && board[2][2] === winner) {
        winningLine = [{ row: 0, col: 0 }, { row: 1, col: 1 }, { row: 2, col: 2 }];
      } else if (board[0][2] === winner && board[1][1] === winner && board[2][0] === winner) {
        winningLine = [{ row: 0, col: 2 }, { row: 1, col: 1 }, { row: 2, col: 0 }];
      }
    }
  }

  const recommendations: string[] = [];
  
  if (isGameOver) {
    if (winner === 'draw') {
      recommendations.push("Game ended in a draw");
    } else {
      recommendations.push(`${winner} wins!`);
    }
  } else if (isPlayerTurn && bestMove) {
    recommendations.push(`Optimal move: row ${bestMove.row + 1}, col ${bestMove.col + 1}`);
    if (bestScore >= 10) {
      recommendations.push('This move leads to a win!');
    } else if (bestScore === 0) {
      recommendations.push('Best case: draw');
    }
  } else if (!isPlayerTurn) {
    recommendations.push('Waiting for opponent...');
  }

  return {
    type: 'tictactoe',
    isPlaying,
    isGameOver,
    board,
    currentPlayer,
    isPlayerTurn,
    winner,
    validMoves,
    minimax: {
      bestMove,
      score: bestScore,
      winningLine,
    },
    recommendations,
  };
}

/**
 * Helper to create structured Chess game state
 * Provides FEN notation and all data needed for AI to play
 */
export function createChessState(params: {
  fen: string;
  turn: 'w' | 'b';
  moveNumber: number;
  isPlayerTurn: boolean;
  playerColor: 'w' | 'b';
  legalMoves: Array<{ from: string; to: string; san: string }>;
  isCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  isDraw: boolean;
  drawReason?: string;
  lastMove?: { from: string; to: string; san: string; piece: string; captured?: string } | null;
  capturedPieces: { white: string[]; black: string[] };
  evaluation: number;
  history: string[];
  difficulty?: string;
  opening?: string;
}): ChessGameState {
  const {
    fen, turn, moveNumber, isPlayerTurn, playerColor,
    legalMoves, isCheck, isCheckmate, isStalemate, isDraw, drawReason,
    lastMove, capturedPieces, evaluation, history, difficulty, opening
  } = params;

  // Parse FEN to create board array
  const fenParts = fen.split(' ');
  const position = fenParts[0];
  const board: Array<Array<string | null>> = [];
  
  for (const rank of position.split('/')) {
    const row: Array<string | null> = [];
    for (const char of rank) {
      if (/\d/.test(char)) {
        // Empty squares
        for (let i = 0; i < parseInt(char, 10); i++) {
          row.push(null);
        }
      } else {
        row.push(char);
      }
    }
    board.push(row);
  }

  // Extract legal moves in both formats
  const legalMovesUci = legalMoves.map(m => `${m.from}${m.to}`);
  const legalMovesSan = legalMoves.map(m => m.san);

  // Build recommendations
  const recommendations: string[] = [];
  const isGameOver = isCheckmate || isStalemate || isDraw;
  
  if (isGameOver) {
    if (isCheckmate) {
      recommendations.push(`Checkmate! ${turn === 'w' ? 'Black' : 'White'} wins.`);
    } else if (isStalemate) {
      recommendations.push('Stalemate - game is a draw.');
    } else if (isDraw) {
      recommendations.push(`Draw: ${drawReason || 'by agreement'}`);
    }
  } else {
    // Provide helpful info for AI
    const turnStr = turn === 'w' ? 'White' : 'Black';
    recommendations.push(`${turnStr} to move. ${legalMoves.length} legal moves available.`);
    
    if (isCheck) {
      recommendations.push('KING IN CHECK - must escape!');
    }
    
    // Opening suggestion
    if (opening) {
      recommendations.push(`Opening: ${opening}`);
    }
    
    // Sample moves
    if (legalMoves.length > 0) {
      const sampleMoves = legalMovesSan.slice(0, 5).join(', ');
      recommendations.push(`Example moves: ${sampleMoves}${legalMoves.length > 5 ? '...' : ''}`);
    }
    
    // Evaluation context
    if (Math.abs(evaluation) < 50) {
      recommendations.push('Position is roughly equal.');
    } else if (evaluation > 200) {
      recommendations.push('White has a significant advantage.');
    } else if (evaluation < -200) {
      recommendations.push('Black has a significant advantage.');
    }
    
    // AI instruction
    recommendations.push(`To move: send action "chess_move" with params { move: "<SAN or UCI>" }`);
    recommendations.push(`Example: { "action": "chess_move", "params": { "move": "e4" } }`);
  }

  return {
    type: 'chess',
    isPlaying: !isGameOver,
    isGameOver,
    fen,
    turn,
    moveNumber,
    isPlayerTurn,
    playerColor,
    board,
    legalMoves: legalMovesUci,
    legalMovesSan,
    isCheck,
    isCheckmate,
    isStalemate,
    isDraw,
    drawReason,
    lastMove: lastMove || null,
    capturedPieces,
    evaluation,
    history,
    recommendations,
    difficulty,
    opening,
  };
}
