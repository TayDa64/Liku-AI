/**
 * @fileoverview AnalyticsEngine - Performance metrics and skill analysis
 * 
 * Provides comprehensive analytics for AI agent performance:
 * - Per-agent win/loss/draw statistics
 * - Move efficiency and decision time analysis
 * - Skill progression over time (Elo-like rating)
 * - Human vs AI comparison metrics
 * - Statistical aggregations and trends
 */

import type { RecordedSession, RecordedAction, RecordedFrame } from './recorder.js';

/**
 * Agent performance statistics
 */
export interface AgentStats {
  agentId: string;
  agentType: 'human' | 'ai' | 'unknown';
  
  // Game outcomes
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  
  // Move statistics
  totalMoves: number;
  averageMovesPerGame: number;
  averageMoveTime: number; // ms
  fastestMove: number; // ms
  slowestMove: number; // ms
  
  // Skill metrics
  rating: number; // Elo-like rating
  ratingHistory: RatingPoint[];
  peakRating: number;
  
  // Game-specific metrics (extensible)
  gameMetrics: Record<string, number>;
}

/**
 * Rating point for history tracking
 */
export interface RatingPoint {
  timestamp: number;
  rating: number;
  gameId: string;
  opponent: string;
  result: 'win' | 'loss' | 'draw';
}

/**
 * Session analysis result
 */
export interface SessionAnalysis {
  sessionId: string;
  gameType: string;
  duration: number; // ms
  totalMoves: number;
  movesPerMinute: number;
  players: string[];
  winner: string | null;
  
  // Move analysis
  moveTimings: MoveTimingAnalysis;
  moveDistribution: Record<string, number>;
  
  // Quality metrics
  blunders: number; // Obvious mistakes
  brilliantMoves: number; // Optimal plays
  averageMoveQuality: number; // 0-1 scale
  
  // Game progression
  turnAdvantage: TurnAdvantage[];
}

/**
 * Move timing analysis
 */
export interface MoveTimingAnalysis {
  averageTime: number;
  medianTime: number;
  standardDeviation: number;
  timesByPlayer: Record<string, number>;
  timesByPhase: {
    opening: number;
    midgame: number;
    endgame: number;
  };
}

/**
 * Turn-by-turn advantage tracking
 */
export interface TurnAdvantage {
  turn: number;
  player: string;
  advantage: number; // Positive = X winning, Negative = O winning
  timestamp: number;
}

/**
 * Comparison result between agents
 */
export interface AgentComparison {
  agent1: string;
  agent2: string;
  
  // Head-to-head
  headToHead: {
    agent1Wins: number;
    agent2Wins: number;
    draws: number;
    totalGames: number;
  };
  
  // Statistical comparison
  ratingDifference: number;
  winRateDifference: number;
  avgMoveTimeDifference: number;
  
  // Strengths/weaknesses
  agent1Strengths: string[];
  agent2Strengths: string[];
  
  // Trend analysis
  recentTrend: 'agent1_improving' | 'agent2_improving' | 'stable';
}

/**
 * Aggregate statistics across all agents
 */
export interface GlobalStats {
  totalGames: number;
  totalMoves: number;
  averageGameDuration: number;
  averageMovesPerGame: number;
  
  // Agent type breakdown
  humanGames: number;
  aiGames: number;
  aiVsAiGames: number;
  humanVsAiGames: number;
  humanVsHumanGames: number;
  
  // Win rates by type
  aiWinRateVsHuman: number;
  humanWinRateVsAi: number;
  
  // Time distribution
  gamesByHour: Record<number, number>;
  gamesByDay: Record<string, number>;
  
  // Top performers
  topAgentsByRating: { agentId: string; rating: number }[];
  topAgentsByWinRate: { agentId: string; winRate: number }[];
}

/**
 * Analytics configuration
 */
export interface AnalyticsConfig {
  /** Initial rating for new agents (default: 1200) */
  initialRating?: number;
  /** K-factor for rating calculation (default: 32) */
  kFactor?: number;
  /** Minimum games for ranking inclusion (default: 5) */
  minGamesForRanking?: number;
  /** Rating history limit (default: 100) */
  ratingHistoryLimit?: number;
  /** Move time threshold for blunder detection in ms (default: 100) */
  quickMoveThreshold?: number;
}

/**
 * AnalyticsEngine class for performance analysis
 */
export class AnalyticsEngine {
  private config: Required<AnalyticsConfig>;
  private agentStats: Map<string, AgentStats> = new Map();
  private sessions: RecordedSession[] = [];
  private headToHead: Map<string, Map<string, { wins: number; losses: number; draws: number }>> = new Map();

  constructor(config: AnalyticsConfig = {}) {
    this.config = {
      initialRating: config.initialRating ?? 1200,
      kFactor: config.kFactor ?? 32,
      minGamesForRanking: config.minGamesForRanking ?? 5,
      ratingHistoryLimit: config.ratingHistoryLimit ?? 100,
      quickMoveThreshold: config.quickMoveThreshold ?? 100
    };
  }

  /**
   * Extract all actions from a session (actions are embedded in frames)
   */
  private extractActions(session: RecordedSession): RecordedAction[] {
    return session.frames
      .filter((frame): frame is RecordedFrame & { action: RecordedAction } => frame.action !== null)
      .map(frame => frame.action);
  }

  /**
   * Get session duration
   */
  private getSessionDuration(session: RecordedSession): number {
    return (session.endedAt ?? Date.now()) - session.startedAt;
  }

  /**
   * Process a recorded session and update analytics
   */
  processSession(session: RecordedSession): SessionAnalysis {
    this.sessions.push(session);

    // Extract players from metadata
    const players = this.extractPlayers(session);
    const winner = this.extractWinner(session);

    // Update agent stats
    for (const player of players) {
      this.updateAgentStats(player, session, winner);
    }

    // Update head-to-head if 2 players
    if (players.length === 2) {
      this.updateHeadToHead(players[0], players[1], winner);
    }

    // Generate session analysis
    return this.analyzeSession(session);
  }

  /**
   * Get statistics for a specific agent
   */
  getAgentStats(agentId: string): AgentStats | null {
    return this.agentStats.get(agentId) ?? null;
  }

  /**
   * Get or create agent stats
   */
  private getOrCreateAgentStats(agentId: string): AgentStats {
    let stats = this.agentStats.get(agentId);
    if (!stats) {
      stats = {
        agentId,
        agentType: this.inferAgentType(agentId),
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        winRate: 0,
        totalMoves: 0,
        averageMovesPerGame: 0,
        averageMoveTime: 0,
        fastestMove: Infinity,
        slowestMove: 0,
        rating: this.config.initialRating,
        ratingHistory: [],
        peakRating: this.config.initialRating,
        gameMetrics: {}
      };
      this.agentStats.set(agentId, stats);
    }
    return stats;
  }

  /**
   * Compare two agents
   */
  compareAgents(agent1Id: string, agent2Id: string): AgentComparison | null {
    const stats1 = this.agentStats.get(agent1Id);
    const stats2 = this.agentStats.get(agent2Id);

    if (!stats1 || !stats2) {
      return null;
    }

    // Get head-to-head
    const h2h = this.getHeadToHead(agent1Id, agent2Id);

    // Calculate strengths
    const agent1Strengths: string[] = [];
    const agent2Strengths: string[] = [];

    if (stats1.averageMoveTime < stats2.averageMoveTime) {
      agent1Strengths.push('faster_decisions');
    } else {
      agent2Strengths.push('faster_decisions');
    }

    if (stats1.winRate > stats2.winRate + 0.1) {
      agent1Strengths.push('higher_win_rate');
    } else if (stats2.winRate > stats1.winRate + 0.1) {
      agent2Strengths.push('higher_win_rate');
    }

    if (stats1.rating > stats2.rating + 50) {
      agent1Strengths.push('higher_skill_rating');
    } else if (stats2.rating > stats1.rating + 50) {
      agent2Strengths.push('higher_skill_rating');
    }

    // Determine trend from recent rating history
    const trend = this.determineTrend(stats1, stats2);

    return {
      agent1: agent1Id,
      agent2: agent2Id,
      headToHead: {
        agent1Wins: h2h.wins,
        agent2Wins: h2h.losses,
        draws: h2h.draws,
        totalGames: h2h.wins + h2h.losses + h2h.draws
      },
      ratingDifference: stats1.rating - stats2.rating,
      winRateDifference: stats1.winRate - stats2.winRate,
      avgMoveTimeDifference: stats1.averageMoveTime - stats2.averageMoveTime,
      agent1Strengths,
      agent2Strengths,
      recentTrend: trend
    };
  }

  /**
   * Get global statistics
   */
  getGlobalStats(): GlobalStats {
    const stats: GlobalStats = {
      totalGames: this.sessions.length,
      totalMoves: 0,
      averageGameDuration: 0,
      averageMovesPerGame: 0,
      humanGames: 0,
      aiGames: 0,
      aiVsAiGames: 0,
      humanVsAiGames: 0,
      humanVsHumanGames: 0,
      aiWinRateVsHuman: 0,
      humanWinRateVsAi: 0,
      gamesByHour: {},
      gamesByDay: {},
      topAgentsByRating: [],
      topAgentsByWinRate: []
    };

    let totalDuration = 0;
    let aiWinsVsHuman = 0;
    let aiGamesVsHuman = 0;

    for (const session of this.sessions) {
      const duration = this.getSessionDuration(session);
      totalDuration += duration;
      const actions = this.extractActions(session);
      stats.totalMoves += actions.length;

      // Categorize game type
      const players = this.extractPlayers(session);
      const types = players.map(p => this.inferAgentType(p));
      const aiCount = types.filter(t => t === 'ai').length;
      const humanCount = types.filter(t => t === 'human').length;

      if (aiCount === 2) stats.aiVsAiGames++;
      else if (humanCount === 2) stats.humanVsHumanGames++;
      else if (aiCount === 1 && humanCount === 1) {
        stats.humanVsAiGames++;
        const winner = this.extractWinner(session);
        if (winner) {
          const winnerType = this.inferAgentType(winner);
          if (winnerType === 'ai') aiWinsVsHuman++;
        }
        aiGamesVsHuman++;
      }

      if (aiCount > 0) stats.aiGames++;
      if (humanCount > 0) stats.humanGames++;

      // Time distribution
      const date = new Date(session.startedAt);
      const hour = date.getHours();
      const day = date.toISOString().split('T')[0];
      stats.gamesByHour[hour] = (stats.gamesByHour[hour] ?? 0) + 1;
      stats.gamesByDay[day] = (stats.gamesByDay[day] ?? 0) + 1;
    }

    // Calculate averages
    if (this.sessions.length > 0) {
      stats.averageGameDuration = totalDuration / this.sessions.length;
      stats.averageMovesPerGame = stats.totalMoves / this.sessions.length;
    }

    // Win rates
    if (aiGamesVsHuman > 0) {
      stats.aiWinRateVsHuman = aiWinsVsHuman / aiGamesVsHuman;
      stats.humanWinRateVsAi = 1 - stats.aiWinRateVsHuman;
    }

    // Top performers
    const rankedAgents = Array.from(this.agentStats.values())
      .filter(a => a.gamesPlayed >= this.config.minGamesForRanking);

    stats.topAgentsByRating = rankedAgents
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 10)
      .map(a => ({ agentId: a.agentId, rating: a.rating }));

    stats.topAgentsByWinRate = rankedAgents
      .sort((a, b) => b.winRate - a.winRate)
      .slice(0, 10)
      .map(a => ({ agentId: a.agentId, winRate: a.winRate }));

    return stats;
  }

  /**
   * Calculate skill rating change using Elo system
   */
  calculateRatingChange(playerRating: number, opponentRating: number, result: 'win' | 'loss' | 'draw'): number {
    const expectedScore = 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
    const actualScore = result === 'win' ? 1 : result === 'draw' ? 0.5 : 0;
    return Math.round(this.config.kFactor * (actualScore - expectedScore));
  }

  /**
   * Get rating progression for an agent
   */
  getRatingProgression(agentId: string): RatingPoint[] {
    const stats = this.agentStats.get(agentId);
    return stats?.ratingHistory ?? [];
  }

  /**
   * Analyze session in detail
   */
  analyzeSession(session: RecordedSession): SessionAnalysis {
    const duration = this.getSessionDuration(session);
    const players = this.extractPlayers(session);
    const winner = this.extractWinner(session);
    const actions = this.extractActions(session);

    // Analyze move timings
    const moveTimings = this.analyzeMoveTimings(session);

    // Count move types
    const moveDistribution: Record<string, number> = {};
    for (const action of actions) {
      const moveType = action.action;
      moveDistribution[moveType] = (moveDistribution[moveType] ?? 0) + 1;
    }

    // Analyze move quality (simplified)
    const { blunders, brilliantMoves, averageQuality } = this.analyzeMoveQuality(session);

    // Calculate turn advantage progression
    const turnAdvantage = this.calculateTurnAdvantage(session);

    return {
      sessionId: session.sessionId,
      gameType: session.gameType,
      duration,
      totalMoves: actions.length,
      movesPerMinute: duration > 0 ? (actions.length / (duration / 60000)) : 0,
      players,
      winner,
      moveTimings,
      moveDistribution,
      blunders,
      brilliantMoves,
      averageMoveQuality: averageQuality,
      turnAdvantage
    };
  }

  /**
   * Analyze move timings
   */
  private analyzeMoveTimings(session: RecordedSession): MoveTimingAnalysis {
    const framesWithActions = session.frames.filter(f => f.action !== null);
    if (framesWithActions.length < 2) {
      return {
        averageTime: 0,
        medianTime: 0,
        standardDeviation: 0,
        timesByPlayer: {},
        timesByPhase: { opening: 0, midgame: 0, endgame: 0 }
      };
    }

    // Use decision time from actions
    const timings = framesWithActions.map(f => f.action!.decisionTimeMs);
    const timesByPlayer: Record<string, number[]> = {};

    for (const frame of framesWithActions) {
      const player = frame.action!.agentId;
      if (!timesByPlayer[player]) {
        timesByPlayer[player] = [];
      }
      timesByPlayer[player].push(frame.action!.decisionTimeMs);
    }

    // Sort for median
    const sortedTimings = [...timings].sort((a, b) => a - b);
    const medianTime = sortedTimings[Math.floor(sortedTimings.length / 2)];
    const averageTime = timings.reduce((a, b) => a + b, 0) / timings.length;

    // Standard deviation
    const variance = timings.reduce((sum, t) => sum + Math.pow(t - averageTime, 2), 0) / timings.length;
    const standardDeviation = Math.sqrt(variance);

    // Average by player
    const avgByPlayer: Record<string, number> = {};
    for (const [player, times] of Object.entries(timesByPlayer)) {
      avgByPlayer[player] = times.reduce((a, b) => a + b, 0) / times.length;
    }

    // Time by phase (split into thirds)
    const third = Math.floor(timings.length / 3);
    const opening = timings.slice(0, third);
    const midgame = timings.slice(third, third * 2);
    const endgame = timings.slice(third * 2);

    const avgPhase = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

    return {
      averageTime,
      medianTime,
      standardDeviation,
      timesByPlayer: avgByPlayer,
      timesByPhase: {
        opening: avgPhase(opening),
        midgame: avgPhase(midgame),
        endgame: avgPhase(endgame)
      }
    };
  }

  /**
   * Analyze move quality (simplified heuristic)
   */
  private analyzeMoveQuality(session: RecordedSession): { blunders: number; brilliantMoves: number; averageQuality: number } {
    let blunders = 0;
    let brilliantMoves = 0;
    let totalQuality = 0;

    for (const frame of session.frames) {
      // Use reward as quality indicator
      if (frame.reward < -0.5) blunders++;
      else if (frame.reward > 0.8) brilliantMoves++;
      totalQuality += Math.max(0, Math.min(1, (frame.reward + 1) / 2));
    }

    return {
      blunders,
      brilliantMoves,
      averageQuality: session.frames.length > 0 ? totalQuality / session.frames.length : 0.5
    };
  }

  /**
   * Calculate turn-by-turn advantage
   */
  private calculateTurnAdvantage(session: RecordedSession): TurnAdvantage[] {
    const advantages: TurnAdvantage[] = [];
    let runningAdvantage = 0;

    const framesWithActions = session.frames.filter(f => f.action !== null);
    for (let i = 0; i < framesWithActions.length; i++) {
      const frame = framesWithActions[i];
      const reward = frame.reward ?? 0;

      // Positive reward = advantage for current player
      runningAdvantage += reward;

      advantages.push({
        turn: i + 1,
        player: frame.action!.agentId,
        advantage: runningAdvantage,
        timestamp: frame.timestamp
      });
    }

    return advantages;
  }

  /**
   * Update agent stats from session
   */
  private updateAgentStats(agentId: string, session: RecordedSession, winner: string | null): void {
    const stats = this.getOrCreateAgentStats(agentId);
    stats.gamesPlayed++;

    // Determine outcome
    if (winner === null) {
      stats.draws++;
    } else if (winner === agentId) {
      stats.wins++;
    } else {
      stats.losses++;
    }

    stats.winRate = stats.gamesPlayed > 0 ? stats.wins / stats.gamesPlayed : 0;

    // Count moves and timings
    const playerFrames = session.frames.filter(f => f.action?.agentId === agentId);
    stats.totalMoves += playerFrames.length;
    stats.averageMovesPerGame = stats.gamesPlayed > 0 ? stats.totalMoves / stats.gamesPlayed : 0;

    // Update move timings
    let totalMoveTime = 0;
    for (const frame of playerFrames) {
      if (frame.action) {
        const moveTime = frame.action.decisionTimeMs;
        totalMoveTime += moveTime;
        stats.fastestMove = Math.min(stats.fastestMove, moveTime);
        stats.slowestMove = Math.max(stats.slowestMove, moveTime);
      }
    }

    if (playerFrames.length > 0) {
      stats.averageMoveTime = (stats.averageMoveTime * (stats.gamesPlayed - 1) + totalMoveTime / playerFrames.length) / stats.gamesPlayed;
    }

    // Update rating
    const players = this.extractPlayers(session);
    const opponent = players.find(p => p !== agentId);
    if (opponent) {
      const opponentStats = this.getOrCreateAgentStats(opponent);
      const result: 'win' | 'loss' | 'draw' = winner === null ? 'draw' : winner === agentId ? 'win' : 'loss';
      const ratingChange = this.calculateRatingChange(stats.rating, opponentStats.rating, result);
      stats.rating += ratingChange;

      // Update rating history
      stats.ratingHistory.push({
        timestamp: session.endedAt ?? Date.now(),
        rating: stats.rating,
        gameId: session.sessionId,
        opponent,
        result
      });

      // Trim history
      if (stats.ratingHistory.length > this.config.ratingHistoryLimit) {
        stats.ratingHistory = stats.ratingHistory.slice(-this.config.ratingHistoryLimit);
      }

      // Update peak
      stats.peakRating = Math.max(stats.peakRating, stats.rating);
    }
  }

  /**
   * Update head-to-head records
   */
  private updateHeadToHead(agent1: string, agent2: string, winner: string | null): void {
    // Ensure agent1 < agent2 for consistent key ordering
    const [first, second] = agent1 < agent2 ? [agent1, agent2] : [agent2, agent1];

    if (!this.headToHead.has(first)) {
      this.headToHead.set(first, new Map());
    }

    const record = this.headToHead.get(first)!.get(second) ?? { wins: 0, losses: 0, draws: 0 };

    if (winner === null) {
      record.draws++;
    } else if (winner === first) {
      record.wins++;
    } else {
      record.losses++;
    }

    this.headToHead.get(first)!.set(second, record);
  }

  /**
   * Get head-to-head record
   */
  private getHeadToHead(agent1: string, agent2: string): { wins: number; losses: number; draws: number } {
    const [first, second] = agent1 < agent2 ? [agent1, agent2] : [agent2, agent1];
    const record = this.headToHead.get(first)?.get(second) ?? { wins: 0, losses: 0, draws: 0 };

    // If agent1 is not first, swap wins/losses
    if (agent1 > agent2) {
      return { wins: record.losses, losses: record.wins, draws: record.draws };
    }
    return record;
  }

  /**
   * Determine recent trend between two agents
   */
  private determineTrend(stats1: AgentStats, stats2: AgentStats): 'agent1_improving' | 'agent2_improving' | 'stable' {
    const recentGames = 5;

    const recent1 = stats1.ratingHistory.slice(-recentGames);
    const recent2 = stats2.ratingHistory.slice(-recentGames);

    if (recent1.length < 2 || recent2.length < 2) {
      return 'stable';
    }

    const trend1 = recent1[recent1.length - 1].rating - recent1[0].rating;
    const trend2 = recent2[recent2.length - 1].rating - recent2[0].rating;

    const threshold = 20; // Minimum rating change to consider significant

    if (trend1 - trend2 > threshold) {
      return 'agent1_improving';
    } else if (trend2 - trend1 > threshold) {
      return 'agent2_improving';
    }

    return 'stable';
  }

  /**
   * Extract players from session
   */
  private extractPlayers(session: RecordedSession): string[] {
    const players = new Set<string>();

    // From agents array
    for (const agent of session.agents) {
      players.add(agent.id);
    }

    // From actions in frames
    for (const frame of session.frames) {
      if (frame.action?.agentId) {
        players.add(frame.action.agentId);
      }
    }

    return Array.from(players);
  }

  /**
   * Extract winner from session
   */
  private extractWinner(session: RecordedSession): string | null {
    // From outcome
    if (session.outcome?.winnerId) {
      return session.outcome.winnerId;
    }

    // From final frame state
    const lastFrame = session.frames[session.frames.length - 1];
    if (lastFrame?.state?.features?.winner !== undefined) {
      // Winner might be encoded in features
      const winner = lastFrame.state.features.winner;
      if (typeof winner === 'number' && session.agents[winner]) {
        return session.agents[winner].id;
      }
    }

    return null;
  }

  /**
   * Infer agent type from ID
   */
  private inferAgentType(agentId: string): 'human' | 'ai' | 'unknown' {
    const lowerid = agentId.toLowerCase();
    if (lowerid.includes('ai') || lowerid.includes('bot') || lowerid.includes('minimax')) {
      return 'ai';
    }
    if (lowerid.includes('human') || lowerid.includes('player')) {
      return 'human';
    }
    return 'unknown';
  }

  /**
   * Export all analytics data
   */
  exportData(): object {
    return {
      globalStats: this.getGlobalStats(),
      agentStats: Object.fromEntries(this.agentStats),
      headToHead: this.serializeHeadToHead(),
      sessionCount: this.sessions.length
    };
  }

  /**
   * Import analytics data
   */
  importData(data: { agentStats?: Record<string, AgentStats>; sessions?: RecordedSession[] }): void {
    if (data.agentStats) {
      for (const [id, stats] of Object.entries(data.agentStats)) {
        this.agentStats.set(id, stats);
      }
    }

    if (data.sessions) {
      for (const session of data.sessions) {
        this.processSession(session);
      }
    }
  }

  /**
   * Serialize head-to-head for export
   */
  private serializeHeadToHead(): Record<string, Record<string, { wins: number; losses: number; draws: number }>> {
    const result: Record<string, Record<string, { wins: number; losses: number; draws: number }>> = {};

    for (const [agent1, opponents] of this.headToHead) {
      result[agent1] = Object.fromEntries(opponents);
    }

    return result;
  }

  /**
   * Reset all analytics
   */
  reset(): void {
    this.agentStats.clear();
    this.sessions = [];
    this.headToHead.clear();
  }

  /**
   * Get session count
   */
  get sessionCount(): number {
    return this.sessions.length;
  }

  /**
   * Get agent count
   */
  get agentCount(): number {
    return this.agentStats.size;
  }
}

export default AnalyticsEngine;
