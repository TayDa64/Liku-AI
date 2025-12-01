/**
 * Chat System for Remote Play
 * Provides real-time chat with reactions, moderation, and room-based messaging
 */

// ============================================================================
// Types
// ============================================================================

export type MessageType = 'text' | 'reaction' | 'system' | 'emote' | 'whisper';

export interface ChatMessage {
  id: string;
  type: MessageType;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: number;
  roomId: string;
  replyTo?: string;  // ID of message being replied to
  metadata?: Record<string, unknown>;
}

export interface ChatReaction {
  messageId: string;
  userId: string;
  emoji: string;
  timestamp: number;
}

export interface ChatRoom {
  id: string;
  name: string;
  type: 'game' | 'lobby' | 'direct';
  createdAt: number;
  participants: Set<string>;
  moderators: Set<string>;
  settings: RoomSettings;
}

export interface RoomSettings {
  maxParticipants: number;
  slowModeSeconds: number;  // 0 = disabled
  allowReactions: boolean;
  allowWhispers: boolean;
  messageRetentionCount: number;
  allowEmotes: boolean;
}

export interface ChatParticipant {
  id: string;
  name: string;
  role: 'viewer' | 'player' | 'moderator' | 'owner';
  joinedAt: number;
  mutedUntil?: number;
  messageCount: number;
}

export interface RateLimitConfig {
  messagesPerSecond: number;
  messagesPerMinute: number;
  burstLimit: number;
  cooldownMs: number;
}

export interface ChatStats {
  totalMessages: number;
  totalReactions: number;
  uniqueParticipants: number;
  messagesPerMinute: number;
  topEmojis: Array<{ emoji: string; count: number }>;
}

export interface ModerationAction {
  type: 'mute' | 'unmute' | 'kick' | 'ban' | 'warn' | 'delete';
  targetUserId: string;
  moderatorId: string;
  reason?: string;
  duration?: number;  // For mute/ban in milliseconds
  timestamp: number;
}

export interface ChatEvent {
  type: 'message' | 'reaction_add' | 'reaction_remove' | 'join' | 'leave' | 'moderation' | 'typing';
  data: unknown;
  roomId: string;
  timestamp: number;
}

// ============================================================================
// Default Configurations
// ============================================================================

const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  maxParticipants: 100,
  slowModeSeconds: 0,
  allowReactions: true,
  allowWhispers: true,
  messageRetentionCount: 500,
  allowEmotes: true,
};

const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  messagesPerSecond: 2,
  messagesPerMinute: 30,
  burstLimit: 5,
  cooldownMs: 1000,
};

// Common emoji reactions for quick access
export const QUICK_REACTIONS = ['👍', '👎', '❤️', '😂', '😮', '🎉', '🔥', '👏'] as const;

// Game-specific emotes
export const GAME_EMOTES: Record<string, string[]> = {
  snake: ['🐍', '🍎', '💀', '🏆', '⬆️', '⬇️', '⬅️', '➡️'],
  tictactoe: ['❌', '⭕', '🤝', '🎯', '🧠'],
  dino: ['🦖', '🌵', '☁️', '🏃', '💨'],
  hangman: ['🔤', '💡', '❓', '✅', '❌'],
  sudoku: ['🔢', '🧩', '⏱️', '💯'],
};

// ============================================================================
// Rate Limiter
// ============================================================================

interface RateLimitState {
  messages: number[];  // Timestamps of recent messages
  lastMessage: number;
  burstCount: number;
  cooldownUntil: number;
}

export class ChatRateLimiter {
  private config: RateLimitConfig;
  private userStates: Map<string, RateLimitState> = new Map();

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = { ...DEFAULT_RATE_LIMIT, ...config };
  }

  /**
   * Check if user can send a message
   */
  canSend(userId: string): { allowed: boolean; waitMs?: number; reason?: string } {
    const now = Date.now();
    const state = this.getOrCreateState(userId);

    // Check cooldown
    if (state.cooldownUntil > now) {
      return {
        allowed: false,
        waitMs: state.cooldownUntil - now,
        reason: 'cooldown',
      };
    }

    // Clean old messages (older than 1 minute)
    const oneMinuteAgo = now - 60000;
    state.messages = state.messages.filter((t) => t > oneMinuteAgo);

    // Check per-minute limit
    if (state.messages.length >= this.config.messagesPerMinute) {
      const oldestInWindow = state.messages[0];
      const waitMs = oldestInWindow + 60000 - now;
      return {
        allowed: false,
        waitMs,
        reason: 'rate_limit_minute',
      };
    }

    // Check per-second limit (messages in last second)
    const oneSecondAgo = now - 1000;
    const recentMessages = state.messages.filter((t) => t > oneSecondAgo);
    if (recentMessages.length >= this.config.messagesPerSecond) {
      return {
        allowed: false,
        waitMs: 1000 - (now - recentMessages[0]),
        reason: 'rate_limit_second',
      };
    }

    // Check burst limit
    if (state.burstCount >= this.config.burstLimit) {
      state.cooldownUntil = now + this.config.cooldownMs;
      state.burstCount = 0;
      return {
        allowed: false,
        waitMs: this.config.cooldownMs,
        reason: 'burst_limit',
      };
    }

    return { allowed: true };
  }

  /**
   * Record a sent message
   */
  recordMessage(userId: string): void {
    const now = Date.now();
    const state = this.getOrCreateState(userId);
    state.messages.push(now);
    state.lastMessage = now;

    // Reset burst count if more than 2 seconds since last message
    if (now - state.lastMessage > 2000) {
      state.burstCount = 1;
    } else {
      state.burstCount++;
    }
  }

  /**
   * Reset rate limit state for user
   */
  reset(userId: string): void {
    this.userStates.delete(userId);
  }

  private getOrCreateState(userId: string): RateLimitState {
    let state = this.userStates.get(userId);
    if (!state) {
      state = {
        messages: [],
        lastMessage: 0,
        burstCount: 0,
        cooldownUntil: 0,
      };
      this.userStates.set(userId, state);
    }
    return state;
  }
}

// ============================================================================
// Message History
// ============================================================================

export class MessageHistory {
  private messages: Map<string, ChatMessage[]> = new Map();  // roomId -> messages
  private reactions: Map<string, ChatReaction[]> = new Map();  // messageId -> reactions
  private retentionCount: number;

  constructor(retentionCount: number = 500) {
    this.retentionCount = retentionCount;
  }

  /**
   * Add message to history
   */
  addMessage(message: ChatMessage): void {
    const roomMessages = this.messages.get(message.roomId) || [];
    roomMessages.push(message);

    // Trim to retention limit
    if (roomMessages.length > this.retentionCount) {
      const removed = roomMessages.splice(0, roomMessages.length - this.retentionCount);
      // Clean up reactions for removed messages
      for (const msg of removed) {
        this.reactions.delete(msg.id);
      }
    }

    this.messages.set(message.roomId, roomMessages);
  }

  /**
   * Get recent messages for a room
   */
  getMessages(roomId: string, limit: number = 50, before?: number): ChatMessage[] {
    const roomMessages = this.messages.get(roomId) || [];
    
    let filtered = roomMessages;
    if (before !== undefined) {
      filtered = roomMessages.filter((m) => m.timestamp < before);
    }

    return filtered.slice(-limit);
  }

  /**
   * Get a specific message
   */
  getMessage(messageId: string): ChatMessage | undefined {
    for (const messages of this.messages.values()) {
      const msg = messages.find((m) => m.id === messageId);
      if (msg) return msg;
    }
    return undefined;
  }

  /**
   * Delete a message
   */
  deleteMessage(messageId: string): boolean {
    for (const [roomId, messages] of this.messages.entries()) {
      const index = messages.findIndex((m) => m.id === messageId);
      if (index !== -1) {
        messages.splice(index, 1);
        this.reactions.delete(messageId);
        return true;
      }
    }
    return false;
  }

  /**
   * Add reaction to message
   */
  addReaction(reaction: ChatReaction): boolean {
    const message = this.getMessage(reaction.messageId);
    if (!message) return false;

    const messageReactions = this.reactions.get(reaction.messageId) || [];
    
    // Check if user already reacted with this emoji
    const existing = messageReactions.find(
      (r) => r.userId === reaction.userId && r.emoji === reaction.emoji
    );
    if (existing) return false;

    messageReactions.push(reaction);
    this.reactions.set(reaction.messageId, messageReactions);
    return true;
  }

  /**
   * Remove reaction from message
   */
  removeReaction(messageId: string, userId: string, emoji: string): boolean {
    const messageReactions = this.reactions.get(messageId);
    if (!messageReactions) return false;

    const index = messageReactions.findIndex(
      (r) => r.userId === userId && r.emoji === emoji
    );
    if (index === -1) return false;

    messageReactions.splice(index, 1);
    return true;
  }

  /**
   * Get reactions for a message
   */
  getReactions(messageId: string): ChatReaction[] {
    return this.reactions.get(messageId) || [];
  }

  /**
   * Get reaction counts grouped by emoji
   */
  getReactionCounts(messageId: string): Map<string, number> {
    const reactions = this.reactions.get(messageId) || [];
    const counts = new Map<string, number>();
    
    for (const reaction of reactions) {
      counts.set(reaction.emoji, (counts.get(reaction.emoji) || 0) + 1);
    }
    
    return counts;
  }

  /**
   * Clear all history for a room
   */
  clearRoom(roomId: string): void {
    const messages = this.messages.get(roomId) || [];
    for (const msg of messages) {
      this.reactions.delete(msg.id);
    }
    this.messages.delete(roomId);
  }

  /**
   * Get stats for a room
   */
  getStats(roomId: string): ChatStats {
    const messages = this.messages.get(roomId) || [];
    const participants = new Set<string>();
    const emojiCounts = new Map<string, number>();
    let totalReactions = 0;

    const fiveMinutesAgo = Date.now() - 300000;
    let recentMessages = 0;

    for (const msg of messages) {
      participants.add(msg.senderId);
      
      if (msg.timestamp > fiveMinutesAgo) {
        recentMessages++;
      }

      const reactions = this.reactions.get(msg.id) || [];
      totalReactions += reactions.length;
      
      for (const reaction of reactions) {
        emojiCounts.set(reaction.emoji, (emojiCounts.get(reaction.emoji) || 0) + 1);
      }
    }

    // Sort emojis by count
    const topEmojis = Array.from(emojiCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([emoji, count]) => ({ emoji, count }));

    return {
      totalMessages: messages.length,
      totalReactions,
      uniqueParticipants: participants.size,
      messagesPerMinute: recentMessages / 5,
      topEmojis,
    };
  }
}

// ============================================================================
// Chat Manager
// ============================================================================

export class ChatManager {
  private rooms: Map<string, ChatRoom> = new Map();
  private participants: Map<string, Map<string, ChatParticipant>> = new Map();  // roomId -> (userId -> participant)
  private history: MessageHistory;
  private rateLimiter: ChatRateLimiter;
  private eventListeners: Map<string, Set<(event: ChatEvent) => void>> = new Map();  // roomId -> listeners
  private moderationLog: ModerationAction[] = [];
  private messageIdCounter: number = 0;

  constructor(options: {
    historyRetention?: number;
    rateLimitConfig?: Partial<RateLimitConfig>;
  } = {}) {
    this.history = new MessageHistory(options.historyRetention);
    this.rateLimiter = new ChatRateLimiter(options.rateLimitConfig);
  }

  // -------------------------------------------------------------------------
  // Room Management
  // -------------------------------------------------------------------------

  /**
   * Create a new chat room
   */
  createRoom(
    id: string,
    name: string,
    type: ChatRoom['type'],
    settings: Partial<RoomSettings> = {}
  ): ChatRoom {
    if (this.rooms.has(id)) {
      throw new Error(`Room ${id} already exists`);
    }

    const room: ChatRoom = {
      id,
      name,
      type,
      createdAt: Date.now(),
      participants: new Set(),
      moderators: new Set(),
      settings: { ...DEFAULT_ROOM_SETTINGS, ...settings },
    };

    this.rooms.set(id, room);
    this.participants.set(id, new Map());
    this.eventListeners.set(id, new Set());

    return room;
  }

  /**
   * Get or create a game room
   */
  getOrCreateGameRoom(gameId: string, gameName: string): ChatRoom {
    const roomId = `game:${gameId}`;
    if (this.rooms.has(roomId)) {
      return this.rooms.get(roomId)!;
    }

    return this.createRoom(roomId, `${gameName} Chat`, 'game');
  }

  /**
   * Get a room by ID
   */
  getRoom(roomId: string): ChatRoom | undefined {
    return this.rooms.get(roomId);
  }

  /**
   * Delete a room
   */
  deleteRoom(roomId: string): boolean {
    if (!this.rooms.has(roomId)) return false;

    // Notify all participants
    this.broadcastEvent(roomId, {
      type: 'leave',
      data: { reason: 'room_closed' },
      roomId,
      timestamp: Date.now(),
    });

    this.rooms.delete(roomId);
    this.participants.delete(roomId);
    this.history.clearRoom(roomId);
    this.eventListeners.delete(roomId);

    return true;
  }

  // -------------------------------------------------------------------------
  // Participant Management
  // -------------------------------------------------------------------------

  /**
   * Join a room
   */
  join(
    roomId: string,
    userId: string,
    userName: string,
    role: ChatParticipant['role'] = 'viewer'
  ): { success: boolean; error?: string } {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    const roomParticipants = this.participants.get(roomId)!;
    if (roomParticipants.size >= room.settings.maxParticipants) {
      return { success: false, error: 'Room is full' };
    }

    // Check if already in room
    if (roomParticipants.has(userId)) {
      return { success: true };  // Already joined
    }

    const participant: ChatParticipant = {
      id: userId,
      name: userName,
      role,
      joinedAt: Date.now(),
      messageCount: 0,
    };

    roomParticipants.set(userId, participant);
    room.participants.add(userId);

    if (role === 'moderator' || role === 'owner') {
      room.moderators.add(userId);
    }

    // Broadcast join event
    this.broadcastEvent(roomId, {
      type: 'join',
      data: { userId, userName, role },
      roomId,
      timestamp: Date.now(),
    });

    return { success: true };
  }

  /**
   * Leave a room
   */
  leave(roomId: string, userId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    const roomParticipants = this.participants.get(roomId)!;
    const participant = roomParticipants.get(userId);
    if (!participant) return false;

    roomParticipants.delete(userId);
    room.participants.delete(userId);
    room.moderators.delete(userId);

    // Broadcast leave event
    this.broadcastEvent(roomId, {
      type: 'leave',
      data: { userId, userName: participant.name },
      roomId,
      timestamp: Date.now(),
    });

    return true;
  }

  /**
   * Get participant count
   */
  getParticipantCount(roomId: string): number {
    return this.participants.get(roomId)?.size || 0;
  }

  /**
   * Get all participants in a room
   */
  getParticipants(roomId: string): ChatParticipant[] {
    const roomParticipants = this.participants.get(roomId);
    return roomParticipants ? Array.from(roomParticipants.values()) : [];
  }

  // -------------------------------------------------------------------------
  // Messaging
  // -------------------------------------------------------------------------

  /**
   * Send a message
   */
  sendMessage(
    roomId: string,
    senderId: string,
    content: string,
    options: {
      type?: MessageType;
      replyTo?: string;
      metadata?: Record<string, unknown>;
    } = {}
  ): { success: boolean; message?: ChatMessage; error?: string } {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    const roomParticipants = this.participants.get(roomId)!;
    const participant = roomParticipants.get(senderId);
    if (!participant) {
      return { success: false, error: 'Not in room' };
    }

    // Check if muted
    if (participant.mutedUntil && participant.mutedUntil > Date.now()) {
      const remainingMs = participant.mutedUntil - Date.now();
      return { success: false, error: `Muted for ${Math.ceil(remainingMs / 1000)}s` };
    }

    // Check slow mode
    if (room.settings.slowModeSeconds > 0) {
      const slowModeMs = room.settings.slowModeSeconds * 1000;
      const messages = this.history.getMessages(roomId, 1);
      const lastOwnMessage = messages.filter((m) => m.senderId === senderId).pop();
      if (lastOwnMessage && Date.now() - lastOwnMessage.timestamp < slowModeMs) {
        const waitMs = slowModeMs - (Date.now() - lastOwnMessage.timestamp);
        return { success: false, error: `Slow mode: wait ${Math.ceil(waitMs / 1000)}s` };
      }
    }

    // Check rate limit
    const rateCheck = this.rateLimiter.canSend(senderId);
    if (!rateCheck.allowed) {
      return { success: false, error: `Rate limited: ${rateCheck.reason}` };
    }

    // Validate content
    if (!content.trim()) {
      return { success: false, error: 'Empty message' };
    }

    if (content.length > 500) {
      return { success: false, error: 'Message too long (max 500 chars)' };
    }

    // Create message
    const message: ChatMessage = {
      id: this.generateMessageId(),
      type: options.type || 'text',
      senderId,
      senderName: participant.name,
      content: content.trim(),
      timestamp: Date.now(),
      roomId,
      replyTo: options.replyTo,
      metadata: options.metadata,
    };

    // Record in history
    this.history.addMessage(message);
    this.rateLimiter.recordMessage(senderId);
    participant.messageCount++;

    // Broadcast
    this.broadcastEvent(roomId, {
      type: 'message',
      data: message,
      roomId,
      timestamp: message.timestamp,
    });

    return { success: true, message };
  }

  /**
   * Send a system message
   */
  sendSystemMessage(roomId: string, content: string): ChatMessage | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const message: ChatMessage = {
      id: this.generateMessageId(),
      type: 'system',
      senderId: 'system',
      senderName: 'System',
      content,
      timestamp: Date.now(),
      roomId,
    };

    this.history.addMessage(message);

    this.broadcastEvent(roomId, {
      type: 'message',
      data: message,
      roomId,
      timestamp: message.timestamp,
    });

    return message;
  }

  /**
   * Send a whisper (direct message within room)
   */
  sendWhisper(
    roomId: string,
    senderId: string,
    targetId: string,
    content: string
  ): { success: boolean; error?: string } {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    if (!room.settings.allowWhispers) {
      return { success: false, error: 'Whispers disabled in this room' };
    }

    const sender = this.participants.get(roomId)?.get(senderId);
    const target = this.participants.get(roomId)?.get(targetId);
    
    if (!sender || !target) {
      return { success: false, error: 'User not found' };
    }

    // Whispers bypass rate limit but still check mute
    if (sender.mutedUntil && sender.mutedUntil > Date.now()) {
      return { success: false, error: 'You are muted' };
    }

    const message: ChatMessage = {
      id: this.generateMessageId(),
      type: 'whisper',
      senderId,
      senderName: sender.name,
      content,
      timestamp: Date.now(),
      roomId,
      metadata: { targetId, targetName: target.name },
    };

    // Don't add to public history, just emit to sender and target
    // In a real implementation, you'd have per-user listeners
    
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // Reactions
  // -------------------------------------------------------------------------

  /**
   * Add reaction to a message
   */
  addReaction(
    roomId: string,
    messageId: string,
    userId: string,
    emoji: string
  ): { success: boolean; error?: string } {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    if (!room.settings.allowReactions) {
      return { success: false, error: 'Reactions disabled' };
    }

    const participant = this.participants.get(roomId)?.get(userId);
    if (!participant) {
      return { success: false, error: 'Not in room' };
    }

    const reaction: ChatReaction = {
      messageId,
      userId,
      emoji,
      timestamp: Date.now(),
    };

    if (!this.history.addReaction(reaction)) {
      return { success: false, error: 'Already reacted or message not found' };
    }

    this.broadcastEvent(roomId, {
      type: 'reaction_add',
      data: { messageId, userId, userName: participant.name, emoji },
      roomId,
      timestamp: reaction.timestamp,
    });

    return { success: true };
  }

  /**
   * Remove a reaction
   */
  removeReaction(
    roomId: string,
    messageId: string,
    userId: string,
    emoji: string
  ): { success: boolean; error?: string } {
    const participant = this.participants.get(roomId)?.get(userId);
    if (!participant) {
      return { success: false, error: 'Not in room' };
    }

    if (!this.history.removeReaction(messageId, userId, emoji)) {
      return { success: false, error: 'Reaction not found' };
    }

    this.broadcastEvent(roomId, {
      type: 'reaction_remove',
      data: { messageId, userId, emoji },
      roomId,
      timestamp: Date.now(),
    });

    return { success: true };
  }

  // -------------------------------------------------------------------------
  // Moderation
  // -------------------------------------------------------------------------

  /**
   * Mute a user
   */
  muteUser(
    roomId: string,
    targetId: string,
    moderatorId: string,
    durationMs: number,
    reason?: string
  ): { success: boolean; error?: string } {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    if (!room.moderators.has(moderatorId)) {
      return { success: false, error: 'Not a moderator' };
    }

    const target = this.participants.get(roomId)?.get(targetId);
    if (!target) {
      return { success: false, error: 'User not found' };
    }

    if (target.role === 'owner' || target.role === 'moderator') {
      return { success: false, error: 'Cannot mute moderators' };
    }

    target.mutedUntil = Date.now() + durationMs;

    const action: ModerationAction = {
      type: 'mute',
      targetUserId: targetId,
      moderatorId,
      reason,
      duration: durationMs,
      timestamp: Date.now(),
    };
    this.moderationLog.push(action);

    this.broadcastEvent(roomId, {
      type: 'moderation',
      data: { action: 'mute', targetId, duration: durationMs },
      roomId,
      timestamp: Date.now(),
    });

    this.sendSystemMessage(
      roomId,
      `${target.name} has been muted for ${Math.round(durationMs / 1000)}s`
    );

    return { success: true };
  }

  /**
   * Unmute a user
   */
  unmuteUser(
    roomId: string,
    targetId: string,
    moderatorId: string
  ): { success: boolean; error?: string } {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    if (!room.moderators.has(moderatorId)) {
      return { success: false, error: 'Not a moderator' };
    }

    const target = this.participants.get(roomId)?.get(targetId);
    if (!target) {
      return { success: false, error: 'User not found' };
    }

    target.mutedUntil = undefined;

    const action: ModerationAction = {
      type: 'unmute',
      targetUserId: targetId,
      moderatorId,
      timestamp: Date.now(),
    };
    this.moderationLog.push(action);

    return { success: true };
  }

  /**
   * Delete a message
   */
  deleteMessage(
    roomId: string,
    messageId: string,
    moderatorId: string,
    reason?: string
  ): { success: boolean; error?: string } {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    if (!room.moderators.has(moderatorId)) {
      return { success: false, error: 'Not a moderator' };
    }

    if (!this.history.deleteMessage(messageId)) {
      return { success: false, error: 'Message not found' };
    }

    const action: ModerationAction = {
      type: 'delete',
      targetUserId: messageId,  // Using messageId here
      moderatorId,
      reason,
      timestamp: Date.now(),
    };
    this.moderationLog.push(action);

    this.broadcastEvent(roomId, {
      type: 'moderation',
      data: { action: 'delete', messageId },
      roomId,
      timestamp: Date.now(),
    });

    return { success: true };
  }

  /**
   * Kick a user from room
   */
  kickUser(
    roomId: string,
    targetId: string,
    moderatorId: string,
    reason?: string
  ): { success: boolean; error?: string } {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    if (!room.moderators.has(moderatorId)) {
      return { success: false, error: 'Not a moderator' };
    }

    const target = this.participants.get(roomId)?.get(targetId);
    if (!target) {
      return { success: false, error: 'User not found' };
    }

    if (target.role === 'owner') {
      return { success: false, error: 'Cannot kick owner' };
    }

    this.leave(roomId, targetId);

    const action: ModerationAction = {
      type: 'kick',
      targetUserId: targetId,
      moderatorId,
      reason,
      timestamp: Date.now(),
    };
    this.moderationLog.push(action);

    this.sendSystemMessage(roomId, `${target.name} was kicked from the room`);

    return { success: true };
  }

  // -------------------------------------------------------------------------
  // Event System
  // -------------------------------------------------------------------------

  /**
   * Subscribe to room events
   */
  subscribe(roomId: string, listener: (event: ChatEvent) => void): () => void {
    const listeners = this.eventListeners.get(roomId);
    if (!listeners) {
      throw new Error('Room not found');
    }

    listeners.add(listener);

    // Return unsubscribe function
    return () => {
      listeners.delete(listener);
    };
  }

  /**
   * Broadcast event to all room subscribers
   */
  private broadcastEvent(roomId: string, event: ChatEvent): void {
    const listeners = this.eventListeners.get(roomId);
    if (!listeners) return;

    for (const listener of listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('Chat event listener error:', error);
      }
    }
  }

  // -------------------------------------------------------------------------
  // History & Stats
  // -------------------------------------------------------------------------

  /**
   * Get message history
   */
  getHistory(roomId: string, limit?: number, before?: number): ChatMessage[] {
    return this.history.getMessages(roomId, limit, before);
  }

  /**
   * Get room stats
   */
  getRoomStats(roomId: string): ChatStats | null {
    if (!this.rooms.has(roomId)) return null;
    return this.history.getStats(roomId);
  }

  /**
   * Get reactions for a message
   */
  getMessageReactions(messageId: string): Map<string, number> {
    return this.history.getReactionCounts(messageId);
  }

  // -------------------------------------------------------------------------
  // Utilities
  // -------------------------------------------------------------------------

  private generateMessageId(): string {
    return `msg_${Date.now()}_${++this.messageIdCounter}`;
  }

  /**
   * Get quick reactions for a game
   */
  getQuickReactions(gameType?: string): string[] {
    if (gameType && GAME_EMOTES[gameType]) {
      return [...QUICK_REACTIONS, ...GAME_EMOTES[gameType]];
    }
    return [...QUICK_REACTIONS];
  }

  /**
   * Get moderation log for a room
   */
  getModerationLog(limit: number = 50): ModerationAction[] {
    return this.moderationLog.slice(-limit);
  }
}

// ============================================================================
// Protocol Messages
// ============================================================================

export interface ChatProtocolMessage {
  type: 'chat';
  action:
    | 'join'
    | 'leave'
    | 'send'
    | 'react'
    | 'unreact'
    | 'typing'
    | 'history'
    | 'mute'
    | 'kick'
    | 'delete';
  roomId: string;
  payload: unknown;
}

export interface ChatJoinPayload {
  userName: string;
  role?: ChatParticipant['role'];
}

export interface ChatSendPayload {
  content: string;
  replyTo?: string;
  type?: MessageType;
}

export interface ChatReactPayload {
  messageId: string;
  emoji: string;
}

export interface ChatHistoryPayload {
  limit?: number;
  before?: number;
}

export interface ChatMutePayload {
  targetId: string;
  durationMs: number;
  reason?: string;
}

// ============================================================================
// Singleton Export
// ============================================================================

let chatManagerInstance: ChatManager | null = null;

export function getChatManager(): ChatManager {
  if (!chatManagerInstance) {
    chatManagerInstance = new ChatManager();
  }
  return chatManagerInstance;
}

export function resetChatManager(): void {
  chatManagerInstance = null;
}
