/**
 * DinoEngine - AI decision engine for Dino Run game
 * 
 * Strategy:
 * 1. Monitor obstacle distance
 * 2. Jump when obstacle is at optimal distance (not too early, not too late)
 * 3. Handle different obstacle types (ground vs flying)
 * 4. Avoid unnecessary jumps (preserve timing)
 */

import { ParsedState } from '../StateParser.js';

export interface DinoDecision {
  action: 'jump' | 'wait' | 'start' | 'restart' | 'none';
  confidence: number;  // 0-1
  reason: string;
}

export class DinoEngine {
  // Tunable parameters
  private jumpDistanceMin: number;  // Minimum distance to trigger jump
  private jumpDistanceMax: number;  // Maximum distance (too early)
  private batSafeDistance: number;  // Distance to wait for bats
  
  // State tracking
  private lastJumpTime: number = 0;
  private jumpCooldown: number;  // Minimum ms between jumps
  
  constructor(options: {
    jumpDistanceMin?: number;
    jumpDistanceMax?: number;
    batSafeDistance?: number;
    jumpCooldown?: number;
  } = {}) {
    // Tuned for faster reaction - wider jump window
    // The game state can lag, so jump earlier
    this.jumpDistanceMin = options.jumpDistanceMin || 2;
    this.jumpDistanceMax = options.jumpDistanceMax || 10;  // Wider window - jump earlier
    this.batSafeDistance = options.batSafeDistance || 4;
    this.jumpCooldown = options.jumpCooldown || 350;  // Slightly shorter cooldown
  }
  
  /**
   * Make a decision based on current game state
   */
  decide(state: ParsedState): DinoDecision {
    // Handle non-playing states
    if (state.dinoGameState === 'START') {
      return {
        action: 'start',
        confidence: 1.0,
        reason: 'Game not started, press ENTER'
      };
    }
    
    if (state.dinoGameState === 'COUNTDOWN') {
      return {
        action: 'wait',
        confidence: 1.0,
        reason: `Countdown: ${state.countdown}`
      };
    }
    
    if (state.dinoGameState === 'GAME_OVER') {
      return {
        action: 'restart',
        confidence: 1.0,
        reason: 'Game over, press ENTER to restart'
      };
    }
    
    // Playing state - make jump decisions
    if (!state.dino || !state.obstacle) {
      return {
        action: 'none',
        confidence: 0.5,
        reason: 'Insufficient state data'
      };
    }
    
    const { dino, obstacle } = state;
    
    // Already jumping - wait to land
    if (dino.isJumping) {
      return {
        action: 'wait',
        confidence: 0.9,
        reason: `In air: Y=${dino.y}, V=${dino.velocity.toFixed(1)}`
      };
    }
    
    // No obstacle nearby
    if (obstacle.distance > this.jumpDistanceMax || obstacle.type === 'NONE') {
      return {
        action: 'wait',
        confidence: 0.8,
        reason: `Obstacle far: dist=${obstacle.distance}`
      };
    }
    
    // Check jump cooldown
    const now = Date.now();
    if (now - this.lastJumpTime < this.jumpCooldown) {
      return {
        action: 'wait',
        confidence: 0.7,
        reason: 'Jump cooldown active'
      };
    }
    
    // Flying obstacle (BAT) - don't jump, stay low
    if (obstacle.type === 'BAT' && obstacle.y > 0) {
      if (obstacle.distance > this.batSafeDistance) {
        return {
          action: 'wait',
          confidence: 0.9,
          reason: `BAT incoming, stay grounded: dist=${obstacle.distance}`
        };
      }
      // Bat is very close - might need to jump anyway depending on timing
    }
    
    // Ground obstacle in jump range
    if (obstacle.y === 0 && 
        obstacle.distance >= this.jumpDistanceMin && 
        obstacle.distance <= this.jumpDistanceMax) {
      this.lastJumpTime = now;
      return {
        action: 'jump',
        confidence: 0.95,
        reason: `Ground obstacle at dist=${obstacle.distance}, type=${obstacle.type}`
      };
    }
    
    // The game says [JUMP NOW!] - trust it
    if (obstacle.shouldJump && dino.y === 0) {
      this.lastJumpTime = now;
      return {
        action: 'jump',
        confidence: 1.0,
        reason: '[JUMP NOW!] signal from game'
      };
    }
    
    // Obstacle too close but we haven't jumped - emergency
    if (obstacle.distance < this.jumpDistanceMin && obstacle.y === 0) {
      // Might be too late, but try anyway
      this.lastJumpTime = now;
      return {
        action: 'jump',
        confidence: 0.6,
        reason: `EMERGENCY: obstacle at dist=${obstacle.distance}`
      };
    }
    
    return {
      action: 'wait',
      confidence: 0.7,
      reason: `Monitoring: dist=${obstacle.distance}, type=${obstacle.type}`
    };
  }
  
  /**
   * Reset the engine state (for new game)
   */
  reset(): void {
    this.lastJumpTime = 0;
  }
  
  /**
   * Adjust jump timing parameters
   */
  tune(params: {
    jumpDistanceMin?: number;
    jumpDistanceMax?: number;
    batSafeDistance?: number;
    jumpCooldown?: number;
  }): void {
    if (params.jumpDistanceMin !== undefined) this.jumpDistanceMin = params.jumpDistanceMin;
    if (params.jumpDistanceMax !== undefined) this.jumpDistanceMax = params.jumpDistanceMax;
    if (params.batSafeDistance !== undefined) this.batSafeDistance = params.batSafeDistance;
    if (params.jumpCooldown !== undefined) this.jumpCooldown = params.jumpCooldown;
  }
}

// Singleton with default tuning
export const dinoEngine = new DinoEngine();
