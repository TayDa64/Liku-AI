/**
 * @fileoverview Training Module - AI Training Data & Analytics
 * 
 * Phase 4 of the WebSocket AI Agent Communication system.
 * Provides comprehensive training data collection, analysis, and experimentation.
 * 
 * Components:
 * - SessionRecorder: Record complete game sessions with state/action/reward tracking
 * - DataExporter: Export to JSON, CSV, TFRecord for ML training pipelines
 * - ReplayEngine: Playback recorded sessions with seek/pause/speed controls
 * - AnalyticsEngine: Per-agent performance metrics, Elo ratings, skill progression
 * - ABTestFramework: Controlled experiments with statistical significance testing
 * 
 * @example
 * ```typescript
 * import { 
 *   SessionRecorder, 
 *   DataExporter, 
 *   ReplayEngine, 
 *   AnalyticsEngine, 
 *   ABTestFramework 
 * } from './training/index.js';
 * 
 * // Record a game session
 * const recorder = new SessionRecorder();
 * const session = recorder.startSession('tictactoe', { players: ['ai_1', 'ai_2'] });
 * recorder.recordFrame(session.sessionId, gameState);
 * recorder.recordAction(session.sessionId, { agentId: 'ai_1', action: 'move', data: { cell: 4 } });
 * const completed = recorder.stopSession(session.sessionId);
 * 
 * // Export for training
 * const exporter = new DataExporter();
 * const tfrecord = exporter.exportTFRecord([completed]);
 * fs.writeFileSync('training_data.tfrecord', tfrecord);
 * 
 * // Replay session
 * const replay = new ReplayEngine({ speed: 2, loop: false });
 * replay.load(completed);
 * replay.on('frame', (data) => broadcastToSpectators(data));
 * replay.play();
 * 
 * // Analyze performance
 * const analytics = new AnalyticsEngine();
 * analytics.processSession(completed);
 * const stats = analytics.getAgentStats('ai_1');
 * const comparison = analytics.compareAgents('ai_1', 'ai_2');
 * 
 * // Run A/B test
 * const abtest = new ABTestFramework();
 * const experiment = abtest.createExperiment({
 *   id: 'minimax_depth',
 *   name: 'Minimax Depth Comparison',
 *   variants: [
 *     { id: 'shallow', name: 'Depth 3', weight: 1, config: { depth: 3 } },
 *     { id: 'deep', name: 'Depth 6', weight: 1, config: { depth: 6 } }
 *   ],
 *   metrics: ['win_rate', 'avg_move_time'],
 *   minSampleSize: 30,
 *   confidenceLevel: 0.95
 * });
 * abtest.startExperiment(experiment.id);
 * ```
 */

// Session Recording
export { 
  SessionRecorder,
  type RecordedSession,
  type RecordedFrame,
  type RecordedAction,
  type GameStateSnapshot,
  type SessionOutcome,
  type AgentInfo,
  type SessionMetadata,
  type RecorderConfig,
  type RewardCalculator
} from './recorder.js';

// Data Export
export { 
  DataExporter,
  type ExportOptions,
  type ExportResult
} from './exporter.js';

// Session Replay
export { 
  ReplayEngine,
  ReplayController,
  type PlaybackState,
  type PlaybackSpeed,
  type ReplayConfig,
  type ReplayProgress,
  type PlaybackFrame,
  type ReplayEvents
} from './replay.js';

// Performance Analytics
export { 
  AnalyticsEngine,
  type AgentStats,
  type RatingPoint,
  type SessionAnalysis,
  type MoveTimingAnalysis,
  type TurnAdvantage,
  type AgentComparison,
  type GlobalStats,
  type AnalyticsConfig
} from './analytics.js';

// A/B Testing
export { 
  ABTestFramework,
  type Variant,
  type Experiment,
  type VariantSample,
  type VariantResults,
  type MetricStats,
  type StatisticalTest,
  type ExperimentResults,
  type Assignment
} from './abtesting.js';

// Version info
export const TRAINING_MODULE_VERSION = '1.0.0';
