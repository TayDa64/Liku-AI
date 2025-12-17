# AI Battle - TicTacToe AI vs AI Guide

## Overview

AI Battle is a true AI vs AI TicTacToe system where two AI players (Nova and Spark) make real strategic decisions using Google's Gemini API. Each game features unique, non-deterministic gameplay with visible AI reasoning.

## Quick Start

### Prerequisites
1. **WebSocket Server Running**: Start the server first
2. **Gemini API Key**: Set your API key in the environment

### Running AI Battle

```powershell
# Terminal 1: Start WebSocket server
node dist/websocket/cli.js

# Terminal 2: Run AI Battle
$env:GEMINI_API_KEY = "your-api-key-here"
node scripts/ai-battle.js
```

### One-liner (PowerShell)
```powershell
Start-Job -ScriptBlock { node dist/websocket/cli.js 2>&1 | Out-Null }; Start-Sleep -Seconds 2; $env:GEMINI_API_KEY = "your-key"; node scripts/ai-battle.js
```

## Command Line Options

| Option | Default | Description |
|--------|---------|-------------|
| `--series N` | 5 | Number of games in the series |
| `--delay N` | 0 | Milliseconds between moves (helps with rate limits) |
| `--verbose` | false | Show raw API responses for debugging |

### Examples

```bash
# Quick 3-game series
node scripts/ai-battle.js --series 3

# Slow-paced for visual appeal (1 second per move)
node scripts/ai-battle.js --delay 1000

# Rate-limit friendly (2 seconds between moves)
node scripts/ai-battle.js --series 3 --delay 2000

# Debug mode
node scripts/ai-battle.js --verbose
```

## AI Personas

| Player | Name | Symbol | Style | Color |
|--------|------|--------|-------|-------|
| Player 1 | Nova 🌟 | X (first game) | Strategic & Analytical | Cyan |
| Player 2 | Spark ⚡ | O (first game) | Creative & Unpredictable | Yellow |

*Note: Symbols swap each game for fairness*

## Display Features

```
═══════════════════════════════════════════════════════════════════════════════
   🤖 AI BATTLE: Nova 🌟 vs Spark ⚡   │   Powered by Gemini AI
═══════════════════════════════════════════════════════════════════════════════

   🌟 Nova: 2W   │   ⚡ Spark: 1W   │   Draws: 1   │   Game 5/5

   G1: 🌟    G2: ⚡    G3: Draw  G4: 🌟    G5
   ┌───┬───┬───┐ ┌───┬───┬───┐ ┌───┬───┬───┐ ┌───┬───┬───┐ ┌───┬───┬───┐
   │ X │ O │ X │ │ O │ X │ X │ │ X │ O │ X │ │ X │ X │ O │ │ · │ · │ · │
   ├───┼───┼───┤ ├───┼───┼───┤ ├───┼───┼───┤ ├───┼───┼───┤ ├───┼───┼───┤
   │ · │ X │ · │ │ O │ O │ X │ │ O │ X │ O │ │ O │ X │ · │ │ · │ X │ · │
   ├───┼───┼───┤ ├───┼───┼───┤ ├───┼───┼───┤ ├───┼───┼───┤ ├───┼───┼───┤
   │ O │ · │ X │ │ X │ X │ O │ │ O │ X │ O │ │ O │ X │ · │ │ · │ · │ · │
   └───┴───┴───┘ └───┴───┴───┘ └───┴───┴───┘ └───┴───┴───┘ └───┴───┴───┘

─────────────────────────────────────────────────────────────────────────────────
   💬 CHAT LOG
─────────────────────────────────────────────────────────────────────────────────
   Nova: 🎯 Center gives strategic control → [1,1]
   Spark: 🎯 Block opponent's diagonal threat → [0,2]
   Nova: 🎯 Creating fork opportunity → [2,0]
```

## Gemini API Configuration

### Model Settings
- **Model**: `gemini-2.5-flash` (latest, recommended)
- **Temperature**: 0.8 (creative but controlled)
- **Max Tokens**: 300

### Rate Limits (Free Tier)
| Limit Type | Value |
|------------|-------|
| Requests/minute | 15 |
| Requests/day | 1,500 |
| Tokens/minute | 1,000,000 |

**Recommended Settings for Free Tier:**
```bash
# Stay under rate limits with delays
node scripts/ai-battle.js --series 3 --delay 5000  # 5 seconds between moves
```

### Fallback Behavior
When API calls fail (rate limits, errors), the AI falls back to:
1. **Strategic fallback** with parsed reasoning if available
2. **Priority-based selection**: Center → Corners → Edges
3. **Emergency fallback**: First available cell

## Error Logging

Errors are logged to `ai-battle-errors.log` in the project root:
```powershell
# Check for errors
Get-Content ai-battle-errors.log | Select-Object -Last 10
```

## Architecture

```
┌─────────────────┐     WebSocket      ┌─────────────────┐
│   Nova (Host)   │◄──────────────────►│  WebSocket      │
│   AIPlayer      │                    │  Server         │
└─────────────────┘                    │  :3847          │
                                       └────────┬────────┘
┌─────────────────┐     WebSocket              │
│  Spark (Joiner) │◄───────────────────────────┘
│   AIPlayer      │
└─────────────────┘

          │
          ▼ Gemini API
┌─────────────────────────────────────────────┐
│  getAIMove(board, symbol, persona, moveNum) │
│  getAIGreeting(persona, opponent, gameNum)  │
│  getAIGameOverMessage(persona, result)      │
└─────────────────────────────────────────────┘
```

## Key Files

| File | Purpose |
|------|---------|
| `scripts/ai-battle.js` | Main AI battle script |
| `dist/websocket/cli.js` | WebSocket server |
| `ai-battle-errors.log` | API error log (generated) |

## Next Steps: Chess Integration

The AI Battle architecture is designed to be game-agnostic. For Chess:

1. **Board representation**: Replace 3x3 array with 8x8 FEN string
2. **Move format**: Use algebraic notation (e.g., "e2-e4")
3. **Prompt engineering**: Add Chess-specific rules and strategy
4. **Game validation**: Integrate with chess.js for legal move validation

### Chess Prompt Template (Future)
```
You are ${persona.name}, playing Chess as "${color}".

Position (FEN): rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1

Legal moves: e7-e5, d7-d5, Nf6, Nc6, ...

Reply with:
THINK: [brief strategic reasoning]
PLAY: [algebraic notation move]
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "ECONNREFUSED" | Start WebSocket server first |
| "429 Too Many Requests" | Increase `--delay` or wait for quota reset |
| "Available move" instead of AI reasoning | API rate limited - using fallback |
| Empty boards | Ensure both players connected successfully |

---

**Version**: 1.0.0  
**Last Updated**: December 2025  
**Powered by**: Google Gemini API + LikuBuddy WebSocket Infrastructure
