/**
 * SpectatorBar - Spectator UI components for game watching
 * 
 * Displays spectator count, quick reactions, and viewing stats.
 * Designed for terminal UI using React + Ink.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { getSpectatorManager, QualityTier, SpectatorInfo } from '../../websocket/spectator.js';
import { getChatManager } from '../../websocket/chat.js';

// Get singleton instances
const spectatorManager = getSpectatorManager();
const chatManager = getChatManager();

// ========================================
// Types
// ========================================

export interface SpectatorBarProps {
  sessionId: string;
  gameType: string;
  isSpectator?: boolean;
  userId?: string;
  showReactions?: boolean;
  compact?: boolean;
  onQualityChange?: (quality: QualityTier) => void;
}

export interface SpectatorCountProps {
  count: number;
  maxSpectators?: number;
  live?: boolean;
}

export interface QuickReactionsProps {
  sessionId: string;
  userId: string;
  gameType?: string;
  onReact?: (emoji: string) => void;
}

// ========================================
// Spectator Count Display
// ========================================

export const SpectatorCount: React.FC<SpectatorCountProps> = ({
  count,
  maxSpectators,
  live = true,
}) => {
  const [blink, setBlink] = useState(true);

  // Blink effect for live indicator
  useEffect(() => {
    if (!live) return;
    const interval = setInterval(() => {
      setBlink(b => !b);
    }, 1000);
    return () => clearInterval(interval);
  }, [live]);

  const liveIndicator = live ? (
    <Text color={blink ? 'red' : 'gray'}>● </Text>
  ) : null;

  return (
    <Box>
      {liveIndicator}
      <Text color="cyan">👁 </Text>
      <Text bold>{count}</Text>
      {maxSpectators && (
        <Text dimColor>/{maxSpectators}</Text>
      )}
      <Text dimColor> watching</Text>
    </Box>
  );
};

// ========================================
// Quick Reactions Bar
// ========================================

export const QuickReactions: React.FC<QuickReactionsProps> = ({
  sessionId,
  userId,
  gameType,
  onReact,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [cooldown, setCooldown] = useState(false);
  const reactions = chatManager.getQuickReactions(gameType);

  useInput((input, key) => {
    // Number keys for quick selection (1-9)
    const numKey = parseInt(input);
    if (numKey >= 1 && numKey <= reactions.length && !cooldown) {
      handleReact(reactions[numKey - 1]);
      return;
    }

    // Arrow navigation
    if (key.leftArrow) {
      setSelectedIndex(i => Math.max(-1, i - 1));
      return;
    }
    if (key.rightArrow) {
      setSelectedIndex(i => Math.min(reactions.length - 1, i + 1));
      return;
    }

    // Enter to send
    if (key.return && selectedIndex >= 0 && !cooldown) {
      handleReact(reactions[selectedIndex]);
    }
  });

  const handleReact = useCallback((emoji: string) => {
    if (cooldown) return;
    
    // Send reaction as chat message
    const roomId = `spectator:${sessionId}`;
    chatManager.sendMessage(roomId, userId, emoji);
    
    if (onReact) onReact(emoji);

    // Cooldown to prevent spam
    setCooldown(true);
    setTimeout(() => setCooldown(false), 500);
  }, [sessionId, userId, onReact, cooldown]);

  return (
    <Box>
      <Text dimColor>React: </Text>
      {reactions.map((emoji: string, i: number) => (
        <Text 
          key={i}
          color={cooldown ? 'gray' : (i === selectedIndex ? 'yellow' : undefined)}
        >
          {i + 1}.{emoji} 
        </Text>
      ))}
    </Box>
  );
};

// ========================================
// Quality Selector
// ========================================

interface QualitySelectorProps {
  currentQuality: QualityTier;
  onChange: (quality: QualityTier) => void;
  disabled?: boolean;
}

const QualitySelector: React.FC<QualitySelectorProps> = ({
  currentQuality,
  onChange,
  disabled = false,
}) => {
  const qualities: QualityTier[] = ['high', 'medium', 'low'];
  const [selectedIndex, setSelectedIndex] = useState(
    qualities.indexOf(currentQuality)
  );

  useInput((input, key) => {
    if (disabled) return;

    if (input === 'g' || input === 'G') {
      // Cycle through qualities
      const nextIndex = (selectedIndex + 1) % qualities.length;
      setSelectedIndex(nextIndex);
      onChange(qualities[nextIndex]);
    }
  });

  const qualityColors: Record<QualityTier, string> = {
    high: 'green',
    medium: 'yellow',
    low: 'red',
  };

  const qualityLabels: Record<QualityTier, string> = {
    high: 'HD',
    medium: 'SD',
    low: 'LD',
  };

  return (
    <Box>
      <Text dimColor>Quality: </Text>
      <Text color={qualityColors[currentQuality] as any} bold>
        {qualityLabels[currentQuality]}
      </Text>
      <Text dimColor> (G to change)</Text>
    </Box>
  );
};

// ========================================
// Spectator List (for hosts)
// ========================================

interface SpectatorListProps {
  sessionId: string;
  maxVisible?: number;
}

export const SpectatorList: React.FC<SpectatorListProps> = ({
  sessionId,
  maxVisible = 5,
}) => {
  const [spectators, setSpectators] = useState<SpectatorInfo[]>([]);

  useEffect(() => {
    const updateSpectators = () => {
      const list = spectatorManager.getSpectators(sessionId);
      setSpectators(list);
    };

    updateSpectators();

    const handleJoin = (data: { sessionId: string }) => {
      if (data.sessionId === sessionId) updateSpectators();
    };
    const handleLeave = (data: { sessionId: string }) => {
      if (data.sessionId === sessionId) updateSpectators();
    };

    spectatorManager.on('spectator:join', handleJoin);
    spectatorManager.on('spectator:leave', handleLeave);

    return () => {
      spectatorManager.off('spectator:join', handleJoin);
      spectatorManager.off('spectator:leave', handleLeave);
    };
  }, [sessionId]);

  const visible = spectators.slice(0, maxVisible);
  const remaining = spectators.length - maxVisible;

  return (
    <Box flexDirection="column">
      <Text bold dimColor>Spectators:</Text>
      {visible.length === 0 ? (
        <Text dimColor>No spectators yet</Text>
      ) : (
        visible.map(spec => (
          <Box key={spec.id}>
            <Text color={spec.qualityTier === 'high' ? 'green' : 'yellow'}>
              • {spec.displayName || spec.id.slice(0, 8)}
            </Text>
          </Box>
        ))
      )}
      {remaining > 0 && (
        <Text dimColor>...and {remaining} more</Text>
      )}
    </Box>
  );
};

// ========================================
// Main Spectator Bar
// ========================================

export const SpectatorBar: React.FC<SpectatorBarProps> = ({
  sessionId,
  gameType,
  isSpectator = true,
  userId = 'anonymous',
  showReactions = true,
  compact = false,
  onQualityChange,
}) => {
  const [spectatorCount, setSpectatorCount] = useState(0);
  const [quality, setQuality] = useState<QualityTier>('medium');
  const [maxSpectators, setMaxSpectators] = useState(100);

  useEffect(() => {
    // Get initial count
    const count = spectatorManager.getSpectatorCount(sessionId);
    setSpectatorCount(count);

    // maxSpectators defaults to 100 - session config not exposed directly
    // This could be enhanced later to expose config via getSessionStats

    // Subscribe to updates
    const handleJoin = (data: { sessionId: string }) => {
      if (data.sessionId === sessionId) {
        setSpectatorCount(c => c + 1);
      }
    };

    const handleLeave = (data: { sessionId: string }) => {
      if (data.sessionId === sessionId) {
        setSpectatorCount(c => Math.max(0, c - 1));
      }
    };

    spectatorManager.on('spectator:join', handleJoin);
    spectatorManager.on('spectator:leave', handleLeave);

    return () => {
      spectatorManager.off('spectator:join', handleJoin);
      spectatorManager.off('spectator:leave', handleLeave);
    };
  }, [sessionId]);

  const handleQualityChange = useCallback((newQuality: QualityTier) => {
    setQuality(newQuality);
    spectatorManager.setSpectatorQuality(userId, newQuality);
    if (onQualityChange) onQualityChange(newQuality);
  }, [userId, onQualityChange]);

  if (compact) {
    return (
      <Box>
        <SpectatorCount count={spectatorCount} />
        {showReactions && (
          <Box marginLeft={2}>
            <QuickReactions 
              sessionId={sessionId}
              userId={userId}
              gameType={gameType}
            />
          </Box>
        )}
      </Box>
    );
  }

  return (
    <Box 
      flexDirection="column" 
      borderStyle="round" 
      borderColor="magenta"
      paddingX={1}
    >
      <Box justifyContent="space-between">
        <SpectatorCount 
          count={spectatorCount} 
          maxSpectators={maxSpectators}
        />
        {isSpectator && (
          <QualitySelector
            currentQuality={quality}
            onChange={handleQualityChange}
          />
        )}
      </Box>

      {showReactions && (
        <Box marginTop={1}>
          <QuickReactions
            sessionId={sessionId}
            userId={userId}
            gameType={gameType}
          />
        </Box>
      )}
    </Box>
  );
};

// ========================================
// Host Controls Bar
// ========================================

export interface HostControlsProps {
  sessionId: string;
  onClose?: () => void;
}

export const HostControls: React.FC<HostControlsProps> = ({
  sessionId,
  onClose,
}) => {
  const [isLive, setIsLive] = useState(true);
  const [spectatorCount, setSpectatorCount] = useState(0);

  useEffect(() => {
    const count = spectatorManager.getSpectatorCount(sessionId);
    setSpectatorCount(count);

    const handleJoin = (data: { sessionId: string }) => {
      if (data.sessionId === sessionId) {
        setSpectatorCount(c => c + 1);
      }
    };

    const handleLeave = (data: { sessionId: string }) => {
      if (data.sessionId === sessionId) {
        setSpectatorCount(c => Math.max(0, c - 1));
      }
    };

    spectatorManager.on('spectator:join', handleJoin);
    spectatorManager.on('spectator:leave', handleLeave);

    return () => {
      spectatorManager.off('spectator:join', handleJoin);
      spectatorManager.off('spectator:leave', handleLeave);
    };
  }, [sessionId]);

  useInput((input, key) => {
    if (input === 'l' || input === 'L') {
      setIsLive(live => !live);
      // In a real implementation, this would toggle spectator visibility
    }
    if (input === 'x' || input === 'X') {
      spectatorManager.closeSession(sessionId);
      if (onClose) onClose();
    }
  });

  return (
    <Box 
      borderStyle="double" 
      borderColor="red"
      paddingX={1}
      justifyContent="space-between"
    >
      <Box>
        <Text bold color="red">HOST </Text>
        <Text color={isLive ? 'red' : 'gray'}>{isLive ? '● LIVE' : '○ PAUSED'}</Text>
      </Box>
      <SpectatorCount count={spectatorCount} live={isLive} />
      <Box>
        <Text dimColor>L:toggle | X:close</Text>
      </Box>
    </Box>
  );
};

export default SpectatorBar;
