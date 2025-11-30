/**
 * Liku Learn - Math Engine
 * 
 * Provides mathematical computation, solving, and explanation capabilities.
 * Includes probability, statistics, and educational guidance.
 * Uses mathjs for local computation and optional Wolfram Alpha for advanced queries.
 */

import { MathResult, MathMode, LikuLearnSettings } from '../types.js';
import { sanitizeQuery, checkRateLimit } from '../SafetyLayer.js';

// ============================================================================
// Extended Math Modes
// ============================================================================

export type ExtendedMathMode = MathMode | 'probability' | 'statistics' | 'combinatorics';

// ============================================================================
// Math.js Integration
// ============================================================================

// We'll use dynamic import for mathjs since it's optional
let mathInstance: any = null;

async function getMath(): Promise<any> {
  if (mathInstance) return mathInstance;
  
  try {
    // Try to import mathjs (user needs to install it: npm install mathjs)
    // @ts-ignore - mathjs is optional
    const mathjs = await import('mathjs').catch(() => null);
    if (!mathjs) return null;
    
    mathInstance = mathjs.create(mathjs.all, {
      number: 'BigNumber',
      precision: 64,
    });
    return mathInstance;
  } catch {
    // mathjs not installed, use basic fallback
    return null;
  }
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Process a math query
 */
export async function processMath(
  input: string,
  mode: MathMode = 'calculate',
  settings?: Partial<LikuLearnSettings>
): Promise<MathResult> {
  // Sanitize input
  const sanitized = sanitizeQuery(input);
  if (!sanitized.isValid) {
    throw new Error(sanitized.reason);
  }

  const query = sanitized.sanitizedInput!;
  const lower = query.toLowerCase();

  // Handle explain mode first (takes priority)
  if (mode === 'explain' || /^(what\s+is|explain|how\s+does|define)\s/i.test(lower)) {
    return explain(query);
  }

  // Check for probability/statistics before standard processing
  if (isProbabilityQuery(lower)) {
    return handleProbability(query);
  }

  if (isStatisticsQuery(lower)) {
    return handleStatistics(query);
  }

  if (isCombinatoricsQuery(lower)) {
    return handleCombinatorics(query);
  }

  switch (mode) {
    case 'calculate':
      return calculate(query);
    case 'solve':
      return solve(query);
    case 'simplify':
      return simplify(query);
    case 'convert':
      return convert(query);
    default:
      // explain mode already handled above
      return calculate(query);
  }
}

// ============================================================================
// Query Type Detection
// ============================================================================

function isProbabilityQuery(query: string): boolean {
  return /probabilit|chance|odds|likelihood|p\s*\(|bayes|expected\s+value|coin|flip|heads|tails|dice|die|roll|random|binomial|normal\s+distribution|poisson|bernoulli/i.test(query);
}

function isStatisticsQuery(query: string): boolean {
  return /\b(mean|median|mode|average|variance|std\s*dev|standard\s+deviation|percentile|quartile|correlation|regression|sample|population|z-score|t-test|confidence\s+interval)\b/i.test(query);
}

function isCombinatoricsQuery(query: string): boolean {
  return /permutation|combination|factorial|choose|nCr|nPr|how\s+many\s+ways|arrangements?|\d+!/i.test(query);
}

// ============================================================================
// Probability Handling
// ============================================================================

/**
 * Handle probability-related queries
 */
function handleProbability(query: string): MathResult {
  const lower = query.toLowerCase();
  const steps: string[] = [];
  let output = '';

  // Coin flip probability
  if (/coin|flip|heads|tails/i.test(lower)) {
    const match = lower.match(/(\d+)\s*(?:heads|tails)/i);
    const flips = lower.match(/(\d+)\s*(?:flips?|times?|tosses?)/i);
    
    if (match && flips) {
      const k = parseInt(match[1]);
      const n = parseInt(flips[1]);
      const prob = binomialProbability(n, k, 0.5);
      
      steps.push(`Problem: Probability of exactly ${k} heads in ${n} flips`);
      steps.push(`Formula: P(X = k) = C(n,k) × p^k × (1-p)^(n-k)`);
      steps.push(`Binomial distribution with n=${n}, k=${k}, p=0.5`);
      steps.push(`C(${n},${k}) = ${combination(n, k)}`);
      output = `P = ${prob.toFixed(6)} (${(prob * 100).toFixed(2)}%)`;
    } else {
      steps.push('Single fair coin flip:');
      steps.push('P(heads) = P(tails) = 0.5 = 50%');
      output = 'P = 0.5 (50% for either outcome)';
    }
    
    return { mode: 'calculate', input: query, output, steps };
  }

  // Dice probability
  if (/dice|die|roll/i.test(lower)) {
    const numDiceMatch = lower.match(/(\d+)\s*(?:dice|die)/i);
    const targetSum = lower.match(/sum\s*(?:of|=|equals?)?\s*(\d+)/i);
    const targetValue = lower.match(/roll(?:ing)?\s*(?:a\s*)?(\d+)/i);
    
    // Default to 2 dice if asking about sum but no dice count specified
    const numDice = numDiceMatch ? parseInt(numDiceMatch[1]) : (targetSum ? 2 : 1);
    
    if (targetSum) {
      const sum = parseInt(targetSum[1]);
      const prob = diceSumProbability(numDice, sum);
      
      steps.push(`Problem: Probability of rolling sum of ${sum} with ${numDice} dice`);
      steps.push(`Each die has outcomes {1,2,3,4,5,6} with equal probability 1/6`);
      steps.push(`Total possible outcomes: 6^${numDice} = ${Math.pow(6, numDice)}`);
      
      if (numDice === 2) {
        // For 2 dice, show the favorable outcomes
        const ways = countWaysToSum(numDice, sum);
        steps.push(`Ways to get sum of ${sum}: ${ways} combination(s)`);
      }
      
      output = `P(sum = ${sum}) ≈ ${prob.toFixed(6)} (${(prob * 100).toFixed(2)}%)`;
    } else if (targetValue) {
      const v = parseInt(targetValue[1]);
      if (v >= 1 && v <= 6) {
        steps.push(`Single fair die: Each face has probability 1/6`);
        steps.push(`P(rolling ${v}) = 1/6 ≈ 0.1667`);
        output = `P = 1/6 ≈ 0.1667 (16.67%)`;
      } else {
        output = `Value ${v} is impossible on a standard die (1-6)`;
      }
    } else {
      steps.push('Standard die probabilities:');
      steps.push('P(any single value) = 1/6 ≈ 16.67%');
      steps.push('P(even) = P(odd) = 3/6 = 50%');
      steps.push('P(≤3) = P(≥4) = 50%');
      steps.push('');
      steps.push('For sum of two dice:');
      steps.push('  P(sum=7) = 6/36 ≈ 16.67% (most likely)');
      steps.push('  P(sum=2) = P(sum=12) = 1/36 ≈ 2.78%');
      output = 'Each outcome has probability 1/6 ≈ 0.1667';
    }
    
    return { mode: 'calculate', input: query, output, steps };
  }

  // Bayes theorem
  if (/bayes/i.test(lower)) {
    steps.push("Bayes' Theorem: P(A|B) = [P(B|A) × P(A)] / P(B)");
    steps.push('');
    steps.push('Where:');
    steps.push('  P(A|B) = Probability of A given B (posterior)');
    steps.push('  P(B|A) = Probability of B given A (likelihood)');
    steps.push('  P(A) = Prior probability of A');
    steps.push('  P(B) = Total probability of B');
    steps.push('');
    steps.push('P(B) can be expanded: P(B) = P(B|A)P(A) + P(B|¬A)P(¬A)');
    steps.push('');
    steps.push('Example: If a test is 99% accurate and 1% of population has disease:');
    steps.push('  P(disease|positive) = (0.99 × 0.01) / [(0.99 × 0.01) + (0.01 × 0.99)]');
    steps.push('  = 0.0099 / 0.0198 = 0.5 (50%!)');
    output = "Bayes' Theorem explained above. Provide specific values for calculation.";
    
    return { mode: 'calculate', input: query, output, steps };
  }

  // Expected value
  if (/expected\s+value|expectation|E\[/i.test(lower)) {
    steps.push('Expected Value: E[X] = Σ xᵢ × P(xᵢ)');
    steps.push('');
    steps.push('The expected value is the long-run average of repetitions.');
    steps.push('');
    steps.push('Common expected values:');
    steps.push('  Fair coin (1 for heads, 0 for tails): E[X] = 0.5');
    steps.push('  Fair die: E[X] = (1+2+3+4+5+6)/6 = 3.5');
    steps.push('  Binomial(n,p): E[X] = n × p');
    steps.push('  Normal(μ,σ): E[X] = μ');
    steps.push('');
    steps.push('To calculate: List all outcomes with their probabilities,');
    steps.push('multiply each outcome by its probability, then sum.');
    output = 'Expected value formula explained. Provide specific distribution for calculation.';
    
    return { mode: 'calculate', input: query, output, steps };
  }

  // Binomial distribution
  if (/binomial/i.test(lower)) {
    const params = lower.match(/n\s*=?\s*(\d+).*?k\s*=?\s*(\d+).*?p\s*=?\s*([\d.]+)/i) ||
                   lower.match(/(\d+)\s*trials?.*?(\d+)\s*success.*?([\d.]+)\s*prob/i);
    
    if (params) {
      const n = parseInt(params[1]);
      const k = parseInt(params[2]);
      const p = parseFloat(params[3]);
      const prob = binomialProbability(n, k, p);
      
      steps.push(`Binomial Distribution: P(X = k) = C(n,k) × p^k × (1-p)^(n-k)`);
      steps.push(`Parameters: n=${n} trials, k=${k} successes, p=${p}`);
      steps.push(`C(${n},${k}) = ${combination(n, k)}`);
      steps.push(`p^k = ${p}^${k} = ${Math.pow(p, k).toFixed(6)}`);
      steps.push(`(1-p)^(n-k) = ${1-p}^${n-k} = ${Math.pow(1-p, n-k).toFixed(6)}`);
      output = `P(X = ${k}) = ${prob.toFixed(6)} (${(prob * 100).toFixed(4)}%)`;
    } else {
      steps.push('Binomial Distribution: P(X = k) = C(n,k) × p^k × (1-p)^(n-k)');
      steps.push('');
      steps.push('Parameters:');
      steps.push('  n = number of trials');
      steps.push('  k = number of successes');
      steps.push('  p = probability of success on each trial');
      steps.push('');
      steps.push('Properties:');
      steps.push('  E[X] = n × p (expected value)');
      steps.push('  Var(X) = n × p × (1-p) (variance)');
      steps.push('');
      steps.push('Example usage: "binomial n=10 k=3 p=0.5"');
      output = 'Provide n, k, and p values for specific calculation';
    }
    
    return { mode: 'calculate', input: query, output, steps };
  }

  // Normal distribution / Z-score
  if (/normal\s+distribution|z-score|bell\s+curve/i.test(lower)) {
    const zMatch = lower.match(/z\s*=?\s*([-\d.]+)/i);
    
    if (zMatch) {
      const z = parseFloat(zMatch[1]);
      const prob = normalCDF(z);
      
      steps.push(`Standard Normal Distribution (Z-score)`);
      steps.push(`Z = ${z}`);
      steps.push(`P(Z ≤ ${z}) = Φ(${z}) ≈ ${prob.toFixed(6)}`);
      steps.push(`P(Z > ${z}) = 1 - Φ(${z}) ≈ ${(1 - prob).toFixed(6)}`);
      output = `P(Z ≤ ${z}) ≈ ${prob.toFixed(4)} (${(prob * 100).toFixed(2)}%)`;
    } else {
      steps.push('Normal Distribution: N(μ, σ²)');
      steps.push('');
      steps.push('Z-score formula: Z = (X - μ) / σ');
      steps.push('');
      steps.push('68-95-99.7 Rule:');
      steps.push('  68% of data within 1 standard deviation of mean');
      steps.push('  95% of data within 2 standard deviations');
      steps.push('  99.7% of data within 3 standard deviations');
      steps.push('');
      steps.push('Common Z-scores:');
      steps.push('  Z = 1.96 → 97.5% (95% CI)');
      steps.push('  Z = 2.58 → 99.5% (99% CI)');
      output = 'Provide z-score for specific probability lookup';
    }
    
    return { mode: 'calculate', input: query, output, steps };
  }

  // Generic probability guidance
  steps.push('📊 Probability Concepts:');
  steps.push('');
  steps.push('Basic Rules:');
  steps.push('  P(A or B) = P(A) + P(B) - P(A and B)');
  steps.push('  P(A and B) = P(A) × P(B|A)');
  steps.push('  P(not A) = 1 - P(A)');
  steps.push('');
  steps.push('Common Distributions:');
  steps.push('  • Binomial: Discrete, fixed trials, success/failure');
  steps.push('  • Normal: Continuous, bell-shaped, mean/std dev');
  steps.push('  • Poisson: Discrete, rare events over time/space');
  steps.push('');
  steps.push('Try asking about:');
  steps.push('  "coin flip probability 3 heads in 5 flips"');
  steps.push('  "dice probability sum of 7"');
  steps.push('  "binomial n=10 k=3 p=0.5"');
  steps.push('  "normal distribution z=1.96"');
  steps.push('  "expected value"');
  steps.push('  "bayes theorem"');
  output = 'See probability guidance above. Ask a more specific question!';

  return { mode: 'calculate', input: query, output, steps };
}

// ============================================================================
// Statistics Handling
// ============================================================================

/**
 * Handle statistics-related queries
 */
function handleStatistics(query: string): MathResult {
  const lower = query.toLowerCase();
  const steps: string[] = [];
  let output = '';

  // Extract numbers from query
  const numbers = extractNumbers(query);

  if (numbers.length > 0) {
    const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
    const sortedNums = [...numbers].sort((a, b) => a - b);
    const median = sortedNums.length % 2 === 0
      ? (sortedNums[sortedNums.length/2 - 1] + sortedNums[sortedNums.length/2]) / 2
      : sortedNums[Math.floor(sortedNums.length/2)];
    
    // Calculate mode
    const counts = new Map<number, number>();
    numbers.forEach(n => counts.set(n, (counts.get(n) || 0) + 1));
    const maxCount = Math.max(...counts.values());
    const modes = [...counts.entries()].filter(([_, c]) => c === maxCount).map(([n, _]) => n);
    
    // Variance and standard deviation
    const variance = numbers.reduce((sum, n) => sum + Math.pow(n - mean, 2), 0) / numbers.length;
    const stdDev = Math.sqrt(variance);
    
    steps.push(`Dataset: [${numbers.join(', ')}]`);
    steps.push(`n = ${numbers.length}`);
    steps.push('');
    steps.push('Central Tendency:');
    steps.push(`  Mean (average): ${mean.toFixed(4)}`);
    steps.push(`  Median (middle): ${median}`);
    steps.push(`  Mode (most common): ${modes.join(', ')}${maxCount === 1 ? ' (no mode - all unique)' : ''}`);
    steps.push('');
    steps.push('Spread:');
    steps.push(`  Range: ${sortedNums[sortedNums.length-1] - sortedNums[0]}`);
    steps.push(`  Variance: ${variance.toFixed(4)}`);
    steps.push(`  Standard Deviation: ${stdDev.toFixed(4)}`);
    steps.push(`  Min: ${sortedNums[0]}, Max: ${sortedNums[sortedNums.length-1]}`);
    
    // Quartiles if enough data
    if (numbers.length >= 4) {
      const q1 = sortedNums[Math.floor(sortedNums.length * 0.25)];
      const q3 = sortedNums[Math.floor(sortedNums.length * 0.75)];
      steps.push(`  Q1 (25th): ${q1}, Q3 (75th): ${q3}`);
      steps.push(`  IQR: ${q3 - q1}`);
    }
    
    output = `Mean=${mean.toFixed(2)}, Median=${median}, StdDev=${stdDev.toFixed(2)}`;
    
    return { mode: 'calculate', input: query, output, steps };
  }

  // Z-score calculation
  if (/z-?score/i.test(lower)) {
    steps.push('Z-Score Formula:');
    steps.push('  Z = (X - μ) / σ');
    steps.push('');
    steps.push('Where:');
    steps.push('  X = individual value');
    steps.push('  μ = population mean');
    steps.push('  σ = population standard deviation');
    steps.push('');
    steps.push('Interpretation:');
    steps.push('  Z = 0 → value equals the mean');
    steps.push('  Z = 1 → value is 1 std dev above mean');
    steps.push('  Z = -2 → value is 2 std devs below mean');
    steps.push('');
    steps.push('Provide values like: "z-score x=75 mean=70 stddev=5"');
    output = 'Z-score formula explained. Provide X, mean, and stddev for calculation.';
    
    return { mode: 'calculate', input: query, output, steps };
  }

  // Confidence interval
  if (/confidence\s+interval/i.test(lower)) {
    steps.push('Confidence Interval Formula (for mean):');
    steps.push('  CI = x̄ ± z* × (σ / √n)');
    steps.push('');
    steps.push('Common Z* values:');
    steps.push('  90% CI: z* = 1.645');
    steps.push('  95% CI: z* = 1.96');
    steps.push('  99% CI: z* = 2.576');
    steps.push('');
    steps.push('For small samples (n < 30), use t-distribution:');
    steps.push('  CI = x̄ ± t* × (s / √n)');
    steps.push('');
    steps.push('Interpretation:');
    steps.push('  "We are 95% confident the true population mean');
    steps.push('   falls within this interval."');
    output = 'Confidence interval formulas explained above.';
    
    return { mode: 'calculate', input: query, output, steps };
  }

  // Generic statistics guidance
  steps.push('📈 Statistics Guidance:');
  steps.push('');
  steps.push('Provide a dataset for analysis:');
  steps.push('  "mean of 10, 20, 30, 40, 50"');
  steps.push('  "statistics 85, 90, 78, 92, 88, 76"');
  steps.push('');
  steps.push('Key Concepts:');
  steps.push('  • Mean: Sum of values / count (sensitive to outliers)');
  steps.push('  • Median: Middle value (robust to outliers)');
  steps.push('  • Mode: Most frequent value');
  steps.push('  • Standard Deviation: Spread around the mean');
  steps.push('  • Variance: StdDev squared');
  steps.push('');
  steps.push('Also try:');
  steps.push('  "z-score"');
  steps.push('  "confidence interval"');
  steps.push('  "normal distribution"');
  output = 'Provide numbers for calculation or ask about a concept!';

  return { mode: 'calculate', input: query, output, steps };
}

// ============================================================================
// Combinatorics Handling
// ============================================================================

/**
 * Handle combinatorics-related queries
 */
function handleCombinatorics(query: string): MathResult {
  const lower = query.toLowerCase();
  const steps: string[] = [];
  let output = '';

  // Factorial
  const factMatch = query.match(/(\d+)!/);
  if (factMatch) {
    const n = parseInt(factMatch[1]);
    if (n > 170) {
      output = 'Factorial too large (max 170 for numeric result)';
    } else {
      const result = factorial(n);
      steps.push(`${n}! = ${n} × ${n-1} × ... × 2 × 1`);
      steps.push(`${n}! = ${result}`);
      output = `${n}! = ${result}`;
    }
    return { mode: 'calculate', input: query, output, steps };
  }

  // Combinations: C(n,r) or "n choose r"
  const combMatch = lower.match(/(?:c\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)|(\d+)\s*(?:choose|c)\s*(\d+)|nCr\s*\(\s*(\d+)\s*,\s*(\d+)\s*\))/i);
  if (combMatch) {
    const n = parseInt(combMatch[1] || combMatch[3] || combMatch[5]);
    const r = parseInt(combMatch[2] || combMatch[4] || combMatch[6]);
    const result = combination(n, r);
    
    steps.push(`Combinations (order doesn't matter): C(n,r) = n! / [r!(n-r)!]`);
    steps.push(`C(${n},${r}) = ${n}! / [${r}! × ${n-r}!]`);
    steps.push(`C(${n},${r}) = ${factorial(n)} / [${factorial(r)} × ${factorial(n-r)}]`);
    output = `C(${n},${r}) = ${result}`;
    
    return { mode: 'calculate', input: query, output, steps };
  }

  // Permutations: P(n,r) or nPr
  const permMatch = lower.match(/(?:p\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)|nPr\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)|(\d+)\s*p\s*(\d+))/i);
  if (permMatch) {
    const n = parseInt(permMatch[1] || permMatch[3] || permMatch[5]);
    const r = parseInt(permMatch[2] || permMatch[4] || permMatch[6]);
    const result = permutation(n, r);
    
    steps.push(`Permutations (order matters): P(n,r) = n! / (n-r)!`);
    steps.push(`P(${n},${r}) = ${n}! / ${n-r}!`);
    steps.push(`P(${n},${r}) = ${factorial(n)} / ${factorial(n-r)}`);
    output = `P(${n},${r}) = ${result}`;
    
    return { mode: 'calculate', input: query, output, steps };
  }

  // "How many ways" questions
  if (/how\s+many\s+ways/i.test(lower)) {
    steps.push('🎯 Counting Principles:');
    steps.push('');
    steps.push('1. Combinations (order doesn\'t matter):');
    steps.push('   "Choose 3 people from a group of 10"');
    steps.push('   C(10,3) = 10! / [3! × 7!] = 120 ways');
    steps.push('');
    steps.push('2. Permutations (order matters):');
    steps.push('   "Arrange 3 people in 3 seats from 10 people"');
    steps.push('   P(10,3) = 10! / 7! = 720 ways');
    steps.push('');
    steps.push('3. Multiplication Principle:');
    steps.push('   "3 shirts and 4 pants = 3 × 4 = 12 outfits"');
    steps.push('');
    steps.push('Try: "10 choose 3" or "C(10,3)" or "P(10,3)"');
    output = 'See counting principles above. Ask a specific question!';
    
    return { mode: 'calculate', input: query, output, steps };
  }

  // Generic combinatorics guidance
  steps.push('🔢 Combinatorics Formulas:');
  steps.push('');
  steps.push('Factorial: n! = n × (n-1) × ... × 1');
  steps.push('  Example: 5! = 120');
  steps.push('');
  steps.push('Combinations (unordered selection):');
  steps.push('  C(n,r) = n! / [r!(n-r)!]');
  steps.push('  Example: C(5,2) = 10');
  steps.push('');
  steps.push('Permutations (ordered arrangement):');
  steps.push('  P(n,r) = n! / (n-r)!');
  steps.push('  Example: P(5,2) = 20');
  steps.push('');
  steps.push('Try: "5!", "10 choose 3", "P(5,2)", "C(10,3)"');
  output = 'See combinatorics guidance above!';

  return { mode: 'calculate', input: query, output, steps };
}

// ============================================================================
// Mathematical Helper Functions
// ============================================================================

/**
 * Calculate factorial
 */
function factorial(n: number): number {
  if (n < 0) return NaN;
  if (n === 0 || n === 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) {
    result *= i;
  }
  return result;
}

/**
 * Calculate combination C(n,r)
 */
function combination(n: number, r: number): number {
  if (r > n || r < 0) return 0;
  if (r === 0 || r === n) return 1;
  return factorial(n) / (factorial(r) * factorial(n - r));
}

/**
 * Calculate permutation P(n,r)
 */
function permutation(n: number, r: number): number {
  if (r > n || r < 0) return 0;
  return factorial(n) / factorial(n - r);
}

/**
 * Calculate binomial probability P(X = k)
 */
function binomialProbability(n: number, k: number, p: number): number {
  return combination(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k);
}

/**
 * Calculate dice sum probability (brute force for small cases)
 */
function diceSumProbability(numDice: number, targetSum: number): number {
  if (numDice > 6) {
    // Use normal approximation for many dice
    const mean = numDice * 3.5;
    const stdDev = Math.sqrt(numDice * 35 / 12);
    return Math.exp(-Math.pow(targetSum - mean, 2) / (2 * stdDev * stdDev)) / (stdDev * Math.sqrt(2 * Math.PI));
  }
  
  const totalOutcomes = Math.pow(6, numDice);
  const favorableOutcomes = countWaysToSum(numDice, targetSum);
  return favorableOutcomes / totalOutcomes;
}

/**
 * Count ways to get a sum with given number of dice
 */
function countWaysToSum(diceLeft: number, remainingSum: number): number {
  if (diceLeft === 0) return remainingSum === 0 ? 1 : 0;
  if (remainingSum < diceLeft || remainingSum > diceLeft * 6) return 0;
  
  let count = 0;
  for (let face = 1; face <= 6; face++) {
    count += countWaysToSum(diceLeft - 1, remainingSum - face);
  }
  return count;
}

/**
 * Standard normal CDF approximation (Abramowitz and Stegun)
 */
function normalCDF(z: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  
  const sign = z < 0 ? -1 : 1;
  z = Math.abs(z) / Math.SQRT2;
  
  const t = 1.0 / (1.0 + p * z);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
  
  return 0.5 * (1.0 + sign * y);
}

/**
 * Extract numbers from a string
 */
function extractNumbers(text: string): number[] {
  const matches = text.match(/-?\d+(?:\.\d+)?/g);
  return matches ? matches.map(n => parseFloat(n)) : [];
}

/**
 * Detect the appropriate math mode from input
 */
export function detectMathMode(input: string): MathMode | null {
  const lower = input.toLowerCase();

  // Check for probability patterns
  if (/probabilit|chance|odds|likelihood|p\s*\(|bayes|expected\s+value|fair\s+coin|dice|random|binomial|normal\s+distribution|standard\s+deviation|poisson/i.test(lower)) {
    return 'calculate'; // We'll handle internally with probability functions
  }

  // Check for statistics patterns
  if (/mean|median|mode|average|variance|std\s*dev|standard\s+deviation|percentile|quartile|correlation|regression|sample|population/i.test(lower)) {
    return 'calculate'; // Handle with statistics functions
  }

  // Check for combinatorics patterns
  if (/permutation|combination|factorial|choose|nCr|nPr|how\s+many\s+ways|arrangements?/i.test(lower)) {
    return 'calculate'; // Handle with combinatorics functions
  }

  // Check for solve patterns
  if (/solve|find\s+x|equation|=\s*0/.test(lower)) {
    return 'solve';
  }

  // Check for conversion patterns
  if (/convert|to\s+(meters?|feet|celsius|fahrenheit|kg|pounds?|miles?|km)/i.test(lower)) {
    return 'convert';
  }

  // Check for simplify patterns
  if (/simplify|reduce|factor/.test(lower)) {
    return 'simplify';
  }

  // Check for explanation patterns
  if (/what\s+is|explain|how\s+does|why|define/.test(lower)) {
    return 'explain';
  }

  // Check if it's a calculation (contains operators or numbers)
  if (/[\d+\-*/^()=]/.test(input)) {
    return 'calculate';
  }

  return null;
}

// ============================================================================
// Calculation
// ============================================================================

/**
 * Evaluate a mathematical expression
 */
async function calculate(expression: string): Promise<MathResult> {
  const math = await getMath();

  // Clean the expression
  const cleaned = cleanExpression(expression);

  try {
    let output: string;
    let steps: string[] = [];

    if (math) {
      // Use mathjs for accurate calculation
      const result = math.evaluate(cleaned);
      output = math.format(result, { notation: 'auto', precision: 10 });
      
      steps = [
        `Input: ${cleaned}`,
        `Evaluation: ${output}`,
      ];
    } else {
      // Fallback to basic eval (with safety)
      output = safeEval(cleaned);
      steps = [`${cleaned} = ${output}`];
    }

    return {
      mode: 'calculate',
      input: expression,
      output,
      steps,
    };
  } catch (error) {
    return {
      mode: 'calculate',
      input: expression,
      output: `Error: ${error instanceof Error ? error.message : 'Calculation failed'}`,
    };
  }
}

// ============================================================================
// Equation Solving
// ============================================================================

/**
 * Solve an equation (basic solver)
 */
async function solve(equation: string): Promise<MathResult> {
  const steps: string[] = [];
  
  // Parse the equation
  const parsed = parseEquation(equation);
  if (!parsed) {
    return {
      mode: 'solve',
      input: equation,
      output: 'Could not parse equation. Try format: ax + b = c',
      steps: ['Unable to parse equation format'],
    };
  }

  steps.push(`Original equation: ${equation}`);

  // Simple linear equation solver: ax + b = c
  // Solve for x: x = (c - b) / a
  if (parsed.type === 'linear') {
    const { a, b, c } = parsed;
    steps.push(`Identified as linear equation: ${a}x + ${b} = ${c}`);
    
    if (a === 0) {
      return {
        mode: 'solve',
        input: equation,
        output: b === c ? 'Infinite solutions (identity)' : 'No solution (contradiction)',
        steps,
      };
    }

    const x = (c - b) / a;
    steps.push(`Subtract ${b} from both sides: ${a}x = ${c - b}`);
    steps.push(`Divide by ${a}: x = ${x}`);

    return {
      mode: 'solve',
      input: equation,
      output: `x = ${x}`,
      steps,
    };
  }

  // Quadratic equation solver: ax² + bx + c = 0
  if (parsed.type === 'quadratic') {
    const { a, b, c } = parsed;
    steps.push(`Identified as quadratic: ${a}x² + ${b}x + ${c} = 0`);
    
    const discriminant = b * b - 4 * a * c;
    steps.push(`Discriminant (b² - 4ac): ${discriminant}`);

    if (discriminant < 0) {
      const realPart = -b / (2 * a);
      const imagPart = Math.sqrt(-discriminant) / (2 * a);
      return {
        mode: 'solve',
        input: equation,
        output: `x = ${realPart.toFixed(4)} ± ${imagPart.toFixed(4)}i (complex roots)`,
        steps,
      };
    }

    const x1 = (-b + Math.sqrt(discriminant)) / (2 * a);
    const x2 = (-b - Math.sqrt(discriminant)) / (2 * a);

    steps.push(`Using quadratic formula: x = (-b ± √(b² - 4ac)) / 2a`);
    steps.push(`x₁ = ${x1.toFixed(6)}`);
    steps.push(`x₂ = ${x2.toFixed(6)}`);

    const output = discriminant === 0 
      ? `x = ${x1}` 
      : `x = ${x1.toFixed(6)} or x = ${x2.toFixed(6)}`;

    return {
      mode: 'solve',
      input: equation,
      output,
      steps,
    };
  }

  return {
    mode: 'solve',
    input: equation,
    output: 'Equation type not supported. Try linear (ax + b = c) or quadratic (ax² + bx + c = 0)',
    steps,
  };
}

// ============================================================================
// Simplification
// ============================================================================

/**
 * Simplify a mathematical expression
 */
async function simplify(expression: string): Promise<MathResult> {
  const math = await getMath();

  if (!math) {
    return {
      mode: 'simplify',
      input: expression,
      output: 'mathjs not installed. Run: npm install mathjs',
    };
  }

  try {
    const simplified = math.simplify(expression);
    return {
      mode: 'simplify',
      input: expression,
      output: simplified.toString(),
      steps: [
        `Original: ${expression}`,
        `Simplified: ${simplified.toString()}`,
      ],
    };
  } catch (error) {
    return {
      mode: 'simplify',
      input: expression,
      output: `Error: ${error instanceof Error ? error.message : 'Simplification failed'}`,
    };
  }
}

// ============================================================================
// Unit Conversion
// ============================================================================

/**
 * Convert between units
 */
async function convert(expression: string): Promise<MathResult> {
  const math = await getMath();

  // Parse conversion expression: "5 meters to feet" or "100 celsius to fahrenheit"
  const match = expression.match(/^([\d.]+)\s*(\w+)\s+(?:to|in)\s+(\w+)$/i);
  
  if (!match) {
    return {
      mode: 'convert',
      input: expression,
      output: 'Format: "5 meters to feet" or "100 celsius to fahrenheit"',
    };
  }

  const [, valueStr, fromUnit, toUnit] = match;
  const value = parseFloat(valueStr);

  if (math) {
    try {
      const result = math.evaluate(`${value} ${fromUnit} to ${toUnit}`);
      return {
        mode: 'convert',
        input: expression,
        output: math.format(result, { notation: 'fixed', precision: 4 }),
        steps: [
          `${value} ${fromUnit} = ${math.format(result, { notation: 'fixed', precision: 4 })}`,
        ],
      };
    } catch {
      // Fall through to manual conversion
    }
  }

  // Manual conversion for common units
  const converted = manualConvert(value, fromUnit.toLowerCase(), toUnit.toLowerCase());
  if (converted !== null) {
    return {
      mode: 'convert',
      input: expression,
      output: `${converted.toFixed(4)} ${toUnit}`,
      steps: [
        `${value} ${fromUnit} = ${converted.toFixed(4)} ${toUnit}`,
      ],
    };
  }

  return {
    mode: 'convert',
    input: expression,
    output: 'Conversion not supported for these units',
  };
}

/**
 * Manual conversion for common units
 */
function manualConvert(value: number, from: string, to: string): number | null {
  const conversions: Record<string, Record<string, number>> = {
    // Length
    meters: { feet: 3.28084, inches: 39.3701, km: 0.001, miles: 0.000621371, cm: 100 },
    feet: { meters: 0.3048, inches: 12, km: 0.0003048, miles: 0.000189394 },
    km: { meters: 1000, feet: 3280.84, miles: 0.621371 },
    miles: { km: 1.60934, meters: 1609.34, feet: 5280 },
    
    // Temperature (special handling)
    celsius: { fahrenheit: -999, kelvin: -999 },
    fahrenheit: { celsius: -999, kelvin: -999 },
    
    // Weight
    kg: { pounds: 2.20462, grams: 1000, oz: 35.274 },
    pounds: { kg: 0.453592, grams: 453.592, oz: 16 },
    grams: { kg: 0.001, pounds: 0.00220462, oz: 0.035274 },
  };

  // Handle temperature separately
  if (from === 'celsius' && to === 'fahrenheit') {
    return (value * 9/5) + 32;
  }
  if (from === 'fahrenheit' && to === 'celsius') {
    return (value - 32) * 5/9;
  }
  if (from === 'celsius' && to === 'kelvin') {
    return value + 273.15;
  }
  if (from === 'kelvin' && to === 'celsius') {
    return value - 273.15;
  }

  // Standard conversions
  const fromConversions = conversions[from];
  if (fromConversions && fromConversions[to]) {
    return value * fromConversions[to];
  }

  return null;
}

// ============================================================================
// Explanation
// ============================================================================

/**
 * Explain a math concept (returns a structured explanation for AI to expand)
 */
async function explain(concept: string): Promise<MathResult> {
  const explanations: Record<string, { output: string; steps: string[] }> = {
    derivative: {
      output: 'A derivative measures the rate of change of a function.',
      steps: [
        'Definition: f\'(x) = lim(h→0) [f(x+h) - f(x)] / h',
        '',
        'Common Rules:',
        '  Power Rule: d/dx[xⁿ] = n·xⁿ⁻¹',
        '  Product Rule: d/dx[f·g] = f\'g + fg\'',
        '  Quotient Rule: d/dx[f/g] = (f\'g - fg\') / g²',
        '  Chain Rule: d/dx[f(g(x))] = f\'(g(x))·g\'(x)',
        '',
        'Examples:',
        '  d/dx[x²] = 2x',
        '  d/dx[sin(x)] = cos(x)',
        '  d/dx[eˣ] = eˣ',
      ],
    },
    integral: {
      output: 'An integral calculates area under a curve or accumulated change.',
      steps: [
        'Indefinite: ∫f(x)dx = F(x) + C  (antiderivative)',
        'Definite: ∫ₐᵇf(x)dx = F(b) - F(a)  (area)',
        '',
        'Common Integrals:',
        '  ∫xⁿdx = xⁿ⁺¹/(n+1) + C  (n ≠ -1)',
        '  ∫eˣdx = eˣ + C',
        '  ∫sin(x)dx = -cos(x) + C',
        '  ∫cos(x)dx = sin(x) + C',
        '  ∫1/x dx = ln|x| + C',
        '',
        'Techniques: Substitution, Integration by Parts, Partial Fractions',
      ],
    },
    probability: {
      output: 'Probability measures the likelihood of an event occurring.',
      steps: [
        'Basic Formula: P(A) = favorable outcomes / total outcomes',
        '',
        'Rules:',
        '  P(not A) = 1 - P(A)',
        '  P(A or B) = P(A) + P(B) - P(A and B)',
        '  P(A and B) = P(A) × P(B|A)',
        '  Independent: P(A and B) = P(A) × P(B)',
        '',
        'Key Distributions:',
        '  Binomial: Fixed trials, success/failure',
        '  Normal: Continuous, bell-shaped curve',
        '  Poisson: Rare events over time/space',
        '',
        'Try: "coin flip", "dice", "binomial", "normal distribution"',
      ],
    },
    statistics: {
      output: 'Statistics involves collecting, analyzing, and interpreting data.',
      steps: [
        'Central Tendency:',
        '  Mean: Sum of values / count',
        '  Median: Middle value (sorted)',
        '  Mode: Most frequent value',
        '',
        'Spread:',
        '  Range: Max - Min',
        '  Variance: Average of squared deviations',
        '  Standard Deviation: √Variance',
        '',
        'Inference:',
        '  Confidence Interval: Range for population parameter',
        '  Hypothesis Testing: Test claims about population',
        '  Z-score: (value - mean) / std dev',
        '',
        'Try providing data: "mean of 10, 20, 30, 40, 50"',
      ],
    },
    quadratic: {
      output: 'ax² + bx + c = 0 solved using the quadratic formula.',
      steps: [
        'Quadratic Formula: x = (-b ± √(b² - 4ac)) / 2a',
        '',
        'Discriminant (b² - 4ac):',
        '  > 0: Two distinct real roots',
        '  = 0: One repeated real root',
        '  < 0: Two complex conjugate roots',
        '',
        'Example: x² - 5x + 6 = 0',
        '  a=1, b=-5, c=6',
        '  x = (5 ± √(25-24)) / 2 = (5 ± 1) / 2',
        '  x = 3 or x = 2',
      ],
    },
    factorial: {
      output: 'n! is the product of all positive integers up to n.',
      steps: [
        'Definition: n! = n × (n-1) × (n-2) × ... × 2 × 1',
        '0! = 1 (by definition)',
        '',
        'Examples:',
        '  5! = 5 × 4 × 3 × 2 × 1 = 120',
        '  10! = 3,628,800',
        '',
        'Used in:',
        '  Permutations: P(n,r) = n!/(n-r)!',
        '  Combinations: C(n,r) = n!/[r!(n-r)!]',
        '  Probability calculations',
      ],
    },
    logarithm: {
      output: 'log_b(x) answers: "b raised to what power gives x?"',
      steps: [
        'Definition: If b^y = x, then log_b(x) = y',
        '',
        'Common Bases:',
        '  log₁₀ (common log): log₁₀(100) = 2',
        '  ln (natural log, base e): ln(e) = 1',
        '  log₂ (binary log): log₂(8) = 3',
        '',
        'Properties:',
        '  log(a×b) = log(a) + log(b)',
        '  log(a/b) = log(a) - log(b)',
        '  log(aⁿ) = n × log(a)',
        '  log_b(a) = ln(a) / ln(b)  (change of base)',
      ],
    },
    trigonometry: {
      output: 'Trigonometry studies relationships in triangles.',
      steps: [
        'Right Triangle (SOH-CAH-TOA):',
        '  sin(θ) = opposite / hypotenuse',
        '  cos(θ) = adjacent / hypotenuse',
        '  tan(θ) = opposite / adjacent',
        '',
        'Unit Circle Values:',
        '  sin(0°) = 0, sin(30°) = 1/2, sin(45°) = √2/2, sin(90°) = 1',
        '  cos(0°) = 1, cos(30°) = √3/2, cos(45°) = √2/2, cos(90°) = 0',
        '',
        'Identities:',
        '  sin²(θ) + cos²(θ) = 1',
        '  tan(θ) = sin(θ)/cos(θ)',
        '  sin(2θ) = 2sin(θ)cos(θ)',
      ],
    },
    matrix: {
      output: 'Matrices are rectangular arrays of numbers.',
      steps: [
        'Operations:',
        '  Addition: Element-wise (same dimensions)',
        '  Multiplication: (m×n) × (n×p) = (m×p)',
        '  Transpose: Rows become columns',
        '',
        'Properties:',
        '  Determinant: Scalar value, det(A)',
        '  Inverse: A × A⁻¹ = I (identity)',
        '  Eigenvalues: λ where Av = λv',
        '',
        'Applications:',
        '  Linear systems, transformations, machine learning',
      ],
    },
    limits: {
      output: 'A limit describes the value a function approaches.',
      steps: [
        'Notation: lim(x→a) f(x) = L',
        '',
        'Techniques:',
        '  Direct substitution (if continuous)',
        '  Factoring and canceling',
        '  L\'Hôpital\'s Rule (0/0 or ∞/∞)',
        '  Rationalization',
        '',
        'Special Limits:',
        '  lim(x→0) sin(x)/x = 1',
        '  lim(x→∞) (1 + 1/x)^x = e',
        '  lim(x→0) (eˣ - 1)/x = 1',
      ],
    },
    vectors: {
      output: 'Vectors have magnitude and direction.',
      steps: [
        'Notation: v = ⟨a, b, c⟩ or aî + bĵ + ck̂',
        '',
        'Operations:',
        '  Magnitude: |v| = √(a² + b² + c²)',
        '  Dot Product: u·v = |u||v|cos(θ)',
        '  Cross Product: u×v = perpendicular vector',
        '',
        'Properties:',
        '  Unit Vector: v̂ = v / |v|',
        '  Parallel: u × v = 0',
        '  Perpendicular: u · v = 0',
      ],
    },
  };

  const lowerConcept = concept.toLowerCase();
  
  for (const [key, explanation] of Object.entries(explanations)) {
    if (lowerConcept.includes(key)) {
      return {
        mode: 'explain',
        input: concept,
        output: explanation.output,
        steps: [`📚 ${key.charAt(0).toUpperCase() + key.slice(1)}`, '', ...explanation.steps],
      };
    }
  }

  // If no specific concept found, provide general guidance
  return {
    mode: 'explain',
    input: concept,
    output: `I can explain many math concepts! Try asking about:`,
    steps: [
      '📚 Available Topics:',
      '',
      'Calculus: derivative, integral, limits',
      'Algebra: quadratic, logarithm, factorial',
      'Probability: probability, statistics, binomial, normal',
      'Geometry: trigonometry, vectors, matrix',
      '',
      'Or ask a specific question:',
      '  "What is a derivative?"',
      '  "Explain probability"',
      '  "How does the quadratic formula work?"',
      '',
      'For calculations, try:',
      '  "5!" (factorial)',
      '  "10 choose 3" (combinations)',
      '  "binomial n=10 k=3 p=0.5"',
      '  "mean of 10, 20, 30, 40, 50"',
    ],
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Clean a mathematical expression for evaluation
 */
function cleanExpression(expr: string): string {
  return expr
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/\^/g, '**')
    .replace(/\s+/g, '')
    .replace(/,/g, '');  // Remove thousands separators
}

/**
 * Safe eval for basic expressions (fallback when mathjs not available)
 */
function safeEval(expr: string): string {
  // Only allow safe characters
  if (!/^[\d+\-*/().%\s]+$/.test(expr)) {
    throw new Error('Invalid characters in expression');
  }

  try {
    // Use Function constructor instead of eval for slightly better isolation
    const result = new Function(`return (${expr})`)();
    return String(result);
  } catch (error) {
    throw new Error('Invalid expression');
  }
}

/**
 * Parse an equation into components
 */
function parseEquation(equation: string): { type: 'linear' | 'quadratic'; a: number; b: number; c: number } | null {
  // Clean up the equation
  const cleaned = equation.replace(/\s+/g, '').toLowerCase();

  // Try to match quadratic: ax² + bx + c = 0 or ax^2 + bx + c = 0
  const quadMatch = cleaned.match(/^(-?\d*)x[\^²]2?([+-]\d*)x([+-]\d+)?=0$/);
  if (quadMatch) {
    const a = parseCoefficient(quadMatch[1]);
    const b = parseCoefficient(quadMatch[2]);
    const c = parseCoefficient(quadMatch[3] || '0');
    return { type: 'quadratic', a, b, c };
  }

  // Try to match linear: ax + b = c
  const linMatch = cleaned.match(/^(-?\d*)x([+-]\d+)?=(-?\d+)$/);
  if (linMatch) {
    const a = parseCoefficient(linMatch[1]);
    const b = parseCoefficient(linMatch[2] || '0');
    const c = parseFloat(linMatch[3]);
    return { type: 'linear', a, b, c };
  }

  return null;
}

/**
 * Parse a coefficient string
 */
function parseCoefficient(str: string): number {
  if (!str || str === '+') return 1;
  if (str === '-') return -1;
  return parseFloat(str);
}

// ============================================================================
// Wolfram Alpha Integration (Optional)
// ============================================================================

/**
 * Query Wolfram Alpha Short Answers API (requires AppID)
 */
export async function queryWolfram(
  query: string,
  appId: string
): Promise<string | null> {
  if (!appId) {
    return null;
  }

  // Rate limit
  const rateCheck = checkRateLimit('wolfram', 5, 60000);
  if (!rateCheck.isValid) {
    throw new Error(rateCheck.reason);
  }

  try {
    const params = new URLSearchParams({
      appid: appId,
      i: query,
      units: 'metric',
    });

    const response = await fetch(
      `http://api.wolframalpha.com/v1/result?${params}`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (!response.ok) {
      return null;
    }

    return await response.text();
  } catch {
    return null;
  }
}

/**
 * Enhanced math query with Wolfram Alpha
 */
export async function processMathWithWolfram(
  input: string,
  mode: MathMode,
  wolframAppId?: string
): Promise<MathResult> {
  // First try local computation
  const localResult = await processMath(input, mode);

  // If Wolfram AppID is provided, try to enhance with Wolfram
  if (wolframAppId) {
    const wolframResult = await queryWolfram(input, wolframAppId);
    if (wolframResult) {
      localResult.wolfram = wolframResult;
    }
  }

  return localResult;
}
