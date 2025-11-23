import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { db } from '../../services/DatabaseService.js';

const GAME_WIDTH = 60;
const GAME_HEIGHT = 12;
const GROUND_Y = 0;
const DINO_X = GAME_WIDTH - 8; // Dino is on the right side now

type Obstacle = {
	x: number;
	type: 'CACTUS' | 'ROCK' | 'BUG' | 'BAT';
	char: string;
	y: number; // Some obstacles might fly
};

type Cloud = {
	x: number;
	y: number;
};

type Decoration = {
	x: number;
	y: number;
	char: string;
	color: string;
};

type GameState = 'START' | 'PLAYING' | 'GAME_OVER';

const OBSTACLE_TYPES = [
	{ type: 'CACTUS', char: '🌵', y: 0 },
	{ type: 'ROCK', char: '🪨', y: 0 },
	{ type: 'BUG', char: '🐛', y: 0 },
	{ type: 'BAT', char: '🦇', y: 3 }, // Flying obstacle
] as const;

const FUNNY_MESSAGES = [
	"Running back in time!",
	"Why is the world moving right?",
	"Moonwalking!",
	"Beep Boop!",
	"Gotta go fast!",
	"Calculating jump...",
	"Physics is fun!",
];

const DEATH_MESSAGES = [
	"Tripped on a syntax error!",
	"Segfaulted into a cactus!",
	"404: Jump not found.",
	"Buffer overflowed!",
	"Caught an unhandled exception!",
	"System crash!",
];

const DinoRun = ({ onExit, difficulty = 'medium' }: { onExit: () => void, difficulty?: 'easy' | 'medium' | 'hard' }) => {
	const [gameState, setGameState] = useState<GameState>('START');
	const [score, setScore] = useState(0);
	const [dinoY, setDinoY] = useState(0);
	const [velocity, setVelocity] = useState(0);
	const [obstacles, setObstacles] = useState<Obstacle[]>([]);
	const [clouds, setClouds] = useState<Cloud[]>([]);
	const [decorations, setDecorations] = useState<Decoration[]>([]);
	const [message, setMessage] = useState<string | null>(null);
	const [thought, setThought] = useState<string>("");
	
	// Refs for game loop state to avoid closure staleness
	const stateRef = useRef({
		dinoY: 0,
		velocity: 0,
		obstacles: [] as Obstacle[],
		clouds: [] as Cloud[],
		decorations: [] as Decoration[],
		score: 0,
		isPlaying: false,
		tickCount: 0
	});

	// Game Constants based on difficulty
	const SPEED_MS = difficulty === 'hard' ? 60 : difficulty === 'easy' ? 100 : 80;
	const GRAVITY = 0.6;
	const JUMP_STRENGTH = 2.5; // Adjusted for controlled jump height (approx 6 units)
	const SPAWN_RATE = difficulty === 'hard' ? 0.15 : difficulty === 'easy' ? 0.05 : 0.1;

	const startGame = () => {
		setGameState('PLAYING');
		setScore(0);
		setDinoY(0);
		setVelocity(0);
		setObstacles([]);
		setClouds([]);
		setDecorations([]);
		setMessage(null);
		setThought("Ready... GO!");
		
		stateRef.current = {
			dinoY: 0,
			velocity: 0,
			obstacles: [],
			clouds: [],
			decorations: [],
			score: 0,
			isPlaying: true,
			tickCount: 0
		};
	};

	const saveResult = async (finalScore: number) => {
		try {
			const stats = await db.getStats();
			const xpEarned = Math.floor(finalScore / 10);
			
			await db.updateStats({
				gamesPlayed: stats.gamesPlayed + 1,
				energy: Math.max(0, stats.energy - 10),
				xp: stats.xp + xpEarned,
				happiness: Math.min(100, stats.happiness + 10)
			});
		} catch (err) {
			console.error(err);
		}
	};

	const gameOver = () => {
		stateRef.current.isPlaying = false;
		setGameState('GAME_OVER');
		const deathMsg = DEATH_MESSAGES[Math.floor(Math.random() * DEATH_MESSAGES.length)];
		setMessage(deathMsg);
		saveResult(stateRef.current.score);
	};

	useInput((input, key) => {
		if (gameState === 'START' || gameState === 'GAME_OVER') {
			if (key.return) {
				startGame();
			} else if (key.escape || input === 'q') {
				onExit();
			}
			return;
		}

		if (gameState === 'PLAYING') {
			if ((input === ' ' || key.upArrow) && stateRef.current.dinoY === 0) {
				// Jump!
				stateRef.current.velocity = JUMP_STRENGTH;
			}
			if (key.escape || input === 'q') {
				onExit(); // Allow quit during game
			}
		}
	});

	useEffect(() => {
		if (gameState !== 'PLAYING') return;

		const timer = setInterval(() => {
			const state = stateRef.current;
			if (!state.isPlaying) return;

			state.tickCount++;

			// 1. Physics (Jump)
			// Apply velocity
			// Note: In our grid, Y=0 is bottom. Positive Y is up.
			// But we are rendering rows from top (0) to bottom (HEIGHT).
			// So visual Y = HEIGHT - 1 - logical Y.
			
			// We'll use logical Y for physics.
			if (state.dinoY > 0 || state.velocity > 0) {
				state.dinoY += state.velocity;
				state.velocity -= 0.5; // Gravity
				
				if (state.dinoY <= 0) {
					state.dinoY = 0;
					state.velocity = 0;
				}
			}

			// 2. Move Obstacles (Left to Right now: x + 1)
			state.obstacles = state.obstacles
				.map(obs => ({ ...obs, x: obs.x + 1 }))
				.filter(obs => obs.x < GAME_WIDTH);

			// Move Clouds (Slower, Left to Right)
			if (state.tickCount % 5 === 0) { // Slower clouds
				state.clouds = state.clouds
					.map(c => ({ ...c, x: c.x + 1 }))
					.filter(c => c.x < GAME_WIDTH);
			}

			// Move Decorations (Ground details, stars)
			if (state.tickCount % 2 === 0) {
				state.decorations = state.decorations
					.map(d => ({ ...d, x: d.x + 1 }))
					.filter(d => d.x < GAME_WIDTH);
			}

			// 3. Spawn Obstacles (At x=0)
			// Don't spawn if there's one right at the start
			const isClearStart = !state.obstacles.some(obs => obs.x < (difficulty === 'hard' ? 10 : 15));
			
			if (isClearStart) {
				if (Math.random() < SPAWN_RATE) {
					const type = OBSTACLE_TYPES[Math.floor(Math.random() * OBSTACLE_TYPES.length)];
					state.obstacles.push({
						x: 0,
						type: type.type as any,
						char: type.char,
						y: type.y
					});
				}
			}

			// Spawn Clouds (Reduced rate)
			if (Math.random() < 0.01) {
				state.clouds.push({
					x: 0,
					y: 6 + Math.floor(Math.random() * 4) // Sky area
				});
			}

			// Spawn Decorations (Stars, Ground details)
			if (Math.random() < 0.1) {
				// Ground detail
				state.decorations.push({
					x: 0,
					y: 0,
					char: '.',
					color: 'gray'
				});
			}
			if (Math.random() < 0.02) {
				// Star
				state.decorations.push({
					x: 0,
					y: 6 + Math.floor(Math.random() * 5),
					char: '✨',
					color: 'yellow'
				});
			}

			// 4. Collision Detection
			// Dino X is fixed at DINO_X
			const hit = state.obstacles.some(obs => {
				// Simple box collision
				// Obstacle is at obs.x
				// Dino is at DINO_X
				// If they overlap horizontally AND Dino is low enough (or high enough for bats)
				const xOverlap = Math.abs(obs.x - DINO_X) < 1;
				
				if (!xOverlap) return false;

				// Y Collision
				// Dino is at state.dinoY (bottom) to state.dinoY + 1 (top) roughly
				// Obstacle is at obs.y
				// If obs.y is 0 (ground), hit if dinoY < 1.5
				// If obs.y is 3 (bat), hit if dinoY > 1.5 && dinoY < 4.5?
				
				if (obs.y === 0) {
					return state.dinoY < 1.5;
				} else {
					// Flying obstacle (Bat at y=3)
					// Dino jumps up to ~4.
					// Hit if dino body overlaps y=3
					return state.dinoY > 1.5 && state.dinoY < 4.5;
				}
			});

			if (hit) {
				gameOver();
			} else {
				state.score += 1;
				
				// Random thoughts
				if (state.tickCount % 50 === 0 && Math.random() > 0.5) {
					setThought(FUNNY_MESSAGES[Math.floor(Math.random() * FUNNY_MESSAGES.length)]);
					setTimeout(() => setThought(""), 2000);
				}
			}

			// Sync refs to state for render
			setDinoY(state.dinoY);
			setObstacles([...state.obstacles]);
			setClouds([...state.clouds]);
			setDecorations([...state.decorations]);
			setScore(state.score);

		}, SPEED_MS);

		return () => clearInterval(timer);
	}, [gameState, difficulty]);

	// Rendering Logic
	const renderScene = () => {
		const rows = [];
		
		// Sky / Header
		rows.push(
			<Box key="header" width={GAME_WIDTH} justifyContent="space-between" paddingX={1}>
				<Text color="yellow">Score: {score}</Text>
				<Text color="cyan" italic>{thought}</Text>
				<Text color="green">High Score: {Math.max(score, 0)}</Text> 
			</Box>
		);

		// Game Grid
		// We render from Top (Height) down to Ground (0)
		
		for (let y = GAME_HEIGHT - 1; y >= 0; y--) {
			const rowChars = [];
			
			for (let x = 0; x < GAME_WIDTH; x++) {
				let char = ' ';
				let color = 'white';

				// Ground Line
				if (y === 0) {
					char = '_';
					color = 'gray';
				}

				// Dino
				// Dino X is DINO_X. Dino Y is state.dinoY.
				const visualDinoY = Math.round(dinoY);
				const isDinoHere = (x === DINO_X) && (y === visualDinoY);
				
				// Obstacles
				const obstacle = obstacles.find(obs => Math.round(obs.x) === x && obs.y === y);
				
				// Clouds
				const cloud = clouds.find(c => Math.round(c.x) === x && c.y === y);

				// Decorations
				const decoration = decorations.find(d => Math.round(d.x) === x && d.y === y);

				if (isDinoHere) {
					if (gameState === 'GAME_OVER') {
						char = '😵';
					} else {
						char = '🦖'; // T-Rex Runner (Faces Left, fits Right-to-Left movement)
					}
					color = 'green';
				} else if (obstacle) {
					char = obstacle.char;
					color = 'red';
				} else if (cloud) {
					char = '☁️';
					color = 'white';
				} else if (decoration) {
					char = decoration.char;
					color = decoration.color;
				} else if (y === 0) {
					// Ground
					char = '_';
					color = 'gray';
				}

				rowChars.push(<Text key={x} color={color}>{char}</Text>);
			}
			
			rows.push(
				<Box key={y} flexDirection="row">
					{rowChars}
				</Box>
			);
		}

		return rows;
	};

	return (
		<Box flexDirection="column" alignItems="center" borderStyle="round" borderColor="cyan" width={GAME_WIDTH + 4}>
			<Box marginBottom={1}>
				<Text bold color="yellow">🦖 Liku Run 🦖</Text>
			</Box>

			<Box flexDirection="column" borderStyle="single" borderColor="white" width={GAME_WIDTH + 2} height={GAME_HEIGHT + 2} paddingX={1}>
				{renderScene()}
			</Box>

			<Box marginTop={1}>
				{gameState === 'START' && (
					<Text color="green" bold>Press ENTER to Start! (Space/Up to Jump)</Text>
				)}
				{gameState === 'PLAYING' && (
					<Text color="gray">Space/Up to Jump • Q to Quit</Text>
				)}
				{gameState === 'GAME_OVER' && (
					<Box flexDirection="column" alignItems="center">
						<Text color="red" bold>GAME OVER</Text>
						<Text color="yellow">{message}</Text>
						<Text>Final Score: {score}</Text>
						<Text dimColor>Press ENTER to Try Again</Text>
					</Box>
				)}
			</Box>
		</Box>
	);
};

export default DinoRun;
