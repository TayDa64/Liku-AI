/**
 * AutoPlayer - Main controller for automatic game playing
 * 
 * Runs a fast polling loop that:
 * 1. Reads game state from file
 * 2. Passes to appropriate game engine
 * 3. Sends keys based on decisions
 * 
 * Target: < 50ms loop time for real-time gameplay
 */

import { StateParser, ParsedState } from './StateParser.js';
import { KeySender, GameKey } from './KeySender.js';
import { DinoEngine, DinoDecision } from './games/DinoEngine.js';

export type GameType = 'dino' | 'snake' | 'tictactoe' | 'auto';

export interface AutoPlayerStats {
  loops: number;
  keySends: number;
  avgLoopTime: number;
  maxLoopTime: number;
  decisions: Record<string, number>;
  startTime: number;
  gameScore?: number;
}

export interface AutoPlayerOptions {
  game: GameType;
  pollInterval?: number;  // ms between state reads
  verbose?: boolean;
  dryRun?: boolean;  // Don't send keys, just log decisions
  maxLoops?: number;  // Stop after N loops (0 = infinite)
}

export class AutoPlayer {
  private parser: StateParser;
  private keySender: KeySender;
  private dinoEngine: DinoEngine;
  
  private options: Required<AutoPlayerOptions>;
  private running: boolean = false;
  private stats: AutoPlayerStats;
  
  constructor(options: AutoPlayerOptions) {
    this.options = {
      game: options.game,
      pollInterval: options.pollInterval || 30,
      verbose: options.verbose || false,
      dryRun: options.dryRun || false,
      maxLoops: options.maxLoops || 0
    };
    
    this.parser = new StateParser();
    this.keySender = new KeySender({ minInterval: 30 });
    this.dinoEngine = new DinoEngine();
    
    this.stats = this.initStats();
  }
  
  private initStats(): AutoPlayerStats {
    return {
      loops: 0,
      keySends: 0,
      avgLoopTime: 0,
      maxLoopTime: 0,
      decisions: {},
      startTime: Date.now()
    };
  }
  
  /**
   * Start the auto-player loop
   */
  async start(): Promise<AutoPlayerStats> {
    this.running = true;
    this.stats = this.initStats();
    
    this.log('🎮 AutoPlayer started');
    this.log(`   Game: ${this.options.game}`);
    this.log(`   Poll interval: ${this.options.pollInterval}ms`);
    this.log(`   Dry run: ${this.options.dryRun}`);
    
    // CRITICAL: Validate game is running BEFORE entering loop
    const initialState = this.parser.parse(true);
    if (!initialState) {
      this.log('\n❌ Cannot read state file - is LikuBuddy running?');
      this.log('   Start the game in a SEPARATE terminal: npm start');
      return this.stats;
    }
    
    if (!initialState.pidValid) {
      this.log('\n❌ Game process not running (stale state file)');
      this.log(`   PID ${initialState.pid} is no longer active`);
      this.log('   Please start LikuBuddy in a SEPARATE terminal: npm start');
      return this.stats;
    }
    
    // Set target PID for precise window targeting
    if (initialState.pid !== null) {
      this.keySender.setTargetPid(initialState.pid);
      this.log(`   Target PID: ${initialState.pid}`);
    }
    this.log(`   Screen: ${initialState.screen}`);
    this.log('');
    
    let loopTimes: number[] = [];
    let consecutiveInvalidReads = 0;
    const maxInvalidReads = 10;  // Exit after 10 consecutive invalid reads
    
    while (this.running) {
      const loopStart = Date.now();
      
      // 1. Read state
      const state = this.parser.parse(true);  // Force refresh
      
      // Handle case where state file couldn't be parsed (mid-write race condition)
      if (!state || !state.pid) {
        consecutiveInvalidReads++;
        if (consecutiveInvalidReads >= maxInvalidReads) {
          this.log('\n❌ Cannot read state file - game may have exited');
          break;
        }
        // Skip this iteration, try again next loop
        await this.sleep(this.options.pollInterval);
        continue;
      }
      
      consecutiveInvalidReads = 0;  // Reset counter on successful read
      
      // Check if PID is still running
      if (!state.pidValid) {
        this.log('\n❌ Game process exited');
        this.log(`   PID ${state.pid} is no longer active`);
        break;
      }
      
      // Update KeySender with target PID (in case it changed)
      if (state.pid) {
        this.keySender.setTargetPid(state.pid);
      }
      
      // 2. Detect game type if auto
      const gameType = this.options.game === 'auto' 
        ? this.detectGame(state) 
        : this.options.game;
      
      // 3. Get decision from appropriate engine
      const decision = this.getDecision(gameType, state);
      
      // 4. Execute decision
      if (decision) {
        await this.executeDecision(decision, gameType);
      }
      
      // 5. Extract score if available
      this.updateScore(state);
      
      // Stats tracking
      this.stats.loops++;
      const loopTime = Date.now() - loopStart;
      loopTimes.push(loopTime);
      if (loopTimes.length > 100) loopTimes.shift();
      
      this.stats.avgLoopTime = loopTimes.reduce((a, b) => a + b, 0) / loopTimes.length;
      this.stats.maxLoopTime = Math.max(this.stats.maxLoopTime, loopTime);
      
      // Check stop conditions
      if (this.options.maxLoops > 0 && this.stats.loops >= this.options.maxLoops) {
        this.log(`\n🛑 Max loops (${this.options.maxLoops}) reached`);
        break;
      }
      
      // Wait for next poll
      const elapsed = Date.now() - loopStart;
      const waitTime = Math.max(0, this.options.pollInterval - elapsed);
      if (waitTime > 0) {
        await this.sleep(waitTime);
      }
    }
    
    this.log('\n📊 Final Stats:');
    this.log(`   Total loops: ${this.stats.loops}`);
    this.log(`   Keys sent: ${this.stats.keySends}`);
    this.log(`   Avg loop time: ${this.stats.avgLoopTime.toFixed(1)}ms`);
    this.log(`   Max loop time: ${this.stats.maxLoopTime}ms`);
    this.log(`   Runtime: ${((Date.now() - this.stats.startTime) / 1000).toFixed(1)}s`);
    if (this.stats.gameScore !== undefined) {
      this.log(`   Final score: ${this.stats.gameScore}`);
    }
    
    return this.stats;
  }
  
  /**
   * Stop the auto-player
   */
  stop(): void {
    this.running = false;
    this.log('\n⏹️  AutoPlayer stopping...');
  }
  
  /**
   * Detect which game is currently active
   */
  private detectGame(state: ParsedState): GameType {
    const screen = state.screen.toLowerCase();
    if (screen.includes('dino')) return 'dino';
    if (screen.includes('snake')) return 'snake';
    if (screen.includes('tic-tac-toe')) return 'tictactoe';
    return 'auto';
  }
  
  /**
   * Get decision from appropriate engine
   */
  private getDecision(gameType: GameType, state: ParsedState): DinoDecision | null {
    switch (gameType) {
      case 'dino':
        return this.dinoEngine.decide(state);
      case 'snake':
        // TODO: Implement SnakeEngine
        return null;
      case 'tictactoe':
        // TODO: Implement TicTacToeEngine
        return null;
      default:
        return null;
    }
  }
  
  /**
   * Execute a decision by sending keys
   */
  private async executeDecision(decision: DinoDecision, gameType: GameType): Promise<void> {
    // Track decision types
    this.stats.decisions[decision.action] = (this.stats.decisions[decision.action] || 0) + 1;
    
    // Map decision to key
    let key: GameKey | null = null;
    
    switch (decision.action) {
      case 'jump':
        key = 'space';
        break;
      case 'start':
      case 'restart':
        key = 'enter';
        break;
      case 'wait':
      case 'none':
        // No key needed
        break;
    }
    
    if (key) {
      if (this.options.verbose) {
        this.log(`🎯 ${decision.action.toUpperCase()} (${decision.reason}) -> ${key}`);
      }
      
      if (!this.options.dryRun) {
        const success = await this.keySender.send(key);
        if (success) {
          this.stats.keySends++;
        }
      } else {
        this.stats.keySends++;  // Count in dry run too
      }
    } else if (this.options.verbose && decision.action !== 'wait') {
      this.log(`⏳ ${decision.action}: ${decision.reason}`);
    }
  }
  
  /**
   * Update score from state
   */
  private updateScore(state: ParsedState): void {
    const scoreMatch = state.status?.match(/Score:\s*(\d+)/);
    if (scoreMatch) {
      this.stats.gameScore = parseInt(scoreMatch[1], 10);
    }
  }
  
  private log(message: string): void {
    console.log(message);
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
