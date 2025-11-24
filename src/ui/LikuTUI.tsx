import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import Snake from './games/Snake.js';
import TicTacToe from './games/TicTacToe.js';
import DinoRun from './games/DinoRun.js';
import SettingsMenu from './SettingsMenu.js';
import BuilderUI from './BuilderUI.js';
import CommunityGamesMenu from './CommunityGamesMenu.js';
import LikuOS from './LikuOS.js';
import { db, PlayerStats, UserSettings, ProTokens } from '../services/DatabaseService.js';

const GameHub = () => {
	const [selectedGame, setSelectedGame] = useState<number>(0);
	const [selectedGameMenuIndex, setSelectedGameMenuIndex] = useState<number>(0);
	const [activeGame, setActiveGame] = useState<string | null>(null);
	const [stats, setStats] = useState<PlayerStats | null>(null);
	const [settings, setSettings] = useState<UserSettings | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const [proTokens, setProTokens] = useState<ProTokens | null>(null);
	const [communityGameComponent, setCommunityGameComponent] = useState<any>(null);
	const [showLikuOS, setShowLikuOS] = useState(false);

	const refreshData = () => {
		db.getStats().then(setStats).catch(console.error);
		db.getSettings().then(setSettings).catch(console.error);
		db.getProTokens('me').then(setProTokens).catch(console.error);
	};

	useEffect(() => {
		refreshData();
	}, [activeGame]); // Refresh when returning from a game

	const mainMenuItems = [
		{ id: 'games_menu', name: '🎮 Let\'s Play' },
		{ id: 'builder', name: '🛠️ Build a Game (AI-Powered)' },
		{ id: 'community', name: '🌟 Community Games' },
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
		{ id: 'back', name: '🔙 Back to Main Menu' }
	];

	const handleAction = async (id: string) => {
		if (!stats) return;

		if (id === 'exit') {
			process.exit(0);
		} else if (id === 'settings') {
			setActiveGame('settings');
		} else if (id === 'builder') {
			setActiveGame('builder');
		} else if (id === 'community') {
			setActiveGame('community');
		} else if (id === 'liku_os') {
			setShowLikuOS(true);
			setActiveGame('liku_os');
		} else if (id === 'games_menu') {
			setActiveGame('games_menu');
			setSelectedGameMenuIndex(0);
		} else if (id === 'back') {
			setActiveGame(null);
			setShowLikuOS(false);
		} else if (id === 'snake') {
			if (stats.energy < 10) {
				setMessage("Liku is too tired to play! Let him rest first.");
				setTimeout(() => setMessage(null), 3000);
				return;
			}
			setActiveGame('snake');
		} else if (id === 'tictactoe') {
			if (stats.energy < 5) {
				setMessage("Liku is too tired to play! Let him rest first.");
				setTimeout(() => setMessage(null), 3000);
				return;
			}
			setActiveGame('tictactoe');
		} else if (id === 'dinorun') {
			if (stats.energy < 10) {
				setMessage("Liku is too tired to play! Let him rest first.");
				setTimeout(() => setMessage(null), 3000);
				return;
			}
			setActiveGame('dinorun');
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

	useInput((input, key) => {
		if (activeGame && activeGame !== 'games_menu' && activeGame !== 'liku_os') return;

		if (key.escape && activeGame === 'liku_os') {
			setActiveGame(null);
			setShowLikuOS(false);
			return;
		}

		const isGameMenu = activeGame === 'games_menu';
		const items = isGameMenu ? gameMenuItems : mainMenuItems;
		const setSelection = isGameMenu ? setSelectedGameMenuIndex : setSelectedGame;
		const currentSelection = isGameMenu ? selectedGameMenuIndex : selectedGame;

		if (key.upArrow) {
			setSelection(prev => Math.max(0, prev - 1));
		}
		if (key.downArrow) {
			setSelection(prev => Math.min(items.length - 1, prev + 1));
		}
		if (key.return) {
			handleAction(items[currentSelection].id);
		}
		if (key.escape && isGameMenu) {
			setActiveGame(null);
		}
	});

	if (activeGame === 'snake') {
		return <Snake onExit={() => setActiveGame('games_menu')} difficulty={settings?.snakeDifficulty} />;
	}

	if (activeGame === 'tictactoe') {
		return <TicTacToe onExit={() => setActiveGame('games_menu')} difficulty={settings?.snakeDifficulty} />;
	}

	if (activeGame === 'dinorun') {
		return <DinoRun onExit={() => setActiveGame('games_menu')} difficulty={settings?.snakeDifficulty} />;
	}

	if (activeGame === 'settings') {
		return <SettingsMenu onExit={() => setActiveGame(null)} onSettingsChanged={refreshData} />;
	}

	if (activeGame === 'builder') {
		return <BuilderUI onExit={() => { setActiveGame(null); refreshData(); }} />;
	}

	if (activeGame === 'community') {
		return (
			<CommunityGamesMenu
				onExit={() => setActiveGame(null)}
				onSelectGame={(gameId, GameComponent) => {
					setCommunityGameComponent(GameComponent);
					setActiveGame('community_game_playing');
				}}
			/>
		);
	}

	if (activeGame === 'community_game_playing' && communityGameComponent) {
		const CommunityGame = communityGameComponent;
		return (
			<CommunityGame
				onExit={() => {
					setActiveGame('community');
					setCommunityGameComponent(null);
					refreshData();
				}}
				difficulty={settings?.snakeDifficulty}
			/>
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

	return (
		<Box flexDirection="column" padding={1} borderStyle="round" borderColor={getBorderColor()} width={60}>
			<Box marginBottom={1} flexDirection="column" alignItems="center">
				<Text bold color={getTitleColor()}>🎮 LikuBuddy Game Hub 🎮</Text>
				<Text>Your AI Companion & Generative Game Platform</Text>
			</Box>

			<Box height={4}>
				{stats && proTokens ? (
					<Box flexDirection="column">
						<Box borderStyle="single" borderColor={settings?.theme === 'matrix' ? 'green' : 'yellow'} paddingX={1} marginBottom={1} flexDirection="row" gap={2}>
							<Text>Level: {stats.level}</Text>
							<Text>XP: {stats.xp}</Text>
							<Text>Hunger: {stats.hunger}%</Text>
							<Text>Energy: {stats.energy}%</Text>
							<Text>Happiness: {stats.happiness}%</Text>
						</Box>
						<Box paddingX={1}>
							<Text bold color="yellow">💎 Pro Tokens: </Text>
							<Text color="green">{proTokens.balance}</Text>
						</Box>
					</Box>
				) : (
					<Text>Loading stats...</Text>
				)}
			</Box>

			<Box flexDirection="column" height={Math.max(mainMenuItems.length, gameMenuItems.length)}>
				{currentMenuItems.map((item, index) => (
					<Box key={item.id}>
						<Text color={index === currentSelection ? 'green' : 'white'}>
							{index === currentSelection ? '> ' : '  '}
							{item.name}
						</Text>
					</Box>
				))}
			</Box>
			
			<Box height={2} marginTop={1}>
				{message && (
					<Text color="yellow" bold>{message}</Text>
				)}
			</Box>

			<Box marginTop={1}>
				<Text dimColor>Use ↑/↓ to select, Enter to act{isGameMenu ? ', Esc to back' : ''}</Text>
			</Box>
		</Box>
	);
};

export default GameHub;
