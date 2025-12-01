/**
 * @fileoverview JSON Patch (RFC 6902) State Differ
 * 
 * Efficient state diffing for spectator mode:
 * - Generates minimal JSON Patch operations
 * - Applies patches to reconstruct state
 * - Automatic fallback to full state when diff is too large
 * - Optimized for game state structures
 * 
 * RFC 6902 Operations:
 * - add: Add a value at path
 * - remove: Remove value at path
 * - replace: Replace value at path
 * - move: Move value from one path to another
 * - copy: Copy value from one path to another
 * - test: Test value at path (for validation)
 */

/**
 * JSON Patch operation types per RFC 6902
 */
export type PatchOperationType = 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';

/**
 * Single JSON Patch operation
 */
export interface PatchOperation {
  /** Operation type */
  op: PatchOperationType;
  /** Target path (JSON Pointer format) */
  path: string;
  /** Value for add/replace/test operations */
  value?: unknown;
  /** Source path for move/copy operations */
  from?: string;
}

/**
 * Complete patch document
 */
export interface PatchDocument {
  /** Sequence of operations */
  operations: PatchOperation[];
  /** Patch generation timestamp */
  timestamp: number;
  /** Source state hash (for validation) */
  sourceHash?: string;
  /** Target state hash (for validation) */
  targetHash?: string;
}

/**
 * Diff result with metadata
 */
export interface DiffResult {
  /** The patch document */
  patch: PatchDocument;
  /** Size of patch in bytes (estimated) */
  patchSize: number;
  /** Size of full state in bytes (estimated) */
  fullStateSize: number;
  /** Compression ratio (patch/full) */
  ratio: number;
  /** Whether fallback to full state is recommended */
  useFallback: boolean;
  /** Full state (included if useFallback is true) */
  fullState?: unknown;
}

/**
 * Differ configuration
 */
export interface DifferConfig {
  /** Maximum patch ratio before fallback (default: 0.5 = 50%) */
  maxPatchRatio: number;
  /** Include state hashes for validation */
  includeHashes: boolean;
  /** Maximum operations before fallback */
  maxOperations: number;
  /** Deep comparison depth limit */
  maxDepth: number;
  /** Array diff strategy */
  arrayStrategy: 'index' | 'lcs';
}

/**
 * Default differ configuration
 */
export const DEFAULT_DIFFER_CONFIG: DifferConfig = {
  maxPatchRatio: 0.5,
  includeHashes: false,
  maxOperations: 100,
  maxDepth: 10,
  arrayStrategy: 'index',
};

/**
 * StateDiffer - JSON Patch generator and applier
 */
export class StateDiffer {
  private config: DifferConfig;

  constructor(config?: Partial<DifferConfig>) {
    this.config = { ...DEFAULT_DIFFER_CONFIG, ...config };
  }

  /**
   * Generate a patch from source to target state
   */
  diff(source: unknown, target: unknown): DiffResult {
    const operations: PatchOperation[] = [];
    const timestamp = Date.now();

    // Generate operations
    this.diffValue(source, target, '', operations, 0);

    // Calculate sizes
    const patchSize = this.estimateSize(operations);
    const fullStateSize = this.estimateSize(target);
    const ratio = fullStateSize > 0 ? patchSize / fullStateSize : 0;

    // Check if fallback is needed
    const useFallback = 
      ratio > this.config.maxPatchRatio ||
      operations.length > this.config.maxOperations;

    const patch: PatchDocument = {
      operations: useFallback ? [] : operations,
      timestamp,
    };

    if (this.config.includeHashes) {
      patch.sourceHash = this.hashState(source);
      patch.targetHash = this.hashState(target);
    }

    return {
      patch,
      patchSize: useFallback ? fullStateSize : patchSize,
      fullStateSize,
      ratio,
      useFallback,
      fullState: useFallback ? target : undefined,
    };
  }

  /**
   * Apply a patch to source state
   */
  apply(source: unknown, patch: PatchDocument): unknown {
    // Deep clone source to avoid mutation
    let result = this.deepClone(source);

    for (const op of patch.operations) {
      result = this.applyOperation(result, op);
    }

    return result;
  }

  /**
   * Validate patch can be applied to source
   */
  validate(source: unknown, patch: PatchDocument): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check hash if available
    if (patch.sourceHash && this.config.includeHashes) {
      const actualHash = this.hashState(source);
      if (actualHash !== patch.sourceHash) {
        errors.push(`Source hash mismatch: expected ${patch.sourceHash}, got ${actualHash}`);
      }
    }

    // Validate each operation
    for (let i = 0; i < patch.operations.length; i++) {
      const op = patch.operations[i];
      const opError = this.validateOperation(source, op, i);
      if (opError) {
        errors.push(opError);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Create a test operation to validate state at path
   */
  createTest(path: string, value: unknown): PatchOperation {
    return { op: 'test', path, value };
  }

  // ========================================
  // Private: Diff Generation
  // ========================================

  private diffValue(
    source: unknown,
    target: unknown,
    path: string,
    operations: PatchOperation[],
    depth: number
  ): void {
    // Depth limit check
    if (depth > this.config.maxDepth) {
      if (!this.deepEqual(source, target)) {
        operations.push({ op: 'replace', path, value: target });
      }
      return;
    }

    // Same value - no operation needed
    if (source === target) {
      return;
    }

    // Handle null/undefined
    if (source === null || source === undefined) {
      if (target !== null && target !== undefined) {
        operations.push({ op: 'add', path, value: target });
      }
      return;
    }

    if (target === null || target === undefined) {
      operations.push({ op: 'remove', path });
      return;
    }

    // Type mismatch - replace
    const sourceType = typeof source;
    const targetType = typeof target;
    if (sourceType !== targetType) {
      operations.push({ op: 'replace', path, value: target });
      return;
    }

    // Primitive types
    if (sourceType !== 'object') {
      if (source !== target) {
        operations.push({ op: 'replace', path, value: target });
      }
      return;
    }

    // Array handling
    if (Array.isArray(source) && Array.isArray(target)) {
      this.diffArray(source, target, path, operations, depth);
      return;
    }

    // Object handling
    if (Array.isArray(source) !== Array.isArray(target)) {
      operations.push({ op: 'replace', path, value: target });
      return;
    }

    this.diffObject(
      source as Record<string, unknown>,
      target as Record<string, unknown>,
      path,
      operations,
      depth
    );
  }

  private diffArray(
    source: unknown[],
    target: unknown[],
    path: string,
    operations: PatchOperation[],
    depth: number
  ): void {
    if (this.config.arrayStrategy === 'lcs') {
      this.diffArrayLCS(source, target, path, operations, depth);
    } else {
      this.diffArrayIndex(source, target, path, operations, depth);
    }
  }

  /**
   * Simple index-based array diff (faster, more operations)
   */
  private diffArrayIndex(
    source: unknown[],
    target: unknown[],
    path: string,
    operations: PatchOperation[],
    depth: number
  ): void {
    const maxLen = Math.max(source.length, target.length);

    // Process from end to start for remove operations
    // This prevents index shifting issues
    const toRemove: number[] = [];
    const toAdd: Array<{ index: number; value: unknown }> = [];
    const toReplace: Array<{ index: number; value: unknown }> = [];

    for (let i = 0; i < maxLen; i++) {
      const sourcePath = `${path}/${i}`;

      if (i >= source.length) {
        // Target has more elements - add
        toAdd.push({ index: i, value: target[i] });
      } else if (i >= target.length) {
        // Source has more elements - remove
        toRemove.push(i);
      } else if (!this.deepEqual(source[i], target[i])) {
        // Different values
        if (typeof source[i] === 'object' && typeof target[i] === 'object' &&
            source[i] !== null && target[i] !== null &&
            Array.isArray(source[i]) === Array.isArray(target[i])) {
          // Recurse into nested structures
          this.diffValue(source[i], target[i], sourcePath, operations, depth + 1);
        } else {
          toReplace.push({ index: i, value: target[i] });
        }
      }
    }

    // Apply removes from end to start
    for (let i = toRemove.length - 1; i >= 0; i--) {
      operations.push({ op: 'remove', path: `${path}/${toRemove[i]}` });
    }

    // Apply replaces
    for (const { index, value } of toReplace) {
      operations.push({ op: 'replace', path: `${path}/${index}`, value });
    }

    // Apply adds
    for (const { index, value } of toAdd) {
      operations.push({ op: 'add', path: `${path}/${index}`, value });
    }
  }

  /**
   * LCS-based array diff (fewer operations, slower)
   */
  private diffArrayLCS(
    source: unknown[],
    target: unknown[],
    path: string,
    operations: PatchOperation[],
    depth: number
  ): void {
    // For small arrays, use simple index diff
    if (source.length <= 5 && target.length <= 5) {
      this.diffArrayIndex(source, target, path, operations, depth);
      return;
    }

    // Find Longest Common Subsequence indices
    const lcs = this.findLCS(source, target);

    // Generate operations based on LCS
    let sourceIdx = 0;
    let targetIdx = 0;
    let lcsIdx = 0;
    let currentTargetIdx = 0;

    while (sourceIdx < source.length || targetIdx < target.length) {
      if (lcsIdx < lcs.length && sourceIdx === lcs[lcsIdx].sourceIdx) {
        // Common element - skip
        sourceIdx++;
        targetIdx++;
        lcsIdx++;
        currentTargetIdx++;
      } else if (sourceIdx < source.length && 
                 (lcsIdx >= lcs.length || sourceIdx < lcs[lcsIdx].sourceIdx)) {
        // Remove from source
        operations.push({ op: 'remove', path: `${path}/${currentTargetIdx}` });
        sourceIdx++;
      } else if (targetIdx < target.length) {
        // Add from target
        operations.push({ op: 'add', path: `${path}/${currentTargetIdx}`, value: target[targetIdx] });
        targetIdx++;
        currentTargetIdx++;
      }
    }
  }

  private findLCS(source: unknown[], target: unknown[]): Array<{ sourceIdx: number; targetIdx: number }> {
    const m = source.length;
    const n = target.length;

    // DP table
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (this.deepEqual(source[i - 1], target[j - 1])) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    // Backtrack to find LCS
    const result: Array<{ sourceIdx: number; targetIdx: number }> = [];
    let i = m, j = n;
    while (i > 0 && j > 0) {
      if (this.deepEqual(source[i - 1], target[j - 1])) {
        result.unshift({ sourceIdx: i - 1, targetIdx: j - 1 });
        i--;
        j--;
      } else if (dp[i - 1][j] > dp[i][j - 1]) {
        i--;
      } else {
        j--;
      }
    }

    return result;
  }

  private diffObject(
    source: Record<string, unknown>,
    target: Record<string, unknown>,
    path: string,
    operations: PatchOperation[],
    depth: number
  ): void {
    const sourceKeys = new Set(Object.keys(source));
    const targetKeys = new Set(Object.keys(target));

    // Find removed keys
    for (const key of sourceKeys) {
      if (!targetKeys.has(key)) {
        operations.push({ op: 'remove', path: `${path}/${this.escapeJsonPointer(key)}` });
      }
    }

    // Find added and changed keys
    for (const key of targetKeys) {
      const keyPath = `${path}/${this.escapeJsonPointer(key)}`;
      if (!sourceKeys.has(key)) {
        operations.push({ op: 'add', path: keyPath, value: target[key] });
      } else {
        this.diffValue(source[key], target[key], keyPath, operations, depth + 1);
      }
    }
  }

  // ========================================
  // Private: Patch Application
  // ========================================

  private applyOperation(state: unknown, op: PatchOperation): unknown {
    const pathParts = this.parseJsonPointer(op.path);

    switch (op.op) {
      case 'add':
        return this.applyAdd(state, pathParts, op.value);
      case 'remove':
        return this.applyRemove(state, pathParts);
      case 'replace':
        return this.applyReplace(state, pathParts, op.value);
      case 'move':
        return this.applyMove(state, pathParts, op.from!);
      case 'copy':
        return this.applyCopy(state, pathParts, op.from!);
      case 'test':
        this.applyTest(state, pathParts, op.value);
        return state;
      default:
        throw new Error(`Unknown operation: ${(op as PatchOperation).op}`);
    }
  }

  private applyAdd(state: unknown, path: string[], value: unknown): unknown {
    if (path.length === 0) {
      return value;
    }

    const result = this.deepClone(state);
    let current: unknown = result;

    for (let i = 0; i < path.length - 1; i++) {
      current = this.getProperty(current, path[i]);
    }

    const lastKey = path[path.length - 1];
    if (Array.isArray(current)) {
      const index = lastKey === '-' ? current.length : parseInt(lastKey, 10);
      current.splice(index, 0, value);
    } else if (typeof current === 'object' && current !== null) {
      (current as Record<string, unknown>)[lastKey] = value;
    }

    return result;
  }

  private applyRemove(state: unknown, path: string[]): unknown {
    if (path.length === 0) {
      return undefined;
    }

    const result = this.deepClone(state);
    let current: unknown = result;

    for (let i = 0; i < path.length - 1; i++) {
      current = this.getProperty(current, path[i]);
    }

    const lastKey = path[path.length - 1];
    if (Array.isArray(current)) {
      const index = parseInt(lastKey, 10);
      current.splice(index, 1);
    } else if (typeof current === 'object' && current !== null) {
      delete (current as Record<string, unknown>)[lastKey];
    }

    return result;
  }

  private applyReplace(state: unknown, path: string[], value: unknown): unknown {
    if (path.length === 0) {
      return value;
    }

    const result = this.deepClone(state);
    let current: unknown = result;

    for (let i = 0; i < path.length - 1; i++) {
      current = this.getProperty(current, path[i]);
    }

    const lastKey = path[path.length - 1];
    if (Array.isArray(current)) {
      const index = parseInt(lastKey, 10);
      current[index] = value;
    } else if (typeof current === 'object' && current !== null) {
      (current as Record<string, unknown>)[lastKey] = value;
    }

    return result;
  }

  private applyMove(state: unknown, toPath: string[], from: string): unknown {
    const fromPath = this.parseJsonPointer(from);
    const value = this.getValue(state, fromPath);
    let result = this.applyRemove(state, fromPath);
    result = this.applyAdd(result, toPath, value);
    return result;
  }

  private applyCopy(state: unknown, toPath: string[], from: string): unknown {
    const fromPath = this.parseJsonPointer(from);
    const value = this.deepClone(this.getValue(state, fromPath));
    return this.applyAdd(state, toPath, value);
  }

  private applyTest(state: unknown, path: string[], expected: unknown): void {
    const actual = this.getValue(state, path);
    if (!this.deepEqual(actual, expected)) {
      throw new Error(`Test failed at ${path.join('/')}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  }

  // ========================================
  // Private: Utilities
  // ========================================

  private validateOperation(state: unknown, op: PatchOperation, index: number): string | null {
    const pathParts = this.parseJsonPointer(op.path);

    switch (op.op) {
      case 'add':
        // Validate parent exists
        if (pathParts.length > 1) {
          const parent = this.getValue(state, pathParts.slice(0, -1));
          if (parent === undefined) {
            return `Operation ${index}: Parent path does not exist for add at ${op.path}`;
          }
        }
        break;
      case 'remove':
      case 'replace':
        // Validate target exists
        if (this.getValue(state, pathParts) === undefined) {
          return `Operation ${index}: Path does not exist for ${op.op} at ${op.path}`;
        }
        break;
      case 'move':
      case 'copy':
        if (!op.from) {
          return `Operation ${index}: Missing 'from' for ${op.op}`;
        }
        if (this.getValue(state, this.parseJsonPointer(op.from)) === undefined) {
          return `Operation ${index}: Source path does not exist for ${op.op} from ${op.from}`;
        }
        break;
    }

    return null;
  }

  private parseJsonPointer(pointer: string): string[] {
    if (!pointer || pointer === '') {
      return [];
    }
    if (!pointer.startsWith('/')) {
      throw new Error(`Invalid JSON Pointer: ${pointer}`);
    }
    return pointer.slice(1).split('/').map(this.unescapeJsonPointer);
  }

  private escapeJsonPointer(str: string): string {
    return str.replace(/~/g, '~0').replace(/\//g, '~1');
  }

  private unescapeJsonPointer(str: string): string {
    return str.replace(/~1/g, '/').replace(/~0/g, '~');
  }

  private getValue(state: unknown, path: string[]): unknown {
    let current = state;
    for (const key of path) {
      current = this.getProperty(current, key);
      if (current === undefined) {
        return undefined;
      }
    }
    return current;
  }

  private getProperty(obj: unknown, key: string): unknown {
    if (Array.isArray(obj)) {
      return obj[parseInt(key, 10)];
    }
    if (typeof obj === 'object' && obj !== null) {
      return (obj as Record<string, unknown>)[key];
    }
    return undefined;
  }

  private deepClone<T>(value: T): T {
    if (value === null || typeof value !== 'object') {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map(item => this.deepClone(item)) as unknown as T;
    }
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>)) {
      result[key] = this.deepClone((value as Record<string, unknown>)[key]);
    }
    return result as T;
  }

  private deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null || b === null) return false;
    if (typeof a !== typeof b) return false;
    if (typeof a !== 'object') return false;

    if (Array.isArray(a) !== Array.isArray(b)) return false;

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((val, idx) => this.deepEqual(val, b[idx]));
    }

    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);

    if (aKeys.length !== bKeys.length) return false;

    return aKeys.every(key => this.deepEqual(aObj[key], bObj[key]));
  }

  private estimateSize(value: unknown): number {
    return JSON.stringify(value).length;
  }

  private hashState(state: unknown): string {
    // Simple hash for state validation
    const str = JSON.stringify(state);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
  }

  /**
   * Get current configuration
   */
  getConfig(): DifferConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<DifferConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// Singleton instance
export const stateDiffer = new StateDiffer();

// Convenience functions
export function diff(source: unknown, target: unknown): DiffResult {
  return stateDiffer.diff(source, target);
}

export function applyPatch(source: unknown, patch: PatchDocument): unknown {
  return stateDiffer.apply(source, patch);
}

export function validatePatch(source: unknown, patch: PatchDocument): { valid: boolean; errors: string[] } {
  return stateDiffer.validate(source, patch);
}
