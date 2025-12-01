/**
 * ChatPanel - Chat UI component for spectator mode
 * 
 * Displays messages, reactions, and input for game chat rooms.
 * Designed for terminal UI using React + Ink.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import { getChatManager, ChatMessage, ChatEvent } from '../../websocket/chat.js';

// Get singleton instance
const chatManager = getChatManager();

// ========================================
// Types
// ========================================

export interface ChatPanelProps {
  roomId: string;
  userId: string;
  displayName: string;
  isHost?: boolean;
  maxVisibleMessages?: number;
  width?: number;
  onExit?: () => void;
  gameType?: string;
}

interface MessageDisplayProps {
  message: ChatMessage;
  reactions: Map<string, number>;
  currentUserId: string;
  isSelected: boolean;
}

// ========================================
// Quick Reaction Selector
// ========================================

interface QuickReactionProps {
  onSelect: (emoji: string) => void;
  onCancel: () => void;
  gameType?: string;
}

const QuickReactionSelector: React.FC<QuickReactionProps> = ({ 
  onSelect, 
  onCancel, 
  gameType 
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const reactions = chatManager.getQuickReactions(gameType);

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.leftArrow) {
      setSelectedIndex(i => Math.max(0, i - 1));
      return;
    }
    if (key.rightArrow) {
      setSelectedIndex(i => Math.min(reactions.length - 1, i + 1));
      return;
    }
    if (key.return) {
      onSelect(reactions[selectedIndex]);
    }
  });

  return (
    <Box borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text>React: </Text>
      {reactions.map((emoji: string, i: number) => (
        <Text key={emoji} color={i === selectedIndex ? 'yellow' : undefined}>
          {i === selectedIndex ? `[${emoji}]` : ` ${emoji} `}
        </Text>
      ))}
      <Text dimColor> (←→ select, Enter pick, Esc cancel)</Text>
    </Box>
  );
};

// ========================================
// Message Display
// ========================================

const MessageDisplay: React.FC<MessageDisplayProps> = ({
  message,
  reactions,
  currentUserId,
  isSelected,
}) => {
  const isOwnMessage = message.senderId === currentUserId;
  const isSystem = message.type === 'system';

  // Format timestamp
  const time = new Date(message.timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  // Build reaction string
  const reactionStr = Array.from(reactions.entries())
    .map(([emoji, count]) => `${emoji}${count > 1 ? count : ''}`)
    .join(' ');

  if (isSystem) {
    return (
      <Box>
        <Text dimColor>
          [{time}] ⚙️ {message.content}
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box>
        {isSelected && <Text color="yellow">▶ </Text>}
        <Text dimColor>[{time}] </Text>
        <Text color={isOwnMessage ? 'cyan' : 'white'} bold={isOwnMessage}>
          {message.senderName}
        </Text>
        <Text>: {message.content}</Text>
      </Box>
      {reactionStr && (
        <Box marginLeft={4}>
          <Text dimColor>{reactionStr}</Text>
        </Box>
      )}
    </Box>
  );
};

// ========================================
// Chat Panel Component
// ========================================

export const ChatPanel: React.FC<ChatPanelProps> = ({
  roomId,
  userId,
  displayName,
  isHost = false,
  maxVisibleMessages = 10,
  width = 40,
  onExit,
  gameType,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [inputMode, setInputMode] = useState(true);
  const [selectedMessageIndex, setSelectedMessageIndex] = useState(-1);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const { exit } = useApp();

  // Load initial messages and join room
  useEffect(() => {
    // Create room if needed
    chatManager.getOrCreateGameRoom(roomId, gameType || 'generic');
    
    // Join room
    const role = isHost ? 'owner' : 'viewer';
    const joinResult = chatManager.join(roomId, userId, displayName, role);
    
    if (!joinResult.success) {
      // Check if error is "already joined" which is OK
      if (joinResult.error && !joinResult.error.includes('already')) {
        setError(joinResult.error || 'Failed to join room');
        return;
      }
    }

    // Load history
    const history = chatManager.getHistory(roomId);
    setMessages(history);
  }, [roomId, userId, displayName, isHost, gameType]);

  // Subscribe to events
  useEffect(() => {
    try {
      const unsubscribe = chatManager.subscribe(roomId, (event: ChatEvent) => {
        if (event.type === 'message') {
          const data = event.data as { message?: ChatMessage };
          if (data?.message) {
            setMessages(prev => [...prev, data.message!].slice(-100));
          }
        } else if (event.type === 'moderation') {
          const data = event.data as { action: string; targetId: string };
          if (data?.targetId === userId) {
            if (data.action === 'mute') {
              setIsMuted(true);
              setError('You have been muted');
            } else if (data.action === 'unmute') {
              setIsMuted(false);
              setError(null);
            } else if (data.action === 'kick') {
              setError('You have been kicked');
              if (onExit) setTimeout(onExit, 2000);
            }
          }
        }
      });

      return unsubscribe;
    } catch {
      // Room may not exist yet
      return () => {};
    }
  }, [roomId, userId, onExit]);

  // Handle input
  useInput((input, key) => {
    // Exit handling
    if (key.escape) {
      if (showReactionPicker) {
        setShowReactionPicker(false);
      } else if (!inputMode) {
        setInputMode(true);
        setSelectedMessageIndex(-1);
      } else if (onExit) {
        chatManager.leave(roomId, userId);
        onExit();
      }
      return;
    }

    // Tab toggles between input and message selection
    if (key.tab) {
      if (inputMode) {
        setInputMode(false);
        setSelectedMessageIndex(messages.length - 1);
      } else {
        setInputMode(true);
        setSelectedMessageIndex(-1);
      }
      return;
    }

    // Message navigation
    if (!inputMode && !showReactionPicker) {
      if (key.upArrow) {
        setSelectedMessageIndex(i => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow) {
        setSelectedMessageIndex(i => Math.min(messages.length - 1, i + 1));
        return;
      }
      // 'r' to react
      if (input === 'r' && selectedMessageIndex >= 0) {
        setShowReactionPicker(true);
        return;
      }
    }
  });

  // Send message
  const handleSubmit = useCallback((text: string) => {
    if (!text.trim()) return;
    
    const result = chatManager.sendMessage(roomId, userId, text.trim());
    if (result.success) {
      setInputText('');
      setError(null);
    } else {
      setError(result.error || 'Failed to send');
    }
  }, [roomId, userId]);

  // Add reaction
  const handleReaction = useCallback((emoji: string) => {
    if (selectedMessageIndex < 0 || selectedMessageIndex >= messages.length) {
      return;
    }
    const message = messages[selectedMessageIndex];
    chatManager.addReaction(roomId, message.id, userId, emoji);
    setShowReactionPicker(false);
  }, [roomId, userId, selectedMessageIndex, messages]);

  // Get reactions for a message
  const getReactions = (messageId: string): Map<string, number> => {
    return chatManager.getMessageReactions(messageId);
  };

  // Get visible messages
  const visibleMessages = messages.slice(-maxVisibleMessages);

  return (
    <Box 
      flexDirection="column" 
      width={width} 
      borderStyle="round" 
      borderColor={inputMode ? 'cyan' : 'gray'}
      paddingX={1}
    >
      {/* Header */}
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color="cyan">💬 Chat</Text>
        <Text dimColor>{messages.length} msgs</Text>
      </Box>

      {/* Messages */}
      <Box flexDirection="column" height={maxVisibleMessages}>
        {visibleMessages.length === 0 ? (
          <Text dimColor>No messages yet. Say hi! 👋</Text>
        ) : (
          visibleMessages.map((msg, idx) => {
            const globalIndex = messages.length - maxVisibleMessages + idx;
            const isSelected = globalIndex === selectedMessageIndex;
            return (
              <MessageDisplay
                key={msg.id}
                message={msg}
                reactions={getReactions(msg.id)}
                currentUserId={userId}
                isSelected={isSelected && !inputMode}
              />
            );
          })
        )}
      </Box>

      {/* Reaction picker overlay */}
      {showReactionPicker && (
        <QuickReactionSelector
          onSelect={handleReaction}
          onCancel={() => setShowReactionPicker(false)}
          gameType={gameType}
        />
      )}

      {/* Error display */}
      {error && (
        <Box>
          <Text color="red">⚠ {error}</Text>
        </Box>
      )}

      {/* Muted indicator */}
      {isMuted && (
        <Box>
          <Text color="yellow">🔇 You are muted</Text>
        </Box>
      )}

      {/* Input area */}
      <Box marginTop={1} borderStyle="single" borderColor={inputMode ? 'green' : 'gray'}>
        {inputMode ? (
          <TextInput
            value={inputText}
            onChange={setInputText}
            onSubmit={handleSubmit}
            placeholder="Type a message..."
          />
        ) : (
          <Text dimColor>Press Tab to type, ↑↓ to select, R to react</Text>
        )}
      </Box>

      {/* Help */}
      <Box>
        <Text dimColor>Tab: toggle mode | Esc: exit | R: react</Text>
      </Box>
    </Box>
  );
};

// ========================================
// Compact Chat (for sidebar)
// ========================================

export interface CompactChatProps {
  roomId: string;
  userId: string;
  displayName: string;
  maxMessages?: number;
  width?: number;
}

export const CompactChat: React.FC<CompactChatProps> = ({
  roomId,
  userId,
  displayName,
  maxMessages = 5,
  width = 30,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    chatManager.getOrCreateGameRoom(roomId, 'generic');
    chatManager.join(roomId, userId, displayName);
    const history = chatManager.getHistory(roomId, maxMessages);
    setMessages(history);
  }, [roomId, userId, displayName, maxMessages]);

  useEffect(() => {
    try {
      const unsubscribe = chatManager.subscribe(roomId, (event: ChatEvent) => {
        if (event.type === 'message') {
          const data = event.data as { message?: ChatMessage };
          if (data?.message) {
            setMessages(prev => [...prev, data.message!].slice(-maxMessages));
          }
        }
      });
      return unsubscribe;
    } catch {
      return () => {};
    }
  }, [roomId, maxMessages]);

  return (
    <Box flexDirection="column" width={width}>
      <Text bold dimColor>💬 Chat</Text>
      {messages.map(msg => (
        <Box key={msg.id}>
          <Text color="cyan">{msg.senderName}: </Text>
          <Text>{msg.content.slice(0, 20)}{msg.content.length > 20 ? '...' : ''}</Text>
        </Box>
      ))}
    </Box>
  );
};

export default ChatPanel;
