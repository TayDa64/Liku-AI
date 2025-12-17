import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Box, Text, useInput, useApp, useStdout } from 'ink';
import fs from 'node:fs';
import path from 'node:path';
import Snake from './games/Snake.js';
import TicTacToe from './games/TicTacToe.js';
import DinoRun from './games/DinoRun.js';
import Hangman from './games/Hangman.js';
import Sudoku from './games/Sudoku.js';
import Chess from './games/Chess.js';
import SettingsMenu from './SettingsMenu.js';
import BuilderUI from './BuilderUI.js';
import CommunityGamesMenu from './CommunityGamesMenu.js';
import LikuOS from './LikuOS.js';
import LikuLearnScreen from './LikuLearnScreen.js';
import { db, PlayerStats, UserSettings, ProTokens } from '../services/DatabaseService.js';
import { logGameState } from '../core/GameStateLogger.js';
import type { LoadedGame } from '../core/GameLoader.js';

interface GameHubProps {
	ai?: boolean;
	actionQueue: string[];
	setActionQueue: React.Dispatch<React.SetStateAction<string[]>>;
}

const GameHub: React.FC<GameHubProps> = ({ ai = false, actionQueue, setActionQueue }) => {
	const { exit } = useApp();
	const { stdout } = useStdout();

	// Get terminal dimensions for responsive layout (must be before any early returns)
	// Use 90% of terminal width to prevent edge artifacts (Gemini CLI pattern)
	const terminalWidth = useMemo(() => {
		const cols = stdout?.columns || 120;
		// Use 90% of width with min/max constraints to prevent border issues
		return Math.max(60, Math.min(Math.floor(cols * 0.95), 140));
	}, [stdout?.columns]);

	// Helper to clear screen between major transitions (prevents artifacts)
	const clearScreen = () => {
		if (stdout) {
			stdout.write('\x1b[2J\x1b[H');
		}
	};

	const [selectedGame, setSelectedGame] = useState<number>(0);
	const [selectedGameMenuIndex, setSelectedGameMenuIndex] = useState<number>(0);
	
	// Refs for immediate selection tracking (prevents rapid key presses from being batched)
	// When multiple arrow keys arrive quickly (e.g., {DOWN}{DOWN}{DOWN}), React batches
	// state updates. Using refs ensures each key press reads the latest position.
	const selectedGameRef = useRef(selectedGame);
	const selectedGameMenuRef = useRef(selectedGameMenuIndex);
	
	// Keep refs in sync with state
	useEffect(() => { selectedGameRef.current = selectedGame; }, [selectedGame]);
	useEffect(() => { selectedGameMenuRef.current = selectedGameMenuIndex; }, [selectedGameMenuIndex]);
	
	const [activeGame, setActiveGame] = useState<string | null>(null);
	const [stats, setStats] = useState<PlayerStats | null>(null);
	const [settings, setSettings] = useState<UserSettings | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const [proTokens, setProTokens] = useState<ProTokens | null>(null);
	const [loadedCommunityGame, setLoadedCommunityGame] = useState<LoadedGame | null>(null);
	const [showLikuOS, setShowLikuOS] = useState(false);
	const [miniDashboardMode, setMiniDashboardMode] = useState(false);

	const refreshData = () => {
		db.getStats().then(setStats).catch(console.error);
		db.getSettings().then(setSettings).catch(console.error);
		db.getProTokens('me').then(setProTokens).catch(console.error);
	};

	// --- AI State Logging ---
	useEffect(() => {
		// Don't log from LikuTUI when an actual game is active - the game component handles its own logging
		const gameComponents = ['snake', 'tictactoe', 'dinorun', 'chess', 'hangman', 'sudoku'];
		if (activeGame && gameComponents.includes(activeGame)) {
			return; // Let the game component handle logging
		}

		let screenName = 'Main Menu';
		if (activeGame === 'games_menu') screenName = 'Games Menu';
		else if (activeGame === 'settings') screenName = 'Settings';
		else if (activeGame === 'builder') screenName = 'Game Builder';
		else if (activeGame === 'community') screenName = 'Community Games';
		else if (activeGame === 'liku_os') screenName = 'LikuOS Stats';
		else if (activeGame) screenName = `Playing: ${activeGame}`;

		const isMenu = !activeGame || activeGame === 'games_menu';
		const currentItems = activeGame === 'games_menu' ? gameMenuItems : mainMenuItems;
		const currentIdx = activeGame === 'games_menu' ? selectedGameMenuIndex : selectedGame;

		let status = "";
		if (stats) {
			status = `Level: ${stats.level}, XP: ${stats.xp}, Hunger: ${stats.hunger}%, Energy: ${stats.energy}%, Happiness: ${stats.happiness}%`;
		}
		if (message) {
			status += ` | MESSAGE: ${message}`;
		}

		let visualState = "";
		if (isMenu) {
			visualState += `MENU ITEMS:\n`;
			currentItems.forEach((item, idx) => {
				const selected = idx === currentIdx ? '[x]' : '[ ]';
				visualState += `  ${selected} ${item.name}\n`;
			});
		} else {
			visualState += `(Game or Sub-screen Active - Use specific game controls)\n`;
		}

		logGameState(screenName, status, visualState);

	}, [activeGame, selectedGame, selectedGameMenuIndex, stats, message]);
	// ------------------------

	useEffect(() => {
		refreshData();
	}, [activeGame]);

	const mainMenuItems = [
		{ id: 'games_menu', name: '🎮 Let\'s Play' },
		{ id: 'builder', name: '🔨 Let\'s Build a Game! (Open Source SDK)' },
		{ id: 'community', name: '🌟 Community Games' },
		{ id: 'liku_learn', name: '🎓 Liku Learn (Wisdom Center)' },
		{ id: 'liku_os', name: '💻 LikuOS Stats' },
		{ id: 'feed', name: '🍖 Feed Liku (XP -10, Hunger -20)' },
		{ id: 'rest', name: '💤 Rest (Energy +30, Hunger +10)' },
		{ id: 'settings', name: '⚙️ Settings' },
		{ id: 'exit', name: '🚪 Exit' }
	];

	const gameMenuItems = [
		{ id: 'snake', name: '🐍 Play Snake (Energy -10, Happiness +10)' },
		{ id: 'tictactoe', name: '❌⭕ Tic-Tac-Toe (Energy -5, XP/Happy Rewards)' },
		{ id: 'dinorun', name: '🦖 Dino Run (Energy -10, XP Rewards)' },
		{ id: 'hangman', name: '📝 Hangman (Energy -5, XP Rewards)' },
		{ id: 'sudoku', name: '🧩 Sudoku (Energy -5, XP Rewards)' },
		{ id: 'chess', name: '♟️ Chess vs AI (Energy -5, XP Rewards)' },
		{ id: 'back', name: '🔙 Back to Main Menu' }
	];

	const performAction = (command: string) => {
		const isGameMenu = activeGame === 'games_menu';
		const items = isGameMenu ? gameMenuItems : mainMenuItems;
		const setSelection = isGameMenu ? setSelectedGameMenuIndex : setSelectedGame;
		const selectionRef = isGameMenu ? selectedGameMenuRef : selectedGameRef;
		// Use ref for reading current value (immediate, not batched)
		// Use state setter for writing (which will sync to ref via useEffect)

		if (command === 'up') {
			const newVal = Math.max(0, selectionRef.current - 1);
			selectionRef.current = newVal; // Update ref immediately for next rapid key
			setSelection(newVal);
		} else if (command === 'down') {
			const newVal = Math.min(items.length - 1, selectionRef.current + 1);
			selectionRef.current = newVal; // Update ref immediately for next rapid key
			setSelection(newVal);
		} else if (command === 'enter') {
			handleAction(items[selectionRef.current].id);
		} else if (command === 'feed' && !activeGame) {
			// Direct shortcut for AI
			handleAction('feed');
		} else if (command === 'rest' && !activeGame) {
			// Direct shortcut for AI
			handleAction('rest');
		}
	};

	const handleAction = async (id: string) => {
		if (!stats) return;

		// Clear screen before major transitions to prevent artifacts
		const clearBeforeTransition = () => clearScreen();

		if (id === 'exit') {
			exit();
		} else if (id === 'settings') {
			clearBeforeTransition();
			setActiveGame('settings');
		} else if (id === 'builder') {
			clearBeforeTransition();
			setActiveGame('builder');
		} else if (id === 'community') {
			clearBeforeTransition();
			setActiveGame('community');
		} else if (id === 'liku_os') {
			clearBeforeTransition();
			setShowLikuOS(true);
			setActiveGame('liku_os');
		} else if (id === 'liku_learn') {
			clearBeforeTransition();
			setActiveGame('liku_learn');
		} else if (id === 'games_menu') {
			clearBeforeTransition();
			setActiveGame('games_menu');
			setSelectedGameMenuIndex(0);
		} else if (id === 'back') {
			clearBeforeTransition();
			setActiveGame(null);
			setShowLikuOS(false);
		} else if (id === 'snake') {
			if (stats.energy < 10) {
				setMessage("Liku is too tired to play! Let him rest first.");
				setTimeout(() => setMessage(null), 3000);
				return;
			}
			clearBeforeTransition();
			setActiveGame('snake');
		} else if (id === 'tictactoe') {
			if (stats.energy < 5) {
				setMessage("Liku is too tired to play! Let him rest first.");
				setTimeout(() => setMessage(null), 3000);
				return;
			}
			clearBeforeTransition();
			setActiveGame('tictactoe');
		} else if (id === 'dinorun') {
			if (stats.energy < 10) {
				setMessage("Liku is too tired to play! Let him rest first.");
				setTimeout(() => setMessage(null), 3000);
				return;
			}
			clearBeforeTransition();
			setActiveGame('dinorun');
		} else if (id === 'hangman') {
			if (stats.energy < 5) {
				setMessage("Liku is too tired to play! Let him rest first.");
				setTimeout(() => setMessage(null), 3000);
				return;
			}
			clearBeforeTransition();
			setActiveGame('hangman');
		} else if (id === 'sudoku') {
			if (stats.energy < 5) {
				setMessage("Liku is too tired to play! Let him rest first.");
				setTimeout(() => setMessage(null), 3000);
				return;
			}
			clearBeforeTransition();
			setActiveGame('sudoku');
		} else if (id === 'chess') {
			if (stats.energy < 5) {
				setMessage("Liku is too tired to play! Let him rest first.");
				setTimeout(() => setMessage(null), 3000);
				return;
			}
			clearBeforeTransition();
			setActiveGame('chess');
		} else if (id === 'feed') {
			if (stats.xp < 10) {
				setMessage("Not enough XP to buy food! Play games to earn XP.");
			} else {
				await db.updateStats({
					 xp: stats.xp - 10,
					 hunger: Math.max(0, stats.hunger - 20),
					 happiness: Math.min(100, stats.happiness + 5)
				});
				setMessage("Yum! Liku feels better.");
				refreshData();
			}
			setTimeout(() => setMessage(null), 3000);
		} else if (id === 'rest') {
			await db.updateStats({
				 energy: Math.min(100, stats.energy + 30),
				 hunger: Math.min(100, stats.hunger + 10)
			});
			setMessage("Liku feels refreshed!");
			refreshData();
			setTimeout(() => setMessage(null), 3000);
		}
	};

	// For human players
	useInput((input, key) => {
		if (ai) return;

		if (activeGame && activeGame !== 'games_menu' && activeGame !== 'liku_os') return;

		if (key.escape && activeGame === 'liku_os') {
			setActiveGame(null);
			setShowLikuOS(false);
			return;
		}

		if (input === 'm' && !activeGame) {
			setMiniDashboardMode(prev => !prev);
			return;
		}

		// Shortcuts for Feed and Rest
		if (input === 'f' && !activeGame) {
			handleAction('feed');
			return;
		}
		if (input === 'r' && !activeGame) {
			handleAction('rest');
			return;
		}
		// Shortcut for Liku Learn
		if (input === 'l' && !activeGame) {
			handleAction('liku_learn');
			return;
		}

		if (key.upArrow) performAction('up');
		if (key.downArrow) performAction('down');
		if (key.return) performAction('enter');
		if (key.escape && activeGame === 'games_menu') {
			clearScreen();
			setActiveGame(null);
		}
	}, { isActive: !ai });

	// Process the action queue one by one
	useEffect(() => {
		if (actionQueue.length > 0) {
			const [currentAction, ...rest] = actionQueue;
			performAction(currentAction);
			setActionQueue(rest);
		}
	}, [actionQueue]);

	// Helper for game exit that clears screen
	const handleGameExit = (returnTo: string | null) => {
		clearScreen();
		setActiveGame(returnTo);
	};

	if (activeGame === 'snake') {
		return <Snake onExit={() => handleGameExit('games_menu')} difficulty={settings?.snakeDifficulty} />;
	}

	if (activeGame === 'tictactoe') {
		return <TicTacToe onExit={() => handleGameExit('games_menu')} difficulty={settings?.snakeDifficulty} />;
	}

	if (activeGame === 'dinorun') {
		return <DinoRun onExit={() => handleGameExit('games_menu')} difficulty={settings?.snakeDifficulty} />;
	}

	if (activeGame === 'hangman') {
		return <Hangman onExit={() => handleGameExit('games_menu')} />;
	}

	if (activeGame === 'sudoku') {
		const sudokuDifficulty = settings?.snakeDifficulty === 'ai' ? 'medium' : settings?.snakeDifficulty;
		return <Sudoku onExit={() => handleGameExit('games_menu')} difficulty={sudokuDifficulty} />;
	}

	if (activeGame === 'chess') {
		return <Chess onExit={() => handleGameExit('games_menu')} mode="ai" difficulty="intermediate" />;
	}

	if (activeGame === 'settings') {
		return <SettingsMenu onExit={() => handleGameExit(null)} onSettingsChanged={refreshData} />;
	}

	if (activeGame === 'builder') {
		return <BuilderUI onExit={() => { handleGameExit(null); refreshData(); }} />;
	}

	if (activeGame === 'liku_learn') {
		return <LikuLearnScreen onExit={() => handleGameExit(null)} />;
	}

	if (activeGame === 'community') {
		return (
			<CommunityGamesMenu
				onExit={() => handleGameExit(null)}
				onSelectGame={(gameId, loadedGame) => {
					clearScreen();
					setLoadedCommunityGame(loadedGame);
					setActiveGame('community_game_playing');
				}}
			/>
		);
	}

	if (activeGame === 'community_game_playing' && loadedCommunityGame) {
		// Use the wrapped component from LoadedGame - includes Suspense and safe props
		const { Component: CommunityGame, metadata } = loadedCommunityGame;
		return (
			<Box flexDirection="column">
				<CommunityGame
					onExit={() => {
						clearScreen();
						setActiveGame('community');
						setLoadedCommunityGame(null);
						refreshData();
					}}
					difficulty={settings?.snakeDifficulty}
				/>
			</Box>
		);
	}

	if (activeGame === 'liku_os') {
		return (
			<Box flexDirection="column">
				<LikuOS mode="FULL" />
				<Box marginTop={1}>
					<Text dimColor>Press Esc to return to main menu</Text>
				</Box>
			</Box>
		);
	}

	// Theme colors
	const getBorderColor = () => {
		switch(settings?.theme) {
			case 'matrix': return 'green';
			case 'cyberpunk': return 'yellow';
			case 'retro': return 'magenta';
			default: return 'cyan';
		}
	};

	const getTitleColor = () => {
		switch(settings?.theme) {
			case 'matrix': return 'green';
			case 'cyberpunk': return 'yellow';
			case 'retro': return 'red';
			default: return 'magenta';
		}
	};

	const isGameMenu = activeGame === 'games_menu';
	const currentMenuItems = isGameMenu ? gameMenuItems : mainMenuItems;
	const currentSelection = isGameMenu ? selectedGameMenuIndex : selectedGame;

	if (miniDashboardMode && !activeGame) {
		return (
			<Box flexDirection="column" width={terminalWidth}>
				<LikuOS mode="CLI" />
				<Box>
					<Text dimColor>Press 'm' to show full menu</Text>
				</Box>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" padding={1} borderStyle="round" borderColor={getBorderColor()} width={terminalWidth}>
			<Box marginBottom={1} flexDirection="column" alignItems="center">
				<Text bold color={getTitleColor()}>🎮 LikuBuddy Game Hub 🎮</Text>
				<Text>Your AI Companion &amp; Generative Game Platform</Text>
			</Box>

			<Box flexDirection="column" marginBottom={1}>
				{stats && proTokens ? (
					<Box flexDirection="column" borderStyle="single" borderColor={settings?.theme === 'matrix' ? 'green' : 'yellow'} paddingX={1}>
						<Box flexDirection="row" justifyContent="space-between">
							<Text>Level: <Text bold color="cyan">{stats.level}</Text></Text>
							<Text>XP: <Text bold color="yellow">{stats.xp}</Text></Text>
							<Text>Tokens: <Text bold color="green">{proTokens.balance}</Text></Text>
						</Box>
						<Box flexDirection="row" justifyContent="space-between">
							<Text>Hunger: <Text color={stats.hunger < 70 ? 'green' : 'yellow'}>{stats.hunger}%</Text></Text>
							<Text>Energy: <Text color={stats.energy > 30 ? 'green' : 'red'}>{stats.energy}%</Text></Text>
							<Text>Happiness: <Text color={stats.happiness > 50 ? 'green' : 'yellow'}>{stats.happiness}%</Text></Text>
						</Box>
					</Box>
				) : (
					<Text>Loading stats...</Text>
				)}
			</Box>

			<Box flexDirection="column" marginBottom={1}>
				{currentMenuItems.map((item, index) => (
					<Box key={item.id}>
						<Text color={index === currentSelection ? 'green' : 'white'} bold={index === currentSelection}>
							{index === currentSelection ? '▶ ' : '  '}
							{item.name}
						</Text>
					</Box>
				))}
			</Box>
			
			{message && (
				<Box marginBottom={1}>
					<Text color="yellow" bold>{message}</Text>
				</Box>
			)}

			<Box marginTop={1} flexDirection="column">
				<Text dimColor>Use ↑/↓ to select, Enter to act{isGameMenu ? ', Esc to back' : ''}</Text>
				<Text dimColor>Press 'm' to toggle mini dashboard, 'l' for Liku Learn</Text>
			</Box>
		</Box>
	);
};

export default GameHub;
