/**
 * Chess.tsx - Beautiful Production-Ready Terminal Chess UI
 * 
 * Features:
 * - Large, properly aligned board with box-drawing characters
 * - Cursor-based movement for beginners (arrow keys + Enter)
 * - SAN notation input for advanced players (Tab to switch)
 * - Visual highlights: cursor, selected piece, legal moves, last move
 * - AI opponent with multiple difficulty levels
 * - Hint system, undo, flip board
 * - AI-readable state logging with FEN notation
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import chalk from 'chalk';
import { ChessEngine } from '../../chess/ChessEngine.js';
import { ChessAI } from '../../chess/ChessAI.js';
import { ChessEvaluator } from '../../chess/ChessEvaluator.js';
import { logGameState } from '../../core/GameStateLogger.js';
import { createChessState } from '../../websocket/state.js';
import {
  AIDifficulty,
  ChessState,
  Color,
  Move,
  Square,
} from '../../chess/types.js';

// =============================================================================
// Types
// =============================================================================

interface ChessProps {
  onExit: () => void;
  mode?: 'local' | 'ai' | 'websocket' | 'spectate';
  difficulty?: AIDifficulty;
  playerColor?: Color;
}

type InputMode = 'cursor' | 'text';
type CursorState = 'selecting' | 'moving';

// =============================================================================
// Constants
// =============================================================================

// Unicode chess pieces - kept for info panel display only
const PIECES: Record<string, string> = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

// =============================================================================
// Helpers
// =============================================================================

function coordsToSquare(row: number, col: number): Square {
  return `${FILES[col]}${8 - row}` as Square;
}

function parseFen(fen: string): (string | null)[][] {
  const position = fen.split(' ')[0];
  return position.split('/').map(row => {
    const cells: (string | null)[] = [];
    for (const c of row) {
      if (/\d/.test(c)) {
        for (let i = 0; i < parseInt(c, 10); i++) cells.push(null);
      } else {
        cells.push(c);
      }
    }
    return cells;
  });
}

// =============================================================================
// Large Beautiful Board Component - Using Half-Block Unicode Characters
// =============================================================================
// 
// This approach is based on research from GeertBosch/chessfun which discovered
// that using half-block Unicode characters (▌ U+258C and ▐ U+2590) with
// strategic foreground/background color manipulation allows us to create
// perfectly aligned board cells that don't suffer from variable-width
// Unicode chess piece rendering issues.
//
// The key insight: "By putting one of these [half-blocks] between the pieces
// with the foreground set to the light square color and the background to the
// dark square color, we can simulate half spaces."
//
// Each cell is rendered as: [half-block][piece][half-block]
// The half-blocks use foreground=nextSquareColor and background=currentSquareColor
// to create seamless visual transitions.
// =============================================================================

// Terminalchess-style piece mapping
// Uses SWAPPED symbols for better visual distinction:
// - White pieces: outlined/hollow symbols (♖♘♗♕♔♙)
// - Black pieces: filled/solid symbols (♜♞♝♛♚♟)
// This matches the convention in williamjchen/terminalchess
const DISPLAY_PIECES: Record<string, string> = {
  R: '♖', N: '♘', B: '♗', Q: '♕', K: '♔', P: '♙',  // White (outlined)
  r: '♜', n: '♞', b: '♝', q: '♛', k: '♚', p: '♟',  // Black (filled)
};

// Board colors using Ink's named colors
const LIGHT_SQUARE = 'white';
const DARK_SQUARE = 'gray';

// Highlight colors
const CURSOR_COLOR = 'green';
const SELECTED_COLOR = 'yellow';
const LEGAL_COLOR = 'cyan';
const LAST_MOVE_COLOR = 'blue';

interface BoardProps {
  fen: string;
  flipped: boolean;
  cursorRow: number;
  cursorCol: number;
  selectedSquare: string | null;
  legalTargets: Set<string>;
  lastMove: Move | null;
  inputMode: InputMode;
}

function ChessBoard({
  fen, flipped, cursorRow, cursorCol,
  selectedSquare, legalTargets, lastMove, inputMode,
}: BoardProps) {
  const board = parseFen(fen);
  const rows = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const cols = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];

  // Selected square coords
  const selRow = selectedSquare ? 8 - parseInt(selectedSquare[1], 10) : -1;
  const selCol = selectedSquare ? selectedSquare.charCodeAt(0) - 97 : -1;

  // Last move coords
  const lastFrom = lastMove?.from;
  const lastTo = lastMove?.to;
  const lfRow = lastFrom ? 8 - parseInt(lastFrom[1], 10) : -1;
  const lfCol = lastFrom ? lastFrom.charCodeAt(0) - 97 : -1;
  const ltRow = lastTo ? 8 - parseInt(lastTo[1], 10) : -1;
  const ltCol = lastTo ? lastTo.charCodeAt(0) - 97 : -1;

  // Get background color for a square
  const getSquareColor = (row: number, col: number): string => {
    const sq = coordsToSquare(row, col);
    const isLight = (row + col) % 2 === 0;
    
    // Highlight priority: cursor > selected > legal > last move > base
    const isCursor = inputMode === 'cursor' && cursorRow === row && cursorCol === col;
    const isSelected = selRow === row && selCol === col;
    const isLegalTarget = legalTargets.has(sq);
    const isLastMove = (lfRow === row && lfCol === col) || (ltRow === row && ltCol === col);
    
    if (isCursor) return CURSOR_COLOR;
    if (isSelected) return SELECTED_COLOR;
    if (isLegalTarget && selectedSquare) return LEGAL_COLOR;
    if (isLastMove) return LAST_MOVE_COLOR;
    
    // Base checkerboard
    return isLight ? LIGHT_SQUARE : DARK_SQUARE;
  };

  // Get foreground color for piece visibility on any background
  // Simple: White pieces = blue, Black pieces = red (consistent across all squares)
  const getPieceColor = (piece: string | null, bgColor: string): string => {
    if (!piece) {
      // Empty square markers should contrast with background
      return bgColor === 'white' ? 'gray' : 'whiteBright';
    }
    const isWhitePiece = piece === piece.toUpperCase();
    return isWhitePiece ? 'blueBright' : 'red';
  };

  // Chalk color mapping for backgrounds
  const bgChalk: Record<string, (s: string) => string> = {
    white: chalk.bgWhite,
    gray: chalk.bgGray,
    green: chalk.bgGreen,
    yellow: chalk.bgYellow,
    cyan: chalk.bgCyan,
    blue: chalk.bgBlue,
  };

  // Chalk color mapping for foregrounds  
  const fgChalk: Record<string, (s: string) => string> = {
    black: chalk.black,
    blackBright: chalk.blackBright,
    white: chalk.white,
    whiteBright: chalk.whiteBright,
    gray: chalk.gray,
    blueBright: chalk.blueBright,
    red: chalk.red,
  };

  // Build entire board row as single styled string using chalk
  const buildChessRow = (row: number): string => {
    const rank = 8 - row;
    let rowStr = chalk.cyan.bold(` ${rank} `);
    
    for (const col of cols) {
      const piece = board[row][col];
      const bgColor = getSquareColor(row, col);
      const fgColor = getPieceColor(piece, bgColor);
      
      const isCursor = inputMode === 'cursor' && cursorRow === row && cursorCol === col;
      const isLegalTarget = !!(legalTargets.has(coordsToSquare(row, col)) && selectedSquare);
      
      // Cell content - use simple ASCII for markers, Unicode for pieces
      let content: string;
      if (piece) {
        content = DISPLAY_PIECES[piece];
      } else if (isCursor) {
        content = '+';
      } else if (isLegalTarget) {
        content = '.';
      } else {
        content = ' ';
      }
      
      // Apply colors using chalk and build as single string
      const bg = bgChalk[bgColor] || chalk.bgGray;
      const fg = fgChalk[fgColor] || chalk.white;
      rowStr += bg(fg(` ${content} `));
    }
    
    rowStr += chalk.cyan.bold(` ${rank}`);
    return rowStr;
  };

  // File labels as single string
  const fileLabels = chalk.cyan('    ' + cols.map(col => ` ${FILES[col]} `).join(''));

  return (
    <Box flexDirection="column">
      {/* File labels */}
      <Text>{fileLabels}</Text>
      
      {/* Board rows - each as single Text with chalk-styled string */}
      {rows.map((row) => (
        <Text key={row}>{buildChessRow(row)}</Text>
      ))}
      
      {/* Bottom file labels */}
      <Text>{fileLabels}</Text>
    </Box>
  );
}

// =============================================================================
// Info Panel
// =============================================================================

interface InfoProps {
  state: ChessState;
  evaluation: number;
  thinking: boolean;
  selectedSquare: string | null;
  cursorState: CursorState;
  hint: string | null;
  inputMode: InputMode;
}

function InfoPanel({ state, evaluation, thinking, selectedSquare, cursorState, hint, inputMode }: InfoProps) {
  const formatEval = (cp: number) => {
    if (Math.abs(cp) > 10000) {
      const m = Math.ceil((50000 - Math.abs(cp)) / 2);
      return cp > 0 ? `#${m}` : `#-${m}`;
    }
    const p = cp / 100;
    return p >= 0 ? `+${p.toFixed(2)}` : p.toFixed(2);
  };

  return (
    <Box flexDirection="column" marginLeft={2} width={30}>
      <Box borderStyle="round" borderColor="cyan" paddingX={1} marginBottom={1}>
        <Text bold color="cyan">♔ Game Status ♚</Text>
      </Box>

      <Text>Turn: <Text bold color={state.turn === 'w' ? 'whiteBright' : 'gray'}>
        {state.turn === 'w' ? '● White' : '● Black'}
      </Text></Text>
      
      {thinking && <Text color="yellow">⏳ AI thinking...</Text>}
      
      <Text dimColor>Move #{state.moveNumber}</Text>
      
      <Text>Eval: <Text color={evaluation > 50 ? 'green' : evaluation < -50 ? 'red' : 'gray'}>
        {formatEval(evaluation)}
      </Text></Text>

      {state.isCheck && !state.isCheckmate && <Text color="red" bold>⚠ CHECK!</Text>}
      {state.isCheckmate && <Text color="red" bold>♔ CHECKMATE!</Text>}
      {state.isStalemate && <Text color="yellow" bold>½ STALEMATE</Text>}
      {state.isDraw && !state.isStalemate && <Text color="yellow">½ {state.drawReason}</Text>}

      {selectedSquare && (
        <Box marginTop={1}>
          <Text color="green">Selected: <Text bold>{selectedSquare.toUpperCase()}</Text></Text>
        </Box>
      )}

      <Box marginTop={1} flexDirection="column">
        <Text dimColor>Captured:</Text>
        {state.capturedPieces.white.length > 0 && (
          <Text>⬜ {state.capturedPieces.white.map((p: string) => PIECES[p.toLowerCase()]).join('')}</Text>
        )}
        {state.capturedPieces.black.length > 0 && (
          <Text>⬛ {state.capturedPieces.black.map((p: string) => PIECES[p]).join('')}</Text>
        )}
      </Box>

      {state.lastMove && (
        <Box marginTop={1}>
          <Text color="blue">Last: <Text bold>{state.lastMove.san}</Text></Text>
        </Box>
      )}

      {hint && (
        <Box marginTop={1} flexDirection="column">
          <Text color="magenta" bold>💡 Hint</Text>
          <Text color="magenta" wrap="wrap">{hint}</Text>
        </Box>
      )}

      {state.history.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>Recent:</Text>
          <Text dimColor wrap="truncate">{state.history.slice(-8).join(' ')}</Text>
        </Box>
      )}
    </Box>
  );
}

// =============================================================================
// Controls
// =============================================================================

interface ControlsProps {
  inputMode: InputMode;
  cursorState: CursorState;
}

function Controls({ inputMode, cursorState }: ControlsProps) {
  return (
    <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
      <Text bold color="cyan">🎮 Controls</Text>
      
      {inputMode === 'cursor' ? (
        <Box flexDirection="column">
          <Text color="green">Cursor Mode (Beginner-Friendly)</Text>
          <Text dimColor>  ↑↓←→   Navigate board</Text>
          <Text dimColor>  Enter   {cursorState === 'selecting' ? 'Select piece' : 'Move piece'}</Text>
          <Text dimColor>  Esc     {cursorState === 'moving' ? 'Cancel' : 'Exit game'}</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          <Text color="yellow">Text Mode (Advanced)</Text>
          <Text dimColor>  Type: e4, Nf3, O-O, Qxd7+</Text>
          <Text dimColor>  Enter to submit</Text>
        </Box>
      )}
      
      <Box marginTop={1}>
        <Text dimColor>[Tab] Switch Mode  [H] Hint  [U] Undo  [F] Flip  [R] Resign  [N] New</Text>
      </Box>
    </Box>
  );
}

// =============================================================================
// Main Chess Component
// =============================================================================

const Chess: React.FC<ChessProps> = ({
  onExit,
  mode = 'ai',
  difficulty = 'intermediate',
  playerColor = 'w',
}) => {
  const { exit } = useApp();

  // Engine
  const [engine] = useState(() => new ChessEngine());
  const [ai] = useState(() => ChessAI.fromDifficulty(difficulty, { useGemini: false }));
  const [evaluator] = useState(() => new ChessEvaluator());

  // State
  const [gameState, setGameState] = useState<ChessState>(() => engine.getState());
  const [evaluation, setEvaluation] = useState(0);
  const [flipped, setFlipped] = useState(playerColor === 'b');
  const [thinking, setThinking] = useState(false);

  // Input
  const [inputMode, setInputMode] = useState<InputMode>('cursor');
  const [cursorRow, setCursorRow] = useState(6);
  const [cursorCol, setCursorCol] = useState(4);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [cursorState, setCursorState] = useState<CursorState>('selecting');
  const [legalTargets, setLegalTargets] = useState<Set<string>>(new Set());

  // Text input
  const [moveInput, setMoveInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Update helper
  const updateState = useCallback(() => {
    setGameState(engine.getState());
    setEvaluation(evaluator.evaluate(engine.fen()));
    setError(null);
    setSuccessMsg(null);
  }, [engine, evaluator]);

  // Explicit state logging helper - call after every state change
  const logChessState = useCallback((customStatus?: string) => {
    try {
      const currentState = engine.getState();
      const moves = engine.getMoves({ verbose: true }) as Move[];
      const legalMoves = moves.map(m => ({ from: m.from, to: m.to, san: m.san }));
      const isPlayerTurn = engine.turn() === playerColor;
      const currentEval = evaluator.evaluate(engine.fen());

      const fen = currentState.fen;
      const board = parseFen(fen);
      let visualBoard = '    a   b   c   d   e   f   g   h\n';
      visualBoard += '  +---+---+---+---+---+---+---+---+\n';
      for (let row = 0; row < 8; row++) {
        const rank = 8 - row;
        let rowStr = `${rank} |`;
        for (let col = 0; col < 8; col++) {
          const piece = board[row][col];
          rowStr += ` ${piece || '.'} |`;
        }
        visualBoard += rowStr + ` ${rank}\n`;
        visualBoard += '  +---+---+---+---+---+---+---+---+\n';
      }
      visualBoard += '    a   b   c   d   e   f   g   h\n';

      const turnStr = currentState.turn === 'w' ? 'White' : 'Black';
      let status = customStatus || `${turnStr} to move (Move #${currentState.moveNumber})`;
      if (currentState.isCheckmate) status = `CHECKMATE! ${turnStr} loses.`;
      else if (currentState.isStalemate) status = 'STALEMATE - Draw';
      else if (currentState.isDraw) status = `DRAW: ${currentState.drawReason}`;
      else if (currentState.isCheck) status += ' - CHECK!';

      const controls = 'Arrow keys: move cursor | Enter: select/move | Tab: text mode | H: hint | U: undo | Esc: exit';

      const structuredState = createChessState({
        fen: currentState.fen,
        turn: currentState.turn,
        moveNumber: currentState.moveNumber,
        isPlayerTurn,
        playerColor,
        legalMoves,
        isCheck: currentState.isCheck,
        isCheckmate: currentState.isCheckmate,
        isStalemate: currentState.isStalemate,
        isDraw: currentState.isDraw,
        drawReason: currentState.drawReason,
        lastMove: currentState.lastMove ? {
          from: currentState.lastMove.from,
          to: currentState.lastMove.to,
          san: currentState.lastMove.san,
          piece: currentState.lastMove.piece,
          captured: currentState.lastMove.captured,
        } : null,
        capturedPieces: currentState.capturedPieces,
        evaluation: currentEval,
        history: currentState.history,
        difficulty,
        opening: currentState.lastMove?.san ? undefined : 'Starting position',
        inputMode: inputMode, // Include control mode so AI knows to use text or cursor
      });

      logGameState('Playing Chess', status, visualBoard, controls, structuredState);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logGameState('Playing Chess (Error)', `Error: ${errorMessage}`, 'Board unavailable', 'Esc: exit');
    }
  }, [engine, evaluator, playerColor, difficulty, inputMode]);

  // Get legal moves for square
  const getLegalTargets = useCallback((sq: string): Set<string> => {
    const moves = engine.getMoves({ verbose: true }) as Move[];
    return new Set(moves.filter(m => m.from === sq).map(m => m.to));
  }, [engine]);

  // AI move
  const makeAIMove = useCallback(async () => {
    if (engine.isGameOver()) return;
    setThinking(true);
    setHint(null);
    setSuccessMsg(null);
    try {
      const aiMove = await ai.getBestMove(engine.fen());
      engine.move(aiMove.move);
      updateState();
      // Log state immediately after AI move
      setTimeout(() => logChessState(`AI played ${aiMove.move}`), 50);
    } catch {
      setError('AI error');
    } finally {
      setThinking(false);
    }
  }, [engine, ai, updateState, logChessState]);

  // AI turn check
  useEffect(() => {
    if (mode === 'ai' && !engine.isGameOver() && engine.turn() !== playerColor && !thinking) {
      const t = setTimeout(makeAIMove, 500);
      return () => clearTimeout(t);
    }
  }, [mode, engine, playerColor, thinking, makeAIMove, gameState]);

  // Log initial state immediately when chess screen loads (like TicTacToe does)
  useEffect(() => {
    // Build initial board state directly (don't rely on callbacks that may not be ready)
    const initialFen = engine.fen();
    const initialState = engine.getState();
    const moves = engine.getMoves({ verbose: true }) as Move[];
    const legalMoves = moves.map(m => ({ from: m.from, to: m.to, san: m.san }));
    const isPlayerTurn = engine.turn() === playerColor;
    const currentEval = evaluator.evaluate(initialFen);

    // Build visual ASCII board
    const board = parseFen(initialFen);
    let visualBoard = '    a   b   c   d   e   f   g   h\n';
    visualBoard += '  +---+---+---+---+---+---+---+---+\n';
    for (let row = 0; row < 8; row++) {
      const rank = 8 - row;
      let rowStr = `${rank} |`;
      for (let col = 0; col < 8; col++) {
        const piece = board[row][col];
        rowStr += ` ${piece || '.'} |`;
      }
      visualBoard += rowStr + ` ${rank}\n`;
      visualBoard += '  +---+---+---+---+---+---+---+---+\n';
    }
    visualBoard += '    a   b   c   d   e   f   g   h\n';

    const status = 'White to move (Move #1) - Game ready';
    const controls = 'Arrow keys: move cursor | Enter: select/move | Tab: text mode | H: hint | U: undo | Esc: exit';

    const structuredState = createChessState({
      fen: initialFen,
      turn: initialState.turn,
      moveNumber: initialState.moveNumber,
      isPlayerTurn,
      playerColor,
      legalMoves,
      isCheck: initialState.isCheck,
      isCheckmate: initialState.isCheckmate,
      isStalemate: initialState.isStalemate,
      isDraw: initialState.isDraw,
      drawReason: initialState.drawReason,
      lastMove: null,
      capturedPieces: initialState.capturedPieces,
      evaluation: currentEval,
      history: [],
      difficulty,
      opening: 'Starting position',
      inputMode: 'cursor', // Default on load
    });

    logGameState('Playing Chess', status, visualBoard, controls, structuredState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount

  // ==========================================================================
  // AI State Logging - Log game state for external AI agents (Gemini CLI etc.)
  // ==========================================================================
  useEffect(() => {
    try {
      // Get all legal moves with verbose info
      const moves = engine.getMoves({ verbose: true }) as Move[];
      const legalMoves = moves.map(m => ({
        from: m.from,
        to: m.to,
        san: m.san,
      }));

      // Determine if it's the player's turn
      const isPlayerTurn = engine.turn() === playerColor;

      // Build visual ASCII board for humans
      const fen = gameState.fen;
      if (!fen) throw new Error("FEN is missing from game state");

      const board = parseFen(fen);
      let visualBoard = '    a   b   c   d   e   f   g   h\n';
      visualBoard += '  +---+---+---+---+---+---+---+---+\n';
      for (let row = 0; row < 8; row++) {
        const rank = 8 - row;
        let rowStr = `${rank} |`;
        for (let col = 0; col < 8; col++) {
          const piece = board[row][col];
          rowStr += ` ${piece || '.'} |`;
        }
        visualBoard += rowStr + ` ${rank}\n`;
        visualBoard += '  +---+---+---+---+---+---+---+---+\n';
      }
      visualBoard += '    a   b   c   d   e   f   g   h\n';

      // Status line
      const turnStr = gameState.turn === 'w' ? 'White' : 'Black';
      let status = `${turnStr} to move (Move #${gameState.moveNumber})`;
      if (gameState.isCheckmate) status = `CHECKMATE! ${turnStr} loses.`;
      else if (gameState.isStalemate) status = 'STALEMATE - Draw';
      else if (gameState.isDraw) status = `DRAW: ${gameState.drawReason}`;
      else if (gameState.isCheck) status += ' - CHECK!';
      if (thinking) status += ' (AI thinking...)';

      // Controls info
      const controls = 'Arrow keys: move cursor | Enter: select/move | Tab: text mode | H: hint | U: undo | Esc: exit';

      // Create structured state for AI consumption
      const structuredState = createChessState({
        fen: gameState.fen,
        turn: gameState.turn,
        moveNumber: gameState.moveNumber,
        isPlayerTurn,
        playerColor,
        legalMoves,
        isCheck: gameState.isCheck,
        isCheckmate: gameState.isCheckmate,
        isStalemate: gameState.isStalemate,
        isDraw: gameState.isDraw,
        drawReason: gameState.drawReason,
        lastMove: gameState.lastMove ? {
          from: gameState.lastMove.from,
          to: gameState.lastMove.to,
          san: gameState.lastMove.san,
          piece: gameState.lastMove.piece,
          captured: gameState.lastMove.captured,
        } : null,
        capturedPieces: gameState.capturedPieces,
        evaluation,
        history: gameState.history,
        difficulty,
        opening: gameState.lastMove?.san ? undefined : 'Starting position',
      });

      // Log to file and broadcast via WebSocket
      logGameState('Playing Chess', status, visualBoard, controls, structuredState);
    } catch (err) {
      // Fallback logging if something goes wrong to aid debugging
      const errorMessage = err instanceof Error ? err.message : String(err);
      logGameState(
        'Playing Chess (Error)', 
        `Error updating state: ${errorMessage}`, 
        'Board unavailable due to error.\nCheck logs for details.', 
        'Esc: exit'
      );
      // Also log to console for developer visibility
      // console.error('Chess state logging error:', err);
    }
  }, [gameState, evaluation, thinking, engine, playerColor, difficulty]);
  // ==========================================================================

  // Cursor selection
  const handleCursorAction = useCallback(() => {
    const sq = coordsToSquare(cursorRow, cursorCol);
    const board = parseFen(engine.fen());
    const piece = board[cursorRow][cursorCol];

    if (cursorState === 'selecting') {
      if (!piece) { setError('Empty square'); return; }
      
      const isWhite = piece === piece.toUpperCase();
      const isMyTurn = engine.turn() === playerColor;
      const isMyPiece = (isWhite && playerColor === 'w') || (!isWhite && playerColor === 'b');

      if (mode === 'ai' && !isMyTurn) { setError("Wait for AI!"); return; }
      if (mode === 'ai' && !isMyPiece) { setError("Not your piece!"); return; }

      const targets = getLegalTargets(sq);
      if (targets.size === 0) { setError('No legal moves'); return; }

      setSelectedSquare(sq);
      setLegalTargets(targets);
      setCursorState('moving');
      setError(null);
    } else {
      if (!selectedSquare) return;

      if (!legalTargets.has(sq)) {
        // Maybe selecting different piece
        if (piece) {
          const isWhite = piece === piece.toUpperCase();
          const isMyPiece = (isWhite && playerColor === 'w') || (!isWhite && playerColor === 'b');
          if (isMyPiece) {
            const targets = getLegalTargets(sq);
            if (targets.size > 0) {
              setSelectedSquare(sq);
              setLegalTargets(targets);
              return;
            }
          }
        }
        setError('Illegal move');
        return;
      }

      // Make move
      const moveStr = `${selectedSquare}${sq}`;
      let result = engine.move(moveStr);
      if (!result) result = engine.move(`${moveStr}q`); // Promotion
      
      if (result) {
        setSelectedSquare(null);
        setLegalTargets(new Set());
        setCursorState('selecting');
        setSuccessMsg(`✓ Move: ${result.san}`);
        updateState();
        setHint(null);
        // Log state immediately after player move
        setTimeout(() => logChessState(`Player played ${result.san}`), 50);
      } else {
        setError('Move failed');
      }
    }
  }, [cursorRow, cursorCol, cursorState, selectedSquare, legalTargets, engine, playerColor, mode, getLegalTargets, updateState, logChessState]);

  // Text submission
  const handleTextSubmit = useCallback((input: string) => {
    const m = input.trim();
    if (!m) return;
    setError(null);
    setHint(null);
    setSuccessMsg(null);

    if (mode === 'ai' && engine.turn() !== playerColor) {
      setError("Not your turn!");
      setMoveInput('');
      return;
    }

    if (engine.move(m)) {
      setMoveInput('');
      setSuccessMsg(`✓ Move: ${m}`);
      updateState();
      // Log state immediately after player move
      setTimeout(() => logChessState(`Player played ${m}`), 50);
    } else {
      setError(`Invalid: ${m}`);
    }
  }, [engine, mode, playerColor, updateState, logChessState]);

  // Undo
  const handleUndo = useCallback(() => {
    if (mode === 'ai') { engine.undo(); engine.undo(); }
    else engine.undo();
    setSelectedSquare(null);
    setLegalTargets(new Set());
    setCursorState('selecting');
    setSuccessMsg('Undo');
    updateState();
    setHint(null);
    // Log state after undo
    setTimeout(() => logChessState('After undo'), 50);
  }, [engine, mode, updateState, logChessState]);

  // Hint
  const handleHint = useCallback(async () => {
    if (engine.isGameOver() || thinking) return;
    setThinking(true);
    try {
      const h = await ai.getHint(engine.fen());
      setHint(`${h.move} - ${h.explanation}`);
    } catch { setHint('No hint'); }
    finally { setThinking(false); }
  }, [engine, ai, thinking]);

  // New game
  const handleNew = useCallback(() => {
    engine.reset();
    setSelectedSquare(null);
    setLegalTargets(new Set());
    setCursorState('selecting');
    setCursorRow(6);
    setCursorCol(4);
    setSuccessMsg('New game started');
    updateState();
    setHint(null);
    setError(null);
    // Log state for new game
    setTimeout(() => logChessState('New game'), 50);
  }, [engine, updateState, logChessState]);

  // Input handler
  useInput((input, key) => {
    if (key.escape) {
      if (cursorState === 'moving') {
        setSelectedSquare(null);
        setLegalTargets(new Set());
        setCursorState('selecting');
        setError(null);
      } else {
        onExit();
      }
      return;
    }

    if (key.tab) {
      setInputMode(m => m === 'cursor' ? 'text' : 'cursor');
      return;
    }

    // Guard hotkeys when in text mode - don't intercept letters that could be SAN moves
    // (N for knight, H for files, etc.)
    if (inputMode === 'cursor') {
      const k = input.toLowerCase();
      if (k === 'h') { handleHint(); return; }
      if (k === 'u') { handleUndo(); return; }
      if (k === 'f') { setFlipped(f => !f); return; }
      if (k === 'r' && !engine.isGameOver()) { setError('You resigned!'); return; }
      if (k === 'n') { handleNew(); return; }
    }

    if (inputMode === 'cursor') {
      const dir = flipped ? -1 : 1;
      if (key.upArrow) setCursorRow(r => Math.max(0, Math.min(7, r - dir)));
      if (key.downArrow) setCursorRow(r => Math.max(0, Math.min(7, r + dir)));
      if (key.leftArrow) setCursorCol(c => Math.max(0, Math.min(7, c - dir)));
      if (key.rightArrow) setCursorCol(c => Math.max(0, Math.min(7, c + dir)));
      if (key.return) handleCursorAction();
    }
  });

  const isGameOver = engine.isGameOver();

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box justifyContent="center" marginBottom={1}>
        <Text bold color="cyan">♔ Liku Chess ♚</Text>
        <Text dimColor> • AI ({difficulty}) • </Text>
        <Text color={inputMode === 'cursor' ? 'green' : 'yellow'}>
          {inputMode === 'cursor' ? '🎮 Cursor' : '⌨️ Text'}
        </Text>
      </Box>

      {/* Main area */}
      <Box>
        <ChessBoard
          fen={gameState.fen}
          flipped={flipped}
          cursorRow={cursorRow}
          cursorCol={cursorCol}
          selectedSquare={selectedSquare}
          legalTargets={legalTargets}
          lastMove={gameState.lastMove}
          inputMode={inputMode}
        />
        <InfoPanel
          state={gameState}
          evaluation={evaluation}
          thinking={thinking}
          selectedSquare={selectedSquare}
          cursorState={cursorState}
          hint={hint}
          inputMode={inputMode}
        />
      </Box>

      {/* Feedback */}
      {successMsg && <Text color="green">{successMsg}</Text>}
      {error && <Text color="red">⚠ {error}</Text>}

      {/* Text input */}
      {inputMode === 'text' && !thinking && !isGameOver && (
        <Box marginTop={1}>
          <Text color="yellow">Move: </Text>
          <TextInput
            value={moveInput}
            onChange={setMoveInput}
            onSubmit={handleTextSubmit}
            placeholder="e4, Nf3, O-O..."
          />
        </Box>
      )}

      {/* Game over */}
      {isGameOver && (
        <Box marginTop={1} flexDirection="column">
          <Text bold color="yellow">Game Over: {gameState.result?.score || 'Draw'}</Text>
          <Text dimColor>[N] New Game  [ESC] Exit</Text>
        </Box>
      )}

      {/* Controls */}
      <Controls inputMode={inputMode} cursorState={cursorState} />
    </Box>
  );
};

export default Chess;
