import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { db } from '../../services/DatabaseService.js';

type Player = 'X' | 'O' | null;
type BoardState = Player[];

const WINNING_COMBINATIONS = [
	[0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
	[0, 3, 6], [1, 4, 7], [2, 5, 8], // Cols
	[0, 4, 8], [2, 4, 6]             // Diagonals
];

const TicTacToe = ({ onExit, difficulty = 'medium' }: { onExit: () => void, difficulty?: 'easy' | 'medium' | 'hard' }) => {
	const [board, setBoard] = useState<BoardState>(Array(9).fill(null));
	const [isPlayerTurn, setIsPlayerTurn] = useState(true); // Player is always X and goes first
	const [cursor, setCursor] = useState(4); // Start in center
	const [winner, setWinner] = useState<Player | 'DRAW' | null>(null);
	const [message, setMessage] = useState<string | null>(null);

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

	useInput((input, key) => {
		if (winner) {
			if (key.return) {
				// Restart
				setBoard(Array(9).fill(null));
				setWinner(null);
				setIsPlayerTurn(true);
				setMessage(null);
			} else if (key.escape || input === 'q') {
				onExit();
			}
			return;
		}

		if (!isPlayerTurn) return; // Wait for Liku

		if (key.upArrow && cursor >= 3) setCursor(c => c - 3);
		if (key.downArrow && cursor <= 5) setCursor(c => c + 3);
		if (key.leftArrow && cursor % 3 !== 0) setCursor(c => c - 1);
		if (key.rightArrow && cursor % 3 !== 2) setCursor(c => c + 1);

		if (key.return || input === ' ') {
			if (board[cursor] === null) {
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

		if (key.escape || input === 'q') {
			onExit();
		}
	});

	const renderCell = (i: number) => {
		const val = board[i];
		const isSelected = cursor === i;
		
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

	return (
		<Box flexDirection="column" alignItems="center">
			<Box marginBottom={1}>
				<Text bold color="yellow">❌ Tic-Tac-Toe vs Liku ⭕</Text>
			</Box>

			<Box flexDirection="column">
				{[0, 1, 2].map(row => (
					<Box key={row} flexDirection="row">
						{[0, 1, 2].map(col => renderCell(row * 3 + col))}
					</Box>
				))}
			</Box>

			<Box marginTop={1}>
				{winner ? (
					<Box flexDirection="column" alignItems="center">
						{winner === 'DRAW' && renderDrawArt()}
						<Text bold color={winner === 'X' ? 'green' : winner === 'O' ? 'red' : 'yellow'}>
							{message || (winner === 'DRAW' ? "It's a Draw!" : `${winner === 'X' ? 'You' : 'Liku'} Won!`)}
						</Text>
						<Text dimColor>Press Enter to Play Again, Q to Quit</Text>
					</Box>
				) : (
					<Box flexDirection="column" alignItems="center">
						<Text color={isPlayerTurn ? 'cyan' : 'magenta'}>
							{isPlayerTurn ? "Your Turn (X)" : "Liku is thinking... (O)"}
						</Text>
						<Text dimColor>Arrows to move • Enter to place</Text>
					</Box>
				)}
			</Box>
		</Box>
	);
};

export default TicTacToe;
