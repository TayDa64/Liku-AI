import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { db, ProTokens, PlayerStats } from '../services/DatabaseService.js';

// Real-time DB Hook for Pro Tokens
const useProTokens = (): ProTokens | null => {
  const [tokens, setTokens] = useState<ProTokens | null>(null);

  useEffect(() => {
    // Initial load
    db.getProTokens('me').then(setTokens).catch(console.error);

    // Poll database every 2 seconds for real-time updates
    const tick = setInterval(() => {
      db.getProTokens('me').then(setTokens).catch(console.error);
    }, 2000);

    return () => clearInterval(tick);
  }, []);

  return tokens;
};

// Real-time DB Hook for Player Stats
const usePlayerStats = (): PlayerStats | null => {
  const [stats, setStats] = useState<PlayerStats | null>(null);

  useEffect(() => {
    // Initial load
    db.getStats().then(setStats).catch(console.error);

    // Poll database every 2 seconds for real-time updates
    const tick = setInterval(() => {
      db.getStats().then(setStats).catch(console.error);
    }, 2000);

    return () => clearInterval(tick);
  }, []);

  return stats;
};

interface LikuOSProps {
  mode: 'CLI' | 'FULL';
}

/**
 * LikuOS - The vibrant stats line and OS interface
 * 
 * CLI mode: Shows a compact one-liner with token balance and status
 * FULL mode: Shows the complete game deck interface
 */
export const LikuOS: React.FC<LikuOSProps> = ({ mode }) => {
  const balance = useProTokens();
  const stats = usePlayerStats();

  if (mode === 'CLI') {
    // The "Vibrant Two-Liner" for CLI integration with proper wrapping
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Box>
            <Text bold color="yellow">💎 </Text>
            <Text bold color="green">{balance?.balance || 0}</Text>
          </Box>
          <Text color="blue" bold>LikuBuddy OS v2.0</Text>
          {stats && (
            <Text>Lvl <Text bold color="cyan">{stats.level}</Text></Text>
          )}
          <Text italic dimColor>Running</Text>
        </Box>
        {stats && (
          <Box flexDirection="row" justifyContent="space-between">
            <Text color="cyan">⚡Energy: {stats.energy}%</Text>
            <Text color="magenta">💖Happiness: {stats.happiness}%</Text>
            <Text color="yellow">🍖Hunger: {stats.hunger}%</Text>
            <Text color="white">✨XP: {stats.xp}</Text>
          </Box>
        )}
      </Box>
    );
  }

  // FULL mode would show the complete game deck
  // For now, we'll use this as a stats display
  return (
    <Box flexDirection="column" borderStyle="double" borderColor="cyan" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="magenta">🎮 LikuBuddy OS v2.0 🎮</Text>
      </Box>
      
      <Box borderStyle="single" borderColor="green" paddingX={1} marginBottom={1}>
        <Box flexDirection="column" width={50}>
          <Box>
            <Text bold color="yellow">💎 Pro Tokens: </Text>
            <Text color="green">{balance?.balance || 0}</Text>
          </Box>
          {stats && (
            <Box marginTop={1} flexDirection="column">
              <Box>
                <Text>Level: </Text>
                <Text color="cyan" bold>{stats.level}</Text>
                <Text>  XP: </Text>
                <Text color="yellow">{stats.xp}</Text>
              </Box>
              <Box marginTop={1}>
                <Text>Energy: </Text>
                <Text color={stats.energy > 30 ? 'green' : 'red'}>{stats.energy}%</Text>
                <Text>  Hunger: </Text>
                <Text color={stats.hunger < 70 ? 'green' : 'yellow'}>{stats.hunger}%</Text>
                <Text>  Happiness: </Text>
                <Text color={stats.happiness > 50 ? 'green' : 'yellow'}>{stats.happiness}%</Text>
              </Box>
            </Box>
          )}
        </Box>
      </Box>

      <Box>
        <Text dimColor>Real-time stats • Last updated: {new Date().toLocaleTimeString()}</Text>
      </Box>
    </Box>
  );
};

export default LikuOS;
