# LikuBuddy Chess AI: Optimization & Playability Suggestions

This document outlines a roadmap for elevating the LikuBuddy Chess AI from a basic Minimax implementation to a robust, high-performance engine with improved playability.

## 1. Search Algorithm Optimizations
*Current State: Basic Minimax with Alpha-Beta Pruning and Quiescence Search.*

### A. Transposition Tables (Zobrist Hashing)
**Impact: High**
- **Problem:** The engine currently re-analyzes the same position multiple times if reached via different move orders (e.g., `1. e4 e5 2. Nf3` vs `1. Nf3 e5 2. e4`).
- **Solution:** Implement Zobrist Hashing to generate a unique ID for every board state. Store evaluation results in a hash map (Transposition Table).
- **Benefit:** Drastically reduces the search tree size, allowing for deeper searches in the same amount of time.

### B. Iterative Deepening
**Impact: High (Critical for Time Management)**
- **Problem:** Currently, the AI searches to a fixed depth (e.g., Depth 3). If Depth 4 takes too long, it might hang or exceed time limits.
- **Solution:** Search Depth 1, then Depth 2, then Depth 3, etc. Check the clock after every iteration.
- **Benefit:** 
    - **Responsiveness:** The AI can always return the "best move found so far" if the time limit is hit.
    - **Ordering:** The best move from Depth $N$ serves as the first move to search in Depth $N+1$, improving pruning.

### C. Advanced Move Ordering
**Impact: Medium**
- **Problem:** Alpha-Beta pruning works best when good moves are searched first. Currently, we likely only prioritize captures.
- **Solution:**
    - **Killer Heuristic:** Store moves that caused a cutoff at the same tree depth in sibling nodes. Try them early.
    - **History Heuristic:** Track which moves are generally good across the entire search tree.
- **Benefit:** Increases the number of "cutoffs," effectively making the engine faster.

## 2. Evaluation Function Enhancements
*Current State: Material count + basic Piece-Square Tables.*

### A. Tapered Evaluation
**Impact: Medium**
- **Problem:** A King in the center is bad in the Opening but good in the Endgame. Static weights don't reflect this.
- **Solution:** Interpolate between "Opening Weights" and "Endgame Weights" based on the amount of material remaining on the board.
- **Benefit:** Smarter positional play; the AI will know when to attack and when to centralize the King.

### B. Pawn Structure & King Safety
**Impact: Medium**
- **Problem:** The AI may accept doubled pawns or expose its King to grab a pawn.
- **Solution:** 
    - Penalize doubled, isolated, and backward pawns.
    - Bonus for "passed pawns" (no enemy pawns ahead).
    - Penalize King movement if pawn shield is missing (in middlegame).

## 3. Architecture & Performance
*Current State: Worker Thread (newly added).*

### A. Opening Book
**Impact: High (Playability)**
- **Problem:** The AI calculates opening moves from scratch, which can be slow and lead to weird, non-standard openings.
- **Solution:** Integrate a small JSON-based opening book (e.g., 500 common lines).
- **Benefit:** Instant moves in the opening (0ms latency), playing "book" lines like Ruy Lopez or Sicilian Defense correctly.

### B. SharedArrayBuffer (Worker Communication)
**Impact: Low/Medium**
- **Problem:** Sending the board state to the Worker involves serialization (JSON/copying).
- **Solution:** Use `SharedArrayBuffer` to share the board memory between the UI thread and the AI Worker.
- **Benefit:** Zero-copy communication, slightly faster overhead for search iterations.

## 4. User Experience (Playability)

### A. "Pondering" (Thinking on Opponent's Turn)
- **Idea:** While the human is thinking, the AI should assume the human will make the best move and start calculating its response *before* the human moves.
- **Benefit:** AI feels faster and stronger.

### B. Explainability (Principal Variation)
- **Idea:** When the AI plays a move, display the "line" it calculated (e.g., "I played e4 because I expect e5, then Nf3...").
- **Benefit:** Helps users learn *why* a move is good (Liku Learn feature).

### C. Adaptive Difficulty
- **Idea:** Instead of just limiting depth (which makes the AI blunder randomly), add "noise" to the evaluation function for lower levels.
- **Benefit:** The AI plays "human-like" mistakes rather than just not seeing 2 moves ahead.

## Implementation Priority Roadmap

1.  **Iterative Deepening** (Fixes timeouts/hangs reliably).
2.  **Opening Book** (Immediate UX improvement).
3.  **Transposition Tables** (Performance boost).
4.  **Evaluation Improvements** (Positional understanding).
