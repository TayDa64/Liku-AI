/**
 * @fileoverview ABTestFramework - A/B Testing for AI Strategies
 * 
 * Enables controlled experiments to compare AI strategies:
 * - Experiment definition with variants
 * - Random assignment with configurable weights
 * - Statistical significance testing (Chi-squared, t-test)
 * - Metrics tracking per variant
 * - Experiment lifecycle management
 */

/**
 * Variant definition
 */
export interface Variant {
  id: string;
  name: string;
  description?: string;
  weight: number; // Assignment weight (higher = more likely)
  config: Record<string, unknown>; // Strategy-specific config
}

/**
 * Experiment definition
 */
export interface Experiment {
  id: string;
  name: string;
  description?: string;
  variants: Variant[];
  status: 'draft' | 'running' | 'paused' | 'completed';
  metrics: string[]; // Metrics to track (e.g., 'win_rate', 'avg_moves')
  
  // Lifecycle timestamps
  createdAt: number;
  startedAt?: number;
  pausedAt?: number;
  completedAt?: number;
  
  // Configuration
  minSampleSize: number; // Minimum samples per variant
  confidenceLevel: number; // 0.90, 0.95, 0.99
}

/**
 * Sample data for a variant
 */
export interface VariantSample {
  experimentId: string;
  variantId: string;
  sessionId: string;
  agentId: string;
  timestamp: number;
  metrics: Record<string, number>;
  outcome: 'win' | 'loss' | 'draw';
}

/**
 * Variant results with statistics
 */
export interface VariantResults {
  variantId: string;
  sampleCount: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  metrics: Record<string, MetricStats>;
}

/**
 * Metric statistics
 */
export interface MetricStats {
  count: number;
  sum: number;
  mean: number;
  variance: number;
  stdDev: number;
  min: number;
  max: number;
  median: number;
  values: number[]; // Raw values for distribution
}

/**
 * Statistical test result
 */
export interface StatisticalTest {
  testType: 'chi_squared' | 't_test' | 'z_test';
  testStatistic: number;
  pValue: number;
  degreesOfFreedom: number;
  significant: boolean;
  confidenceLevel: number;
  winner?: string; // Variant ID of winner, if significant
  effectSize?: number;
}

/**
 * Experiment results summary
 */
export interface ExperimentResults {
  experimentId: string;
  status: Experiment['status'];
  variants: VariantResults[];
  totalSamples: number;
  
  // Statistical tests
  winRateTest: StatisticalTest;
  metricTests: Record<string, StatisticalTest>;
  
  // Recommendations
  recommendation: 'continue' | 'winner_found' | 'no_difference' | 'insufficient_data';
  suggestedWinner?: string;
  estimatedSamplesToSignificance?: number;
}

/**
 * Assignment result
 */
export interface Assignment {
  experimentId: string;
  variantId: string;
  agentId: string;
  timestamp: number;
  config: Record<string, unknown>;
}

/**
 * ABTestFramework class
 */
export class ABTestFramework {
  private experiments: Map<string, Experiment> = new Map();
  private samples: Map<string, VariantSample[]> = new Map(); // experimentId -> samples
  private assignments: Map<string, Map<string, string>> = new Map(); // experimentId -> agentId -> variantId

  /**
   * Create a new experiment
   */
  createExperiment(config: Omit<Experiment, 'status' | 'createdAt'>): Experiment {
    if (this.experiments.has(config.id)) {
      throw new Error(`Experiment ${config.id} already exists`);
    }

    // Validate variants
    if (config.variants.length < 2) {
      throw new Error('Experiment must have at least 2 variants');
    }

    const totalWeight = config.variants.reduce((sum, v) => sum + v.weight, 0);
    if (totalWeight <= 0) {
      throw new Error('Total variant weight must be positive');
    }

    const experiment: Experiment = {
      ...config,
      status: 'draft',
      createdAt: Date.now()
    };

    this.experiments.set(config.id, experiment);
    this.samples.set(config.id, []);
    this.assignments.set(config.id, new Map());

    return experiment;
  }

  /**
   * Get an experiment
   */
  getExperiment(id: string): Experiment | null {
    return this.experiments.get(id) ?? null;
  }

  /**
   * List all experiments
   */
  listExperiments(status?: Experiment['status']): Experiment[] {
    const experiments = Array.from(this.experiments.values());
    if (status) {
      return experiments.filter(e => e.status === status);
    }
    return experiments;
  }

  /**
   * Start an experiment
   */
  startExperiment(id: string): boolean {
    const experiment = this.experiments.get(id);
    if (!experiment) return false;

    if (experiment.status === 'running') return true;
    if (experiment.status === 'completed') return false;

    experiment.status = 'running';
    experiment.startedAt = Date.now();
    return true;
  }

  /**
   * Pause an experiment
   */
  pauseExperiment(id: string): boolean {
    const experiment = this.experiments.get(id);
    if (!experiment || experiment.status !== 'running') return false;

    experiment.status = 'paused';
    experiment.pausedAt = Date.now();
    return true;
  }

  /**
   * Resume a paused experiment
   */
  resumeExperiment(id: string): boolean {
    const experiment = this.experiments.get(id);
    if (!experiment || experiment.status !== 'paused') return false;

    experiment.status = 'running';
    return true;
  }

  /**
   * Complete an experiment
   */
  completeExperiment(id: string): boolean {
    const experiment = this.experiments.get(id);
    if (!experiment) return false;

    experiment.status = 'completed';
    experiment.completedAt = Date.now();
    return true;
  }

  /**
   * Delete an experiment
   */
  deleteExperiment(id: string): boolean {
    if (!this.experiments.has(id)) return false;

    this.experiments.delete(id);
    this.samples.delete(id);
    this.assignments.delete(id);
    return true;
  }

  /**
   * Assign an agent to a variant (weighted random)
   */
  assignVariant(experimentId: string, agentId: string): Assignment | null {
    const experiment = this.experiments.get(experimentId);
    if (!experiment || experiment.status !== 'running') return null;

    // Check if already assigned
    const existingAssignment = this.assignments.get(experimentId)?.get(agentId);
    if (existingAssignment) {
      const variant = experiment.variants.find(v => v.id === existingAssignment);
      if (variant) {
        return {
          experimentId,
          variantId: variant.id,
          agentId,
          timestamp: Date.now(),
          config: variant.config
        };
      }
    }

    // Weighted random selection
    const totalWeight = experiment.variants.reduce((sum, v) => sum + v.weight, 0);
    let random = Math.random() * totalWeight;

    for (const variant of experiment.variants) {
      random -= variant.weight;
      if (random <= 0) {
        this.assignments.get(experimentId)!.set(agentId, variant.id);
        return {
          experimentId,
          variantId: variant.id,
          agentId,
          timestamp: Date.now(),
          config: variant.config
        };
      }
    }

    // Fallback to first variant
    const firstVariant = experiment.variants[0];
    this.assignments.get(experimentId)!.set(agentId, firstVariant.id);
    return {
      experimentId,
      variantId: firstVariant.id,
      agentId,
      timestamp: Date.now(),
      config: firstVariant.config
    };
  }

  /**
   * Get current assignment for an agent
   */
  getAssignment(experimentId: string, agentId: string): string | null {
    return this.assignments.get(experimentId)?.get(agentId) ?? null;
  }

  /**
   * Record a sample result
   */
  recordSample(sample: VariantSample): boolean {
    const experiment = this.experiments.get(sample.experimentId);
    if (!experiment) return false;

    const variantExists = experiment.variants.some(v => v.id === sample.variantId);
    if (!variantExists) return false;

    this.samples.get(sample.experimentId)!.push(sample);
    return true;
  }

  /**
   * Get results for an experiment
   */
  getResults(experimentId: string): ExperimentResults | null {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) return null;

    const samples = this.samples.get(experimentId) ?? [];

    // Calculate per-variant results
    const variantResults = new Map<string, VariantResults>();

    for (const variant of experiment.variants) {
      variantResults.set(variant.id, {
        variantId: variant.id,
        sampleCount: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        winRate: 0,
        metrics: {}
      });
    }

    // Initialize metric accumulators
    for (const variant of experiment.variants) {
      const result = variantResults.get(variant.id)!;
      for (const metric of experiment.metrics) {
        result.metrics[metric] = {
          count: 0,
          sum: 0,
          mean: 0,
          variance: 0,
          stdDev: 0,
          min: Infinity,
          max: -Infinity,
          median: 0,
          values: []
        };
      }
    }

    // Accumulate samples
    for (const sample of samples) {
      const result = variantResults.get(sample.variantId);
      if (!result) continue;

      result.sampleCount++;
      if (sample.outcome === 'win') result.wins++;
      else if (sample.outcome === 'loss') result.losses++;
      else result.draws++;

      // Accumulate metrics
      for (const [metric, value] of Object.entries(sample.metrics)) {
        if (result.metrics[metric]) {
          const stats = result.metrics[metric];
          stats.count++;
          stats.sum += value;
          stats.min = Math.min(stats.min, value);
          stats.max = Math.max(stats.max, value);
          stats.values.push(value);
        }
      }
    }

    // Finalize calculations
    for (const result of variantResults.values()) {
      result.winRate = result.sampleCount > 0 ? result.wins / result.sampleCount : 0;

      for (const stats of Object.values(result.metrics)) {
        if (stats.count > 0) {
          stats.mean = stats.sum / stats.count;

          // Variance and std dev
          let sumSquaredDiff = 0;
          for (const value of stats.values) {
            sumSquaredDiff += Math.pow(value - stats.mean, 2);
          }
          stats.variance = sumSquaredDiff / stats.count;
          stats.stdDev = Math.sqrt(stats.variance);

          // Median
          const sorted = [...stats.values].sort((a, b) => a - b);
          const mid = Math.floor(sorted.length / 2);
          stats.median = sorted.length % 2 === 0
            ? (sorted[mid - 1] + sorted[mid]) / 2
            : sorted[mid];
        }

        if (stats.min === Infinity) stats.min = 0;
        if (stats.max === -Infinity) stats.max = 0;
      }
    }

    // Perform statistical tests
    const resultsArray = Array.from(variantResults.values());
    const winRateTest = this.performChiSquaredTest(resultsArray, experiment.confidenceLevel);

    const metricTests: Record<string, StatisticalTest> = {};
    for (const metric of experiment.metrics) {
      metricTests[metric] = this.performTTest(resultsArray, metric, experiment.confidenceLevel);
    }

    // Determine recommendation
    const { recommendation, suggestedWinner, estimatedSamples } = this.determineRecommendation(
      experiment,
      resultsArray,
      winRateTest
    );

    return {
      experimentId,
      status: experiment.status,
      variants: resultsArray,
      totalSamples: samples.length,
      winRateTest,
      metricTests,
      recommendation,
      suggestedWinner,
      estimatedSamplesToSignificance: estimatedSamples
    };
  }

  /**
   * Perform Chi-squared test for win rate comparison
   */
  private performChiSquaredTest(results: VariantResults[], confidenceLevel: number): StatisticalTest {
    const k = results.length; // Number of variants
    const totalSamples = results.reduce((sum, r) => sum + r.sampleCount, 0);

    if (totalSamples === 0) {
      return this.createEmptyTest('chi_squared', confidenceLevel);
    }

    // Calculate expected wins under null hypothesis (uniform win rate)
    const totalWins = results.reduce((sum, r) => sum + r.wins, 0);
    const expectedWinRate = totalWins / totalSamples;

    // Chi-squared statistic
    let chiSquared = 0;
    for (const result of results) {
      if (result.sampleCount === 0) continue;

      const expectedWins = result.sampleCount * expectedWinRate;
      const expectedLosses = result.sampleCount * (1 - expectedWinRate);

      if (expectedWins > 0) {
        chiSquared += Math.pow(result.wins - expectedWins, 2) / expectedWins;
      }
      if (expectedLosses > 0) {
        const actualLosses = result.losses + result.draws;
        chiSquared += Math.pow(actualLosses - expectedLosses, 2) / expectedLosses;
      }
    }

    const degreesOfFreedom = k - 1;
    const criticalValue = this.getChiSquaredCritical(degreesOfFreedom, confidenceLevel);
    const pValue = this.approximateChiSquaredPValue(chiSquared, degreesOfFreedom);
    const significant = chiSquared > criticalValue;

    // Find winner if significant
    let winner: string | undefined;
    if (significant) {
      const sorted = [...results].sort((a, b) => b.winRate - a.winRate);
      if (sorted.length > 0) {
        winner = sorted[0].variantId;
      }
    }

    return {
      testType: 'chi_squared',
      testStatistic: chiSquared,
      pValue,
      degreesOfFreedom,
      significant,
      confidenceLevel,
      winner,
      effectSize: this.calculateCramersV(results)
    };
  }

  /**
   * Perform t-test for metric comparison (2 variants only)
   */
  private performTTest(results: VariantResults[], metric: string, confidenceLevel: number): StatisticalTest {
    if (results.length !== 2) {
      // For more than 2 variants, would need ANOVA
      return this.createEmptyTest('t_test', confidenceLevel);
    }

    const stats1 = results[0].metrics[metric];
    const stats2 = results[1].metrics[metric];

    if (!stats1 || !stats2 || stats1.count < 2 || stats2.count < 2) {
      return this.createEmptyTest('t_test', confidenceLevel);
    }

    // Welch's t-test (unequal variances)
    const meanDiff = stats1.mean - stats2.mean;
    const se1 = stats1.variance / stats1.count;
    const se2 = stats2.variance / stats2.count;
    const se = Math.sqrt(se1 + se2);

    if (se === 0) {
      return this.createEmptyTest('t_test', confidenceLevel);
    }

    const tStatistic = meanDiff / se;

    // Welch-Satterthwaite degrees of freedom
    const df = Math.pow(se1 + se2, 2) / (
      Math.pow(se1, 2) / (stats1.count - 1) +
      Math.pow(se2, 2) / (stats2.count - 1)
    );

    const criticalValue = this.getTCritical(Math.floor(df), confidenceLevel);
    const pValue = this.approximateTPValue(Math.abs(tStatistic), Math.floor(df));
    const significant = Math.abs(tStatistic) > criticalValue;

    // Winner is the one with higher mean
    let winner: string | undefined;
    if (significant) {
      winner = stats1.mean > stats2.mean ? results[0].variantId : results[1].variantId;
    }

    // Cohen's d effect size
    const pooledStdDev = Math.sqrt(
      ((stats1.count - 1) * stats1.variance + (stats2.count - 1) * stats2.variance) /
      (stats1.count + stats2.count - 2)
    );
    const effectSize = pooledStdDev > 0 ? Math.abs(meanDiff) / pooledStdDev : 0;

    return {
      testType: 't_test',
      testStatistic: tStatistic,
      pValue,
      degreesOfFreedom: Math.floor(df),
      significant,
      confidenceLevel,
      winner,
      effectSize
    };
  }

  /**
   * Create empty test result
   */
  private createEmptyTest(testType: StatisticalTest['testType'], confidenceLevel: number): StatisticalTest {
    return {
      testType,
      testStatistic: 0,
      pValue: 1,
      degreesOfFreedom: 0,
      significant: false,
      confidenceLevel
    };
  }

  /**
   * Get Chi-squared critical value (simplified table lookup)
   */
  private getChiSquaredCritical(df: number, confidence: number): number {
    // Critical values for common cases
    const table: Record<number, Record<number, number>> = {
      1: { 0.90: 2.706, 0.95: 3.841, 0.99: 6.635 },
      2: { 0.90: 4.605, 0.95: 5.991, 0.99: 9.210 },
      3: { 0.90: 6.251, 0.95: 7.815, 0.99: 11.345 },
      4: { 0.90: 7.779, 0.95: 9.488, 0.99: 13.277 },
      5: { 0.90: 9.236, 0.95: 11.070, 0.99: 15.086 }
    };

    const clampedDf = Math.min(Math.max(1, df), 5);
    const clampedConfidence = confidence >= 0.99 ? 0.99 : confidence >= 0.95 ? 0.95 : 0.90;

    return table[clampedDf][clampedConfidence];
  }

  /**
   * Get t-distribution critical value (simplified)
   */
  private getTCritical(df: number, confidence: number): number {
    // Approximate critical value using normal distribution for large df
    if (df > 30) {
      const z = confidence >= 0.99 ? 2.576 : confidence >= 0.95 ? 1.96 : 1.645;
      return z;
    }

    // Table for small df (two-tailed)
    const table: Record<number, Record<number, number>> = {
      5: { 0.90: 2.015, 0.95: 2.571, 0.99: 4.032 },
      10: { 0.90: 1.812, 0.95: 2.228, 0.99: 3.169 },
      20: { 0.90: 1.725, 0.95: 2.086, 0.99: 2.845 },
      30: { 0.90: 1.697, 0.95: 2.042, 0.99: 2.750 }
    };

    const roundedDf = df <= 5 ? 5 : df <= 10 ? 10 : df <= 20 ? 20 : 30;
    const clampedConfidence = confidence >= 0.99 ? 0.99 : confidence >= 0.95 ? 0.95 : 0.90;

    return table[roundedDf][clampedConfidence];
  }

  /**
   * Approximate Chi-squared p-value (simplified)
   */
  private approximateChiSquaredPValue(chiSquared: number, df: number): number {
    // Rough approximation using normal distribution for large df
    if (df === 0 || chiSquared <= 0) return 1;

    // Wilson-Hilferty transformation
    const z = Math.pow(chiSquared / df, 1 / 3) - (1 - 2 / (9 * df));
    const normalizedZ = z / Math.sqrt(2 / (9 * df));

    // Approximate standard normal CDF
    return 1 - this.normalCDF(normalizedZ);
  }

  /**
   * Approximate t-distribution p-value
   */
  private approximateTPValue(t: number, df: number): number {
    // For large df, t-distribution approaches normal
    if (df > 30) {
      return 2 * (1 - this.normalCDF(t));
    }

    // Rough approximation
    const x = df / (df + t * t);
    return x; // Simplified, not accurate for small t
  }

  /**
   * Approximate normal CDF
   */
  private normalCDF(z: number): number {
    // Approximation using error function
    const sign = z < 0 ? -1 : 1;
    z = Math.abs(z);

    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const t = 1.0 / (1.0 + p * z);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);

    return 0.5 * (1.0 + sign * y);
  }

  /**
   * Calculate Cramer's V effect size
   */
  private calculateCramersV(results: VariantResults[]): number {
    const k = results.length;
    const n = results.reduce((sum, r) => sum + r.sampleCount, 0);

    if (n === 0 || k < 2) return 0;

    // Simplified calculation
    const totalWins = results.reduce((sum, r) => sum + r.wins, 0);
    const expectedWinRate = totalWins / n;

    let chiSquared = 0;
    for (const result of results) {
      if (result.sampleCount === 0) continue;
      const expected = result.sampleCount * expectedWinRate;
      if (expected > 0) {
        chiSquared += Math.pow(result.wins - expected, 2) / expected;
      }
    }

    // Cramer's V = sqrt(chi^2 / (n * (min(r,c) - 1)))
    return Math.sqrt(chiSquared / (n * (k - 1)));
  }

  /**
   * Determine recommendation based on results
   */
  private determineRecommendation(
    experiment: Experiment,
    results: VariantResults[],
    winRateTest: StatisticalTest
  ): { recommendation: ExperimentResults['recommendation']; suggestedWinner?: string; estimatedSamples?: number } {
    const totalSamples = results.reduce((sum, r) => sum + r.sampleCount, 0);
    const minSamples = experiment.minSampleSize * results.length;

    if (totalSamples < minSamples) {
      // Estimate samples needed
      const estimatedSamples = Math.max(0, minSamples - totalSamples);
      return {
        recommendation: 'insufficient_data',
        estimatedSamples
      };
    }

    if (winRateTest.significant && winRateTest.winner) {
      return {
        recommendation: 'winner_found',
        suggestedWinner: winRateTest.winner
      };
    }

    // Check if effect size is too small to matter
    if (winRateTest.effectSize !== undefined && winRateTest.effectSize < 0.1) {
      return { recommendation: 'no_difference' };
    }

    return { recommendation: 'continue' };
  }

  /**
   * Export framework state
   */
  exportState(): object {
    return {
      experiments: Object.fromEntries(this.experiments),
      samples: Object.fromEntries(this.samples),
      assignments: Object.fromEntries(
        Array.from(this.assignments.entries()).map(([expId, agentMap]) => [
          expId,
          Object.fromEntries(agentMap)
        ])
      )
    };
  }

  /**
   * Import framework state
   */
  importState(state: {
    experiments?: Record<string, Experiment>;
    samples?: Record<string, VariantSample[]>;
    assignments?: Record<string, Record<string, string>>;
  }): void {
    if (state.experiments) {
      for (const [id, exp] of Object.entries(state.experiments)) {
        this.experiments.set(id, exp);
      }
    }

    if (state.samples) {
      for (const [id, samples] of Object.entries(state.samples)) {
        this.samples.set(id, samples);
      }
    }

    if (state.assignments) {
      for (const [expId, agentMap] of Object.entries(state.assignments)) {
        this.assignments.set(expId, new Map(Object.entries(agentMap)));
      }
    }
  }

  /**
   * Get experiment count
   */
  get experimentCount(): number {
    return this.experiments.size;
  }

  /**
   * Reset all experiments
   */
  reset(): void {
    this.experiments.clear();
    this.samples.clear();
    this.assignments.clear();
  }
}

export default ABTestFramework;
