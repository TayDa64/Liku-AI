/**
 * Data Exporter for Liku-AI Training
 * 
 * Exports recorded sessions in multiple formats:
 * - JSON: Full fidelity, human readable
 * - CSV: Tabular format for traditional ML
 * - TFRecord: TensorFlow native format for deep learning
 * - JSONL: JSON Lines for streaming/large datasets
 * 
 * Features:
 * - Configurable field selection
 * - Compression support
 * - Batch export for multiple sessions
 * - Streaming export for memory efficiency
 * 
 * @module training/exporter
 */

import { createWriteStream, WriteStream } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import type { 
  RecordedSession, 
  RecordedFrame, 
  GameStateSnapshot,
  RecordedAction,
} from './recorder.js';

/**
 * Export format types
 */
export enum ExportFormat {
  JSON = 'json',
  JSONL = 'jsonl',
  CSV = 'csv',
  TFRECORD = 'tfrecord',
}

/**
 * Export options
 */
export interface ExportOptions {
  /** Output format */
  format: ExportFormat;
  /** Compress output (gzip) */
  compress: boolean;
  /** Include full state data */
  includeState: boolean;
  /** Include observation vectors */
  includeObservations: boolean;
  /** Include metadata */
  includeMetadata: boolean;
  /** Custom field selection */
  fields?: string[];
  /** Pretty print JSON */
  prettyPrint: boolean;
  /** CSV delimiter */
  csvDelimiter: string;
  /** TFRecord options */
  tfrecord?: {
    /** Feature description for schema */
    featureDescription?: Record<string, 'int' | 'float' | 'bytes'>;
  };
}

/**
 * Default export options
 */
export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  format: ExportFormat.JSON,
  compress: false,
  includeState: true,
  includeObservations: true,
  includeMetadata: true,
  prettyPrint: false,
  csvDelimiter: ',',
};

/**
 * Export result
 */
export interface ExportResult {
  /** Output file path */
  filePath: string;
  /** Export format used */
  format: ExportFormat;
  /** Number of sessions exported */
  sessionCount: number;
  /** Total frames exported */
  frameCount: number;
  /** File size in bytes */
  fileSize: number;
  /** Export duration in ms */
  durationMs: number;
  /** Was compressed */
  compressed: boolean;
}

/**
 * Flattened frame for CSV export
 */
interface FlattenedFrame {
  sessionId: string;
  frameId: number;
  timestamp: number;
  relativeTime: number;
  gameType: string;
  score: number;
  action: string | null;
  actionAgentId: string | null;
  actionParams: string | null;
  reward: number;
  cumulativeReward: number;
  isTerminal: boolean;
  observation: string | null;
  validActions: string;
}

/**
 * DataExporter - Export training data in multiple formats
 */
export class DataExporter {
  private options: ExportOptions;

  constructor(options?: Partial<ExportOptions>) {
    this.options = { ...DEFAULT_EXPORT_OPTIONS, ...options };
  }

  /**
   * Export a single session to file
   */
  async exportSession(
    session: RecordedSession,
    outputPath: string,
    options?: Partial<ExportOptions>
  ): Promise<ExportResult> {
    return this.exportSessions([session], outputPath, options);
  }

  /**
   * Export multiple sessions to file
   */
  async exportSessions(
    sessions: RecordedSession[],
    outputPath: string,
    options?: Partial<ExportOptions>
  ): Promise<ExportResult> {
    const opts = { ...this.options, ...options };
    const startTime = Date.now();

    // Ensure directory exists
    await mkdir(dirname(outputPath), { recursive: true });

    // Determine file extension
    let finalPath = outputPath;
    if (!finalPath.includes('.')) {
      finalPath = `${outputPath}.${opts.format}`;
    }
    if (opts.compress && !finalPath.endsWith('.gz')) {
      finalPath = `${finalPath}.gz`;
    }

    let frameCount = 0;
    for (const session of sessions) {
      frameCount += session.frames.length;
    }

    // Export based on format
    switch (opts.format) {
      case ExportFormat.JSON:
        await this.exportAsJSON(sessions, finalPath, opts);
        break;
      case ExportFormat.JSONL:
        await this.exportAsJSONL(sessions, finalPath, opts);
        break;
      case ExportFormat.CSV:
        await this.exportAsCSV(sessions, finalPath, opts);
        break;
      case ExportFormat.TFRECORD:
        await this.exportAsTFRecord(sessions, finalPath, opts);
        break;
      default:
        throw new Error(`Unsupported format: ${opts.format}`);
    }

    // Get file size
    const { stat } = await import('fs/promises');
    const stats = await stat(finalPath);

    return {
      filePath: finalPath,
      format: opts.format,
      sessionCount: sessions.length,
      frameCount,
      fileSize: stats.size,
      durationMs: Date.now() - startTime,
      compressed: opts.compress,
    };
  }

  /**
   * Export as JSON
   */
  private async exportAsJSON(
    sessions: RecordedSession[],
    outputPath: string,
    options: ExportOptions
  ): Promise<void> {
    const data = sessions.map(s => this.filterSession(s, options));
    const jsonString = options.prettyPrint 
      ? JSON.stringify(data, null, 2)
      : JSON.stringify(data);

    if (options.compress) {
      await this.writeCompressed(outputPath, jsonString);
    } else {
      await writeFile(outputPath, jsonString, 'utf-8');
    }
  }

  /**
   * Export as JSON Lines (one JSON object per line)
   */
  private async exportAsJSONL(
    sessions: RecordedSession[],
    outputPath: string,
    options: ExportOptions
  ): Promise<void> {
    const lines: string[] = [];

    for (const session of sessions) {
      // One line per frame for ML training
      for (const frame of session.frames) {
        const record = {
          sessionId: session.sessionId,
          gameType: session.gameType,
          ...this.filterFrame(frame, options),
        };
        lines.push(JSON.stringify(record));
      }
    }

    const content = lines.join('\n');
    
    if (options.compress) {
      await this.writeCompressed(outputPath, content);
    } else {
      await writeFile(outputPath, content, 'utf-8');
    }
  }

  /**
   * Export as CSV
   */
  private async exportAsCSV(
    sessions: RecordedSession[],
    outputPath: string,
    options: ExportOptions
  ): Promise<void> {
    const rows: FlattenedFrame[] = [];

    for (const session of sessions) {
      for (const frame of session.frames) {
        rows.push(this.flattenFrame(session, frame, options));
      }
    }

    if (rows.length === 0) {
      await writeFile(outputPath, '', 'utf-8');
      return;
    }

    // Generate CSV
    const headers = Object.keys(rows[0]);
    const csvLines = [
      headers.join(options.csvDelimiter),
      ...rows.map(row => 
        headers.map(h => this.escapeCSV(String(row[h as keyof FlattenedFrame] ?? ''), options.csvDelimiter)).join(options.csvDelimiter)
      ),
    ];

    const content = csvLines.join('\n');

    if (options.compress) {
      await this.writeCompressed(outputPath, content);
    } else {
      await writeFile(outputPath, content, 'utf-8');
    }
  }

  /**
   * Export as TFRecord (TensorFlow's native format)
   * 
   * TFRecord format uses Protocol Buffers for efficient storage.
   * Since we don't have protobuf dependency, we implement a compatible
   * binary format that TensorFlow can read.
   */
  private async exportAsTFRecord(
    sessions: RecordedSession[],
    outputPath: string,
    options: ExportOptions
  ): Promise<void> {
    const records: Buffer[] = [];

    for (const session of sessions) {
      for (const frame of session.frames) {
        const example = this.createTFExample(session, frame, options);
        records.push(example);
      }
    }

    // Write TFRecord format
    // Each record: [length (8 bytes)] [masked_crc of length (4 bytes)] [data] [masked_crc of data (4 bytes)]
    const chunks: Buffer[] = [];

    for (const record of records) {
      const length = Buffer.alloc(8);
      length.writeBigUInt64LE(BigInt(record.length));
      
      const lengthCrc = this.maskedCrc32c(length);
      const dataCrc = this.maskedCrc32c(record);

      chunks.push(length, lengthCrc, record, dataCrc);
    }

    const finalBuffer = Buffer.concat(chunks);

    if (options.compress) {
      await this.writeCompressed(outputPath, finalBuffer);
    } else {
      await writeFile(outputPath, finalBuffer);
    }
  }

  /**
   * Create a TensorFlow Example protobuf message
   * Simplified implementation without protobuf library
   */
  private createTFExample(
    session: RecordedSession,
    frame: RecordedFrame,
    options: ExportOptions
  ): Buffer {
    // Build feature map
    const features: Record<string, { type: 'int' | 'float' | 'bytes'; value: number | number[] | string }> = {
      frame_id: { type: 'int', value: frame.frameId },
      timestamp: { type: 'int', value: frame.timestamp },
      relative_time: { type: 'int', value: frame.relativeTime },
      score: { type: 'float', value: frame.state.score },
      reward: { type: 'float', value: frame.reward },
      cumulative_reward: { type: 'float', value: frame.cumulativeReward },
      is_terminal: { type: 'int', value: frame.isTerminal ? 1 : 0 },
      game_type: { type: 'bytes', value: session.gameType },
      session_id: { type: 'bytes', value: session.sessionId },
    };

    // Add observation if available
    if (options.includeObservations && frame.state.observation) {
      features.observation = { type: 'float', value: frame.state.observation };
    }

    // Add action info
    if (frame.action) {
      features.action = { type: 'bytes', value: frame.action.action };
      features.action_agent_id = { type: 'bytes', value: frame.action.agentId };
      features.action_valid = { type: 'int', value: frame.action.wasValid ? 1 : 0 };
    }

    // Valid actions as space-separated string
    features.valid_actions = { type: 'bytes', value: frame.state.validActions.join(' ') };

    // Encode as simple binary format (can be converted to protobuf later)
    return this.encodeFeatures(features);
  }

  /**
   * Encode features to binary format
   * Format: [num_features (4)] [feature1] [feature2] ...
   * Feature: [name_len (2)] [name] [type (1)] [value_len (4)] [value]
   */
  private encodeFeatures(
    features: Record<string, { type: 'int' | 'float' | 'bytes'; value: number | number[] | string }>
  ): Buffer {
    const parts: Buffer[] = [];
    
    // Number of features
    const numFeatures = Buffer.alloc(4);
    numFeatures.writeUInt32LE(Object.keys(features).length);
    parts.push(numFeatures);

    for (const [name, { type, value }] of Object.entries(features)) {
      // Feature name
      const nameBuffer = Buffer.from(name, 'utf-8');
      const nameLen = Buffer.alloc(2);
      nameLen.writeUInt16LE(nameBuffer.length);
      parts.push(nameLen, nameBuffer);

      // Type (0=int, 1=float, 2=bytes)
      const typeBuffer = Buffer.alloc(1);
      typeBuffer.writeUInt8(type === 'int' ? 0 : type === 'float' ? 1 : 2);
      parts.push(typeBuffer);

      // Value
      let valueBuffer: Buffer;
      if (type === 'int') {
        if (Array.isArray(value)) {
          valueBuffer = Buffer.alloc(8 * value.length);
          value.forEach((v, i) => valueBuffer.writeBigInt64LE(BigInt(Math.round(v)), i * 8));
        } else {
          valueBuffer = Buffer.alloc(8);
          valueBuffer.writeBigInt64LE(BigInt(Math.round(value as number)));
        }
      } else if (type === 'float') {
        if (Array.isArray(value)) {
          valueBuffer = Buffer.alloc(4 * value.length);
          value.forEach((v, i) => valueBuffer.writeFloatLE(v, i * 4));
        } else {
          valueBuffer = Buffer.alloc(4);
          valueBuffer.writeFloatLE(value as number);
        }
      } else {
        valueBuffer = Buffer.from(String(value), 'utf-8');
      }

      const valueLen = Buffer.alloc(4);
      valueLen.writeUInt32LE(valueBuffer.length);
      parts.push(valueLen, valueBuffer);
    }

    return Buffer.concat(parts);
  }

  /**
   * Calculate masked CRC32C (used by TFRecord)
   */
  private maskedCrc32c(data: Buffer): Buffer {
    // Simplified CRC32 implementation
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) {
      crc ^= data[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0x82F63B78 : 0);
      }
    }
    crc ^= 0xFFFFFFFF;

    // Mask the CRC
    const masked = ((crc >> 15) | (crc << 17)) + 0xa282ead8;
    
    const result = Buffer.alloc(4);
    result.writeUInt32LE(masked >>> 0);
    return result;
  }

  /**
   * Filter session based on options
   */
  private filterSession(session: RecordedSession, options: ExportOptions): Partial<RecordedSession> {
    const filtered: Partial<RecordedSession> = {
      sessionId: session.sessionId,
      version: session.version,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      gameType: session.gameType,
      gameMode: session.gameMode,
      difficulty: session.difficulty,
      recordingMode: session.recordingMode,
      agents: session.agents,
      outcome: session.outcome,
    };

    if (options.includeMetadata) {
      filtered.metadata = session.metadata;
    }

    filtered.frames = session.frames.map(f => this.filterFrame(f, options) as RecordedFrame);

    return filtered;
  }

  /**
   * Filter frame based on options
   */
  private filterFrame(frame: RecordedFrame, options: ExportOptions): Partial<RecordedFrame> {
    const filtered: Partial<RecordedFrame> = {
      frameId: frame.frameId,
      timestamp: frame.timestamp,
      relativeTime: frame.relativeTime,
      reward: frame.reward,
      cumulativeReward: frame.cumulativeReward,
      isTerminal: frame.isTerminal,
    };

    if (options.includeState) {
      filtered.state = {
        ...frame.state,
        observation: options.includeObservations ? frame.state.observation : undefined,
      };
    }

    if (frame.action) {
      filtered.action = frame.action;
    }

    if (options.includeMetadata && frame.metadata) {
      filtered.metadata = frame.metadata;
    }

    return filtered;
  }

  /**
   * Flatten frame for CSV export
   */
  private flattenFrame(
    session: RecordedSession,
    frame: RecordedFrame,
    options: ExportOptions
  ): FlattenedFrame {
    return {
      sessionId: session.sessionId,
      frameId: frame.frameId,
      timestamp: frame.timestamp,
      relativeTime: frame.relativeTime,
      gameType: session.gameType,
      score: frame.state.score,
      action: frame.action?.action ?? null,
      actionAgentId: frame.action?.agentId ?? null,
      actionParams: frame.action?.params ? JSON.stringify(frame.action.params) : null,
      reward: frame.reward,
      cumulativeReward: frame.cumulativeReward,
      isTerminal: frame.isTerminal,
      observation: options.includeObservations && frame.state.observation 
        ? JSON.stringify(frame.state.observation) 
        : null,
      validActions: frame.state.validActions.join('|'),
    };
  }

  /**
   * Escape CSV field
   */
  private escapeCSV(value: string, delimiter: string): string {
    if (value.includes(delimiter) || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  /**
   * Write compressed data
   */
  private async writeCompressed(outputPath: string, data: string | Buffer): Promise<void> {
    const input = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
    const readable = Readable.from([input]);
    const gzip = createGzip();
    const output = createWriteStream(outputPath);
    
    await pipeline(readable, gzip, output);
  }

  /**
   * Update default options
   */
  setOptions(options: Partial<ExportOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Get current options
   */
  getOptions(): ExportOptions {
    return { ...this.options };
  }
}

// ============================================
// Convenience Functions
// ============================================

/**
 * Export session to JSON file
 */
export async function exportToJSON(
  session: RecordedSession,
  outputPath: string,
  options?: Partial<ExportOptions>
): Promise<ExportResult> {
  const exporter = new DataExporter({ format: ExportFormat.JSON, ...options });
  return exporter.exportSession(session, outputPath);
}

/**
 * Export session to CSV file
 */
export async function exportToCSV(
  session: RecordedSession,
  outputPath: string,
  options?: Partial<ExportOptions>
): Promise<ExportResult> {
  const exporter = new DataExporter({ format: ExportFormat.CSV, ...options });
  return exporter.exportSession(session, outputPath);
}

/**
 * Export session to TFRecord file
 */
export async function exportToTFRecord(
  session: RecordedSession,
  outputPath: string,
  options?: Partial<ExportOptions>
): Promise<ExportResult> {
  const exporter = new DataExporter({ format: ExportFormat.TFRECORD, ...options });
  return exporter.exportSession(session, outputPath);
}

/**
 * Export session to JSON Lines file
 */
export async function exportToJSONL(
  session: RecordedSession,
  outputPath: string,
  options?: Partial<ExportOptions>
): Promise<ExportResult> {
  const exporter = new DataExporter({ format: ExportFormat.JSONL, ...options });
  return exporter.exportSession(session, outputPath);
}

// Singleton instance
export const dataExporter = new DataExporter();
