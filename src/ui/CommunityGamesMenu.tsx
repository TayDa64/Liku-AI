import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { gameLoader } from '../core/GameLoader.js';

interface CommunityGamesMenuProps {
  onExit: () => void;
  onSelectGame: (gameId: string, GameComponent: any) => void;
}

const CommunityGamesMenu: React.FC<CommunityGamesMenuProps> = ({ onExit, onSelectGame }) => {
  const [games, setGames] = useState<Array<{ id: string; name: string; description: string }>>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingGame, setLoadingGame] = useState(false);

  useEffect(() => {
    loadGames();
  }, []);

  const loadGames = async () => {
    try {
      setLoading(true);
      const communityGames = await gameLoader.listCommunityGames();
      setGames(communityGames);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load games');
      setLoading(false);
    }
  };

  useInput((input, key) => {
    if (key.escape) {
      onExit();
      return;
    }

    if (key.upArrow) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
    }

    if (key.downArrow) {
      setSelectedIndex(prev => Math.min(games.length, prev + 1));
    }

    if (key.return) {
      if (selectedIndex === games.length) {
        // Back option
        onExit();
      } else {
        // Load and play selected game
        handlePlayGame(games[selectedIndex].id);
      }
    }
  });

  const handlePlayGame = async (gameId: string) => {
    try {
      setLoadingGame(true);
      const GameComponent = await gameLoader.loadGame(gameId);
      onSelectGame(gameId, GameComponent);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load game');
      setLoadingGame(false);
    }
  };

  if (loading) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1}>
        <Text bold color="yellow">Loading community games...</Text>
      </Box>
    );
  }

  if (loadingGame) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1}>
        <Text bold color="yellow">Loading game...</Text>
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="magenta"
      padding={1}
      width={70}
    >
      <Box marginBottom={1}>
        <Text bold color="magenta">🌟 Community Games 🌟</Text>
      </Box>

      {error && (
        <Box marginBottom={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}

      {games.length === 0 ? (
        <Box flexDirection="column" marginBottom={1}>
          <Text dimColor>No community games yet.</Text>
          <Text dimColor>Use the Builder to create your first game!</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginBottom={1}>
          {games.map((game, index) => (
            <Box key={game.id} marginBottom={1}>
              <Box flexDirection="column">
                <Text color={index === selectedIndex ? 'green' : 'white'}>
                  {index === selectedIndex ? '> ' : '  '}
                  <Text bold>{game.name}</Text>
                </Text>
                {index === selectedIndex && (
                  <Text dimColor>  {game.description}</Text>
                )}
              </Box>
            </Box>
          ))}
        </Box>
      )}

      <Box marginTop={1}>
        <Text color={selectedIndex === games.length ? 'green' : 'white'}>
          {selectedIndex === games.length ? '> ' : '  '}
          🔙 Back to Main Menu
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Use ↑/↓ to select, Enter to play, Esc to back</Text>
      </Box>
    </Box>
  );
};

export default CommunityGamesMenu;
