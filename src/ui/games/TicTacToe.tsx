import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { db } from '../../services/DatabaseService.js';
import { logGameState } from '../../core/GameStateLogger.js';
import { createTicTacToeState } from '../../websocket/state.js';
import { 
	GameSessionManager, 
	gameSessionManager, 
	TicTacToeSessionState,
	TicTacToeSlot,
	PlayerSlot,
} from '../../websocket/sessions.js';

type Player = 'X' | 'O' | null;
type BoardState = Player[];

/**
 * Game mode types:
 * - 'local': Traditional local gameplay with built-in AI
 * - 'websocket': AI-vs-AI mode using WebSocket sessions
 * - 'spectate': Watch an ongoing AI-vs-AI game
 */
export type TicTacToeMode = 'local' | 'websocket' | 'spectate';

/**
 * Props for TicTacToe component
 */
export interface TicTacToeProps {
	onExit: () => void;
	difficulty?: 'easy' | 'medium' | 'hard' | 'ai';
	mode?: TicTacToeMode;
	sessionId?: string; // For joining existing session
	sessionManager?: GameSessionManager; // Allow DI for testing
	agentId?: string; // Agent ID for WebSocket mode
	onSessionCreated?: (sessionId: string) => void; // Callback when session is created
}

const WINNING_COMBINATIONS = [
	[0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
	[0, 3, 6], [1, 4, 7], [2, 5, 8], // Cols
	[0, 4, 8], [2, 4, 6]             // Diagonals
];

/**
 * TicTacToe Game Component
 * 
 * Supports three modes:
 * - 'local': Play against built-in AI (Liku)
 * - 'websocket': AI-vs-AI mode with WebSocket session management
 * - 'spectate': Watch an ongoing game
 */
const TicTacToe = ({ 
	onExit, 
	difficulty = 'medium',
	mode = 'local',
	sessionId: initialSessionId,
	sessionManager = gameSessionManager,
	agentId = 'local-player',
	onSessionCreated,
}: TicTacToeProps) => {
	const [board, setBoard] = useState<BoardState>(Array(9).fill(null));
	const [isPlayerTurn, setIsPlayerTurn] = useState(true); // Player is always X and goes first
	const [cursor, setCursor] = useState(4); // Start in center
	const [winner, setWinner] = useState<Player | 'DRAW' | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	
	// WebSocket mode state
	const [sessionId, setSessionId] = useState<string | null>(initialSessionId || null);
	const [playerSlot, setPlayerSlot] = useState<TicTacToeSlot | null>(null);
	const [sessionState, setSessionState] = useState<TicTacToeSessionState | null>(null);
	const [waitingForPlayer, setWaitingForPlayer] = useState(false);

	// Convert session state to flat board array for compatibility
	const boardFromSession = useMemo(() => {
		if (!sessionState) return null;
		const flat: BoardState = [];
		for (let row = 0; row < 3; row++) {
			for (let col = 0; col < 3; col++) {
				flat.push(sessionState.board[row][col]);
			}
		}
		return flat;
	}, [sessionState]);

	// Use session board in websocket mode, local board otherwise
	const activeBoard = mode === 'local' ? board : (boardFromSession || board);
	const activeIsPlayerTurn = mode === 'local' 
		? isPlayerTurn 
		: (sessionState?.currentPlayer === playerSlot);
	const activeWinner = mode === 'local' 
		? winner 
		: sessionState?.winner;

	// Setup WebSocket session on mount (websocket mode only)
	useEffect(() => {
		if (mode !== 'websocket' && mode !== 'spectate') return;

		const handleGameStarted = (sId: string, state: TicTacToeSessionState) => {
			if (sId === sessionId) {
				setSessionState(state);
				setWaitingForPlayer(false);
			}
		};

		const handleTurnChanged = (sId: string, slot: PlayerSlot, _agentId: string) => {
			if (sId === sessionId) {
				setSessionState(prev => prev ? { ...prev, currentPlayer: slot as TicTacToeSlot } : prev);
			}
		};

		const handleMoveMade = (sId: string, data: { player: PlayerSlot; move: { row: number; col: number }; state: TicTacToeSessionState }) => {
			if (sId === sessionId) {
				setSessionState(data.state);
			}
		};

		const handleGameEnded = (sId: string, data: { winner: TicTacToeSlot | 'draw'; state: TicTacToeSessionState }) => {
			if (sId === sessionId) {
				setSessionState(data.state);
				// Map winner for display
				if (data.winner === 'draw') {
					setWinner('DRAW');
				} else {
					setWinner(data.winner);
				}
			}
		};

		sessionManager.on('gameStarted', handleGameStarted);
		sessionManager.on('turnChanged', handleTurnChanged);
		sessionManager.on('moveMade', handleMoveMade);
		sessionManager.on('gameEnded', handleGameEnded);

		// Create or join session
		if (!sessionId) {
			// Create new session
			const session = sessionManager.createSession({
				gameType: 'tictactoe',
				mode: 'ai_vs_ai',
				turnTimeMs: 30000,
				allowSpectators: true,
			});
			setSessionId(session.id);
			setWaitingForPlayer(true);
			onSessionCreated?.(session.id);

			// Join as first player
			const result = sessionManager.joinSession(
				session.id,
				agentId,
				`Agent_${agentId.slice(0, 8)}`,
				mode === 'spectate' ? 'spectator' : 'ai',
				'X'
			);
			if (result.success && result.slot) {
				setPlayerSlot(result.slot as TicTacToeSlot);
			}
		} else {
			// Join existing session
			const result = sessionManager.joinSession(
				sessionId,
				agentId,
				`Agent_${agentId.slice(0, 8)}`,
				mode === 'spectate' ? 'spectator' : 'ai'
			);
			if (result.success && result.slot) {
				setPlayerSlot(result.slot as TicTacToeSlot);
			}
			
			// Get current state
			const session = sessionManager.getSession(sessionId);
			if (session) {
				setSessionState(session.state as TicTacToeSessionState);
				setWaitingForPlayer(session.status === 'waiting');
			}
		}

		return () => {
			sessionManager.off('gameStarted', handleGameStarted);
			sessionManager.off('turnChanged', handleTurnChanged);
			sessionManager.off('moveMade', handleMoveMade);
			sessionManager.off('gameEnded', handleGameEnded);
			
			// Leave session on unmount
			if (sessionId) {
				sessionManager.leaveSession(sessionId, agentId);
			}
		};
	}, [mode, sessionId, agentId, sessionManager, onSessionCreated]);

	const checkWinner = (currentBoard: BoardState): Player | 'DRAW' | null => {
		for (const combo of WINNING_COMBINATIONS) {
			const [a, b, c] = combo;
			if (currentBoard[a] && currentBoard[a] === currentBoard[b] && currentBoard[a] === currentBoard[c]) {
				return currentBoard[a];
			}
		}
		if (!currentBoard.includes(null)) return 'DRAW';
		return null;
	};

	const saveResult = useCallback(async (result: Player | 'DRAW') => {
		try {
			const stats = await db.getStats();
			const updates: Partial<typeof stats> = {
				gamesPlayed: stats.gamesPlayed + 1,
				energy: Math.max(0, stats.energy - 5) // Cost 5 energy
			};

			if (result === 'X') {
				// Player Won
				updates.xp = stats.xp + 20;
				updates.happiness = Math.min(100, stats.happiness + 10);
				setMessage("You Won! (+20 XP, +10 Happiness)");
			} else if (result === 'O') {
				// Liku Won
				updates.xp = stats.xp + 5;
				updates.happiness = Math.max(0, stats.happiness - 5); // Liku is happy he won, but maybe you aren't? Let's say Liku is a good sport.
				// Actually, if Liku wins, maybe he gets happy? But stats track *Player's* relationship/status.
				// Let's say Player loses happiness if they lose.
				setMessage("Liku Won! (+5 XP)");
			} else {
				// Draw
				updates.xp = stats.xp + 10;
				setMessage("It's a Draw! (+10 XP)");
			}

			await db.updateStats(updates);
		} catch (err) {
			console.error(err);
		}
	}, []);

	const renderDrawArt = () => (
		<Box flexDirection="column" alignItems="center" marginY={1}>
			<Text color="yellow">      /\_/\</Text>
			<Text color="yellow">     ( o.o )</Text>
			<Text color="yellow">      &gt; ^ &lt;</Text>
			<Text color="yellow" bold>   Cat's Game!</Text>
		</Box>
	);

	const likuMove = useCallback(() => {
		if (winner) return;

		// Simple AI based on difficulty
		// Easy: Random
		// Medium: Block/Win sometimes
		// Hard: Minimax (or just perfect block/win)

		const availableMoves = board.map((val, idx) => val === null ? idx : null).filter(val => val !== null) as number[];
		if (availableMoves.length === 0) return;

		let move = -1;

		// Helper to check if a move leads to a win for a specific player
		const findWinningMove = (player: Player): number => {
			for (const m of availableMoves) {
				const tempBoard = [...board];
				tempBoard[m] = player;
				if (checkWinner(tempBoard) === player) return m;
			}
			return -1;
		};

		if (difficulty === 'hard' || difficulty === 'medium') {
			// 1. Try to win
			move = findWinningMove('O');
			
			// 2. Block player
			if (move === -1) {
				move = findWinningMove('X');
			}
		}

		// 3. Pick center if available (good strategy)
		if (move === -1 && difficulty === 'hard' && board[4] === null) {
			move = 4;
		}

		// 4. Random move
		if (move === -1) {
			move = availableMoves[Math.floor(Math.random() * availableMoves.length)];
		}

		const newBoard = [...board];
		newBoard[move] = 'O';
		setBoard(newBoard);
		
		const result = checkWinner(newBoard);
		if (result) {
			setWinner(result);
			saveResult(result);
		} else {
			setIsPlayerTurn(true);
		}
	}, [board, difficulty, winner, saveResult]);

	useEffect(() => {
		if (!isPlayerTurn && !winner) {
			const timer = setTimeout(likuMove, 1000); // Delay for "thinking"
			return () => clearTimeout(timer);
		}
	}, [isPlayerTurn, winner, likuMove]);

	// --- AI State Logging ---
	// Force immediate log on mount
	useEffect(() => {
		logGameState("Playing Tic-Tac-Toe", "Initializing...", "Loading game board...", "Please wait...");
	}, []);

	useEffect(() => {
		const status = winner 
			? (winner === 'DRAW' ? 'Game Over - Draw' : `Game Over - ${winner === 'X' ? 'You' : 'Liku'} Won`)
			: (isPlayerTurn ? 'Your Turn (X)' : 'Liku is thinking... (O)');
		
		// Render board as a grid for the AI to "see"
		let visualState = "";
		for (let i = 0; i < 3; i++) {
			const row = board.slice(i * 3, i * 3 + 3).map((cell, idx) => {
				const cellIndex = i * 3 + idx;
				const cellChar = cell || '.';
				// Mark cursor position with brackets
				return cursor === cellIndex ? `[${cellChar}]` : ` ${cellChar} `;
			}).join('|');
			visualState += ` ${row} \n`;
			if (i < 2) visualState += ` ---+---+--- \n`;
		}
		
		// Add cell index reference for AI navigation
		visualState += `\nCursor Position: ${cursor} (Row ${Math.floor(cursor/3)}, Col ${cursor%3})`;
		visualState += `\nBoard Indices:\n 0 | 1 | 2 \n 3 | 4 | 5 \n 6 | 7 | 8`;

		const controls = winner 
			? "Enter to Play Again, Q to Quit."
			: "Arrows to move cursor, Enter to place X. Q to Quit.";

		// Create structured state for AI with minimax recommendations
		const boardGrid: Array<Array<'X' | 'O' | null>> = [
			[board[0], board[1], board[2]],
			[board[3], board[4], board[5]],
			[board[6], board[7], board[8]],
		];
		
		const structuredState = createTicTacToeState({
			board: boardGrid,
			currentPlayer: isPlayerTurn ? 'X' : 'O',
			isPlayerTurn,
			isPlaying: !winner,
			isGameOver: !!winner,
			winner: winner === 'DRAW' ? 'draw' : winner,
		});

		// Log with structured data for AI agents
		logGameState("Playing Tic-Tac-Toe", status, visualState, controls, structuredState);
	}, [board, cursor, isPlayerTurn, winner]);
	// ------------------------

	useInput((input, key) => {
		// Use active winner for game over state
		const currentWinner = mode === 'local' ? winner : activeWinner;
		const currentBoard = activeBoard;
		const currentIsPlayerTurn = activeIsPlayerTurn;

		if (currentWinner) {
			if (key.return && mode === 'local') {
				// Restart (local mode only)
				setBoard(Array(9).fill(null));
				setWinner(null);
				setIsPlayerTurn(true);
				setMessage(null);
			} else if (key.escape || input === 'q') {
				onExit();
			}
			return;
		}

		// In spectate mode, only allow exit
		if (mode === 'spectate') {
			if (key.escape || input === 'q') {
				onExit();
			}
			return;
		}

		// Wait for turn (applies to both local and websocket mode)
		if (!currentIsPlayerTurn) return;

		if (key.upArrow && cursor >= 3) setCursor(c => c - 3);
		if (key.downArrow && cursor <= 5) setCursor(c => c + 3);
		if (key.leftArrow && cursor % 3 !== 0) setCursor(c => c - 1);
		if (key.rightArrow && cursor % 3 !== 2) setCursor(c => c + 1);

		if (key.return || input === ' ') {
			if (currentBoard[cursor] === null) {
				if (mode === 'websocket' && sessionId) {
					// Submit move via session manager
					const row = Math.floor(cursor / 3);
					const col = cursor % 3;
					const result = sessionManager.submitMove(sessionId, agentId, { row, col });
					
					if (!result.success) {
						setMessage(result.error || 'Invalid move');
					}
				} else {
					// Local mode
					const newBoard = [...board];
					newBoard[cursor] = 'X';
					setBoard(newBoard);
					
					const result = checkWinner(newBoard);
					if (result) {
						setWinner(result);
						saveResult(result);
					} else {
						setIsPlayerTurn(false);
					}
				}
			}
		}

		if (key.escape || input === 'q') {
			onExit();
		}
	});

	const renderCell = (i: number) => {
		const val = activeBoard[i];
		const isSelected = cursor === i && mode !== 'spectate';
		
		// Use ASCII/Text instead of emojis to prevent rendering artifacts on Windows
		let char = '   ';
		if (val === 'X') char = ' X ';
		if (val === 'O') char = ' O ';

		let color = 'white';
		if (val === 'X') color = 'cyan';
		if (val === 'O') color = 'magenta';
		if (isSelected) color = 'green'; // Highlight cursor

		return (
			<Box key={i} borderStyle={isSelected ? 'double' : 'single'} borderColor={color} width={7} height={3} alignItems="center" justifyContent="center">
				<Text color={color} bold>{char}</Text>
			</Box>
		);
	};

	// Determine title based on mode
	const titleText = mode === 'websocket' 
		? `🤖 AI vs AI TicTacToe (${playerSlot || '?'}) 🤖`
		: mode === 'spectate'
			? '👁️ Spectating TicTacToe 👁️'
			: '❌ Tic-Tac-Toe vs Liku ⭕';

	// Determine current winner for display
	const displayWinner = mode === 'local' ? winner : activeWinner;

	return (
		<Box flexDirection="column" alignItems="center">
			<Box marginBottom={1}>
				<Text bold color="yellow">{titleText}</Text>
			</Box>

			{/* Session info for websocket mode */}
			{mode !== 'local' && sessionId && (
				<Box marginBottom={1}>
					<Text dimColor>Session: {sessionId.slice(0, 16)}...</Text>
				</Box>
			)}

			{/* Waiting for player message */}
			{waitingForPlayer && (
				<Box marginBottom={1}>
					<Text color="yellow">⏳ Waiting for opponent to join...</Text>
				</Box>
			)}

			<Box flexDirection="column">
				{[0, 1, 2].map(row => (
					<Box key={row} flexDirection="row">
						{[0, 1, 2].map(col => renderCell(row * 3 + col))}
					</Box>
				))}
			</Box>

			<Box marginTop={1}>
				{displayWinner ? (
					<Box flexDirection="column" alignItems="center">
						{displayWinner === 'DRAW' || displayWinner === 'draw' ? renderDrawArt() : null}
						<Text bold color={displayWinner === 'X' ? 'green' : displayWinner === 'O' ? 'red' : 'yellow'}>
							{message || (displayWinner === 'DRAW' || displayWinner === 'draw' 
								? "It's a Draw!" 
								: mode === 'local'
									? `${displayWinner === 'X' ? 'You' : 'Liku'} Won!`
									: `${displayWinner} Won!`)}
						</Text>
						<Text dimColor>
							{mode === 'local' ? 'Press Enter to Play Again, Q to Quit' : 'Press Q to Exit'}
						</Text>
					</Box>
				) : (
					<Box flexDirection="column" alignItems="center">
						{mode === 'spectate' ? (
							<Text color="gray">
								{sessionState ? `${sessionState.currentPlayer}'s Turn` : 'Watching...'}
							</Text>
						) : (
							<Text color={activeIsPlayerTurn ? 'cyan' : 'magenta'}>
								{mode === 'websocket'
									? (activeIsPlayerTurn ? `Your Turn (${playerSlot})` : `Opponent's Turn`)
									: (isPlayerTurn ? "Your Turn (X)" : "Liku is thinking... (O)")}
							</Text>
						)}
						<Text dimColor>
							{mode === 'spectate' ? 'Q to Exit' : 'Arrows to move • Enter to place'}
						</Text>
					</Box>
				)}
			</Box>
		</Box>
	);
};

export default TicTacToe;
