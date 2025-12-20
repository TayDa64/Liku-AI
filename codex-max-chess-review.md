!!# Codex Chess Review (Liku-AI)

## Outcome
- Played as White to a checkmate win (final sequence: promoted a-pawn, then delivered mate with king + new queen after 50...Kg6 51.Qg5#).
- Rescued position after early queen blunder by leaning on state log and clean UCI key inputs.

## Observed Playability & UX
- Text mode rejects multi-letter SAN strings as a single key input; each character must be sent separately, making mistakes more likely.
- `chess_move` WebSocket action requires `sessionId`, but the CLI helper does not expose/obtain it, forcing slower key-entry even though the state recommendations mention `chess_move`.
- Error feedback from the CLI is generic (“Server error”), obscuring whether the issue is invalid move, missing session, or rate limit.
- “AI thinking…” sometimes stalls with only a few legal moves visible; no progress indicator makes it unclear whether the engine is working.
- State file `likubuddy-state.txt` is reliable for move legality, check status, and evaluation; it was the primary way to steer after losing the first queen.
- Cursor/text toggle works, but uppercase SAN in text mode is fragile; UCI-style lowercase moves avoid piece-letter case pitfalls.

## Areas for Improvement (Prioritized)
1) **Action path usability**: Let `send-command.js` fetch and include the active `sessionId`, or allow chess actions without a session in single-player mode so `--action chess_move --move e4` works out of the box.  
2) **Text move input**: Add a `--text "<move>"` path that sends the whole SAN/uci string as one key event (or accept SAN strings directly in key mode) to cut input latency and typos.  
3) **Clear errors**: Return specific errors to the CLI (e.g., “invalid move”, “still in check”, “missing sessionId”) instead of a generic server error.  
4) **Thinking feedback**: Show a spinner/ETA or depth indicator during “AI thinking…” to signal progress when move generation appears slow.  
5) **Mode guidance**: When in text mode, hint that UCI-style lowercase moves are safest; optionally auto-uppercase SAN piece letters before sending.  
6) **Endgame polish**: In long endgames, occasionally remind players of remaining material or offer a “hint” prompt when advantage is large to close games faster.  
7) **CLI convenience**: Add a `--query session` option to the helper to list current game/session IDs and turn ownership, avoiding manual state parsing.

## Notes on Engine Behavior
- Check validation is strict (e.g., pinned queen on f4 could not leave the checking diagonal), which kept moves legal.
- Evaluation swings tracked correctly in the state log; mate threat recognition was consistent once promoted.

## Actionable Task List

- **WS action usability**
  - Add `gameState` query to include `sessionId` explicitly; update `send-command.js` to cache/use it for `chess_move`.
  - Loosen router guard to allow chess actions in single-player TUI without a sessionId, or auto-bind the client’s sessionId when missing.
- **Text input ergonomics**
  - Extend `send-command.js` with `--text "<move>"` to send full move strings as one payload; map SAN/uci to key events internally.
  - In the router, accept SAN strings via key commands (not just single chars) when the active screen is chess/text.
- **Error clarity**
  - Return specific error codes/messages for: missing sessionId, invalid move, still-in-check, rate limit. Surface them in CLI output instead of generic “Server error”.
- **Thinking feedback**
  - Add a lightweight spinner/progress message during engine search (depth/ply or time spent); update status line in `likubuddy-state.txt`.
- **Mode guidance**
  - On entering text mode, show a one-line tip: “Use UCI (e4, f6+) or SAN; uppercase pieces auto-corrected.” Auto-upper SAN piece letters before dispatch.
- **Endgame assist**
  - When eval > +6 and material is simple, surface a periodic “hint” prompt or best-move suggestion; optionally auto-offer quick tips in `recommendations`.
- **CLI/session introspection**
  - Add `--query session` to the helper to list active sessionId, turn, color. Document in README and quick reference.

## Suggested Plan of Action (sequence)
1) Implement `sessionId` discovery/piping in `send-command.js` and adjust router to auto-bind missing session for single-player chess.
2) Add `--text` move input path and router support for multi-char move strings; update docs/examples.
3) Improve error propagation (structured codes/messages) and update CLI to display them.
4) Add thinking feedback (spinner/depth/time) to status and state log; ensure it clears on move.
5) Improve mode guidance (text-mode tips, SAN auto-upper).
6) Add endgame hinting and recommendation tweaks for large eval leads.
7) Ship CLI `--query session` helper and document across README/QUICK_REFERENCE.
