import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import fs from 'fs';
import path from 'path';
import { db } from '../../services/DatabaseService.js';

const FIELD_SIZE = 20;
const INITIAL_SNAKE = [
	{ x: 10, y: 10 },
	{ x: 10, y: 11 },
	{ x: 10, y: 12 }
];
const INITIAL_DIRECTION = { x: 0, y: -1 }; // Moving up
const BASE_SPEED = 150; // Slower base speed for easier gameplay

type Point = { x: number; y: number };
type FoodType = 'APPLE' | 'BANANA' | 'CHILI' | 'ICE';

interface Food extends Point {
	type: FoodType;
}

const FOOD_TYPES: { [key in FoodType]: { char: string; score: number; effect?: string } } = {
	APPLE: { char: '🍎', score: 10 },
	BANANA: { char: '🍌', score: 50, effect: 'xp' }, // Increased XP per banana
	CHILI: { char: '🌶️', score: 15, effect: 'speed_up' },
	ICE: { char: '🧊', score: 5, effect: 'slow_down' }
};

const Confetti = () => {
	const [particles, setParticles] = useState<{ x: number; y: number; color: string; char: string }[]>([]);

	useEffect(() => {
		const colors = ['red', 'green', 'blue', 'yellow', 'magenta', 'cyan'];
		const chars = ['*', '+', '.', 'o', 'x'];
		const newParticles = [];
		for (let i = 0; i < 50; i++) {
			newParticles.push({
				x: Math.random() * 40 - 20,
				y: Math.random() * 20 - 10,
				color: colors[Math.floor(Math.random() * colors.length)],
				char: chars[Math.floor(Math.random() * chars.length)]
			});
		}
		setParticles(newParticles);
	}, []);

	return (
		<Box position="absolute" marginTop={5} marginLeft={10}>
			{particles.map((p, i) => (
				<Box key={i} position="absolute" marginLeft={Math.floor(p.x)} marginTop={Math.floor(p.y)}>
					<Text color={p.color}>{p.char}</Text>
				</Box>
			))}
		</Box>
	);
};

const Snake = ({ onExit, difficulty = 'medium' }: { onExit: () => void, difficulty?: 'easy' | 'medium' | 'hard' }) => {
	const getBaseSpeed = (diff: string) => {
		switch(diff) {
			case 'easy': return 200;
			case 'medium': return 150;
			case 'hard': return 80;
			default: return 150;
		}
	};

	const [snake, setSnake] = useState<Point[]>(INITIAL_SNAKE);
	const [direction, setDirection] = useState<Point>(INITIAL_DIRECTION);
	const [food, setFood] = useState<Food>({ x: 5, y: 5, type: 'APPLE' });
	const [score, setScore] = useState(0);
	const [level, setLevel] = useState(1);
	const [xp, setXp] = useState(0);
	const [gameOver, setGameOver] = useState(false);
	const [speed, setSpeed] = useState(getBaseSpeed(difficulty));
	const [showConfetti, setShowConfetti] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const [highScore, setHighScore] = useState(0);

	// Load stats on mount
	useEffect(() => {
		db.getStats().then(stats => {
			setHighScore(stats.highScore);
			setLevel(stats.level);
			setXp(stats.xp);
		}).catch(console.error);
	}, []);

	// Reset speed when difficulty changes or restart
	useEffect(() => {
		if (!gameOver) {
			setSpeed(getBaseSpeed(difficulty));
		}
	}, [difficulty, gameOver]);

	const saveProgress = useCallback(async (currentScore: number, currentLevel: number, currentXp: number, isGameOver: boolean = false) => {
		try {
			const stats = await db.getStats();
			const updates: Partial<typeof stats> = {
				highScore: Math.max(stats.highScore, currentScore),
				level: currentLevel,
				xp: currentXp,
				gamesPlayed: stats.gamesPlayed + (isGameOver ? 1 : 0)
			};

			if (isGameOver) {
				updates.energy = Math.max(0, stats.energy - 10);
				updates.happiness = Math.min(100, stats.happiness + 10);
				updates.hunger = Math.min(100, stats.hunger + 5);
			}

			await db.updateStats(updates);
		} catch (err) {
			console.error('Failed to save progress:', err);
		}
	}, []);

	const generateNanobananaImage = useCallback((lvl: number) => {
		const art = `
   __
  /  \\
  |  |  Level ${lvl} Achieved!
  |  |
  |  |  Nanobanana says:
  |__|  "Great job, Snake Master!"
 (____)
		`;
		const filePath = path.join(process.cwd(), 'media', `level_${lvl}_reward.txt`);
		try {
			fs.writeFileSync(filePath, art);
			setMessage(`Reward saved to media/level_${lvl}_reward.txt!`);
			setTimeout(() => setMessage(null), 3000);
		} catch (err) {
			// Ignore write errors in TUI
		}
	}, []);

	const generateFood = useCallback((): Food => {
		let newFood: Point;
		while (true) {
			newFood = {
				x: Math.floor(Math.random() * FIELD_SIZE),
				y: Math.floor(Math.random() * FIELD_SIZE)
			};
			// Check if food is on snake
			// eslint-disable-next-line no-loop-func
			const isOnSnake = snake.some(segment => segment.x === newFood.x && segment.y === newFood.y);
			if (!isOnSnake) break;
		}

		// Randomize food type - Increased Banana chance
		const rand = Math.random();
		let type: FoodType = 'APPLE';
		if (rand > 0.75) type = 'BANANA'; // 25% chance
		else if (rand > 0.65) type = 'CHILI';
		else if (rand > 0.55) type = 'ICE';

		return { ...newFood, type };
	}, [snake]);

	useInput((input, key) => {
		if (gameOver) {
			if (key.return) {
				// Restart
				setSnake(INITIAL_SNAKE);
				setDirection(INITIAL_DIRECTION);
				setScore(0);
				// Keep level and XP on restart? Or reset?
				// User wants "leveling up achievements", usually implies persistence.
				// But if you die, do you lose progress?
				// Let's keep Level/XP persistent for this "RPG" feel.
				setSpeed(getBaseSpeed(difficulty));
				setGameOver(false);
				setFood(generateFood());
				setShowConfetti(false);
			} else if (key.escape || input === 'q') {
				onExit();
			}
			return;
		}

		if (key.upArrow && direction.y !== 1) setDirection({ x: 0, y: -1 });
		if (key.downArrow && direction.y !== -1) setDirection({ x: 0, y: 1 });
		if (key.leftArrow && direction.x !== 1) setDirection({ x: -1, y: 0 });
		if (key.rightArrow && direction.x !== -1) setDirection({ x: 1, y: 0 });
		if (key.escape || input === 'q') onExit();
	});

	useEffect(() => {
		if (gameOver) return;

		const moveSnake = () => {
			setSnake(prevSnake => {
				const newHead = {
					x: prevSnake[0].x + direction.x,
					y: prevSnake[0].y + direction.y
				};

				// Check collisions
				if (
					newHead.x < 0 ||
					newHead.x >= FIELD_SIZE ||
					newHead.y < 0 ||
					newHead.y >= FIELD_SIZE ||
					prevSnake.some(segment => segment.x === newHead.x && segment.y === newHead.y)
				) {
					setGameOver(true);
					saveProgress(score, level, xp, true);
					return prevSnake;
				}

				const newSnake = [newHead, ...prevSnake];

				// Check food
				if (newHead.x === food.x && newHead.y === food.y) {
					const foodInfo = FOOD_TYPES[food.type];
					setScore(s => s + foodInfo.score);
					
					// Effects
					if (food.type === 'CHILI') setSpeed(s => Math.max(50, s - 20));
					if (food.type === 'ICE') setSpeed(s => Math.min(200, s + 20));
					if (food.type === 'BANANA') {
						setXp(x => {
							const newXp = x + 50;
							if (newXp >= 100) {
								setLevel(l => {
									const newLevel = l + 1;
									setShowConfetti(true);
									setTimeout(() => setShowConfetti(false), 3000);
									generateNanobananaImage(newLevel);
									// Save progress on level up
									saveProgress(score, newLevel, 0);
									return newLevel;
								});
								return 0;
							}
							return newXp;
						});
					}

					setFood(generateFood());
				} else {
					newSnake.pop();
				}

				return newSnake;
			});
		};

		const gameLoop = setInterval(moveSnake, speed);
		return () => clearInterval(gameLoop);
	}, [direction, food, gameOver, generateFood, speed, generateNanobananaImage, saveProgress, score, level, xp]);

	// Render the grid
	const renderGrid = () => {
		const grid = [];
		for (let y = 0; y < FIELD_SIZE; y++) {
			const row = [];
			for (let x = 0; x < FIELD_SIZE; x++) {
				let char = '  '; // Empty space (2 chars for square-ish look)
				
				// Check snake
				const snakeIndex = snake.findIndex(s => s.x === x && s.y === y);
				if (snakeIndex === 0) {
					char = '🟢'; // Head
				} else if (snakeIndex > 0) {
					char = '🟩'; // Body
				} else if (food.x === x && food.y === y) {
					char = FOOD_TYPES[food.type].char; // Food
				}

				row.push(<Text key={`${x}-${y}`}>{char}</Text>);
			}
			grid.push(<Box key={y}>{row}</Box>);
		}
		return grid;
	};

	return (
		<Box flexDirection="column" alignItems="center">
			{showConfetti && <Confetti />}
			<Box borderStyle="round" borderColor={gameOver ? 'red' : 'green'} padding={0} flexDirection="column">
				{renderGrid()}
			</Box>
			<Box marginTop={1} flexDirection="row" gap={2}>
				<Text color="cyan" bold>Score: {score}</Text>
				<Text color="yellow" bold>Level: {level}</Text>
				<Text color="magenta">XP: {xp}/100</Text>
				<Text color="green">High Score: {Math.max(score, highScore)}</Text>
			</Box>
			{message && (
				<Box marginTop={1}>
					<Text color="green" bold>{message}</Text>
				</Box>
			)}
			{gameOver && (
				<Box flexDirection="column" alignItems="center" marginTop={1}>
					<Text color="red" bold>GAME OVER</Text>
					<Text>Press Enter to Restart, Q to Quit</Text>
				</Box>
			)}
			{!gameOver && (
				<Box flexDirection="column" alignItems="center">
					<Text dimColor>Use Arrow Keys to Move • Q to Quit</Text>
					<Text dimColor>🍎(10) 🍌(XP) 🌶️(Fast) 🧊(Slow)</Text>
				</Box>
			)}
		</Box>
	);
};

export default Snake;
