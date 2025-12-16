# Chess Session Review

## Root Cause Identified (Build After This Fix)

**LikuTUI was overwriting Chess state logs!**

In `LikuTUI.tsx`, the `gameComponents` array only included `['snake', 'tictactoe', 'dinorun']`. When Chess was active, LikuTUI continued logging its placeholder "(Game or Sub-screen Active)" which overwrote whatever Chess logged.

**Fix applied**: Added `'chess', 'hangman', 'sudoku'` to the `gameComponents` array so LikuTUI stops logging when these games are active.

**Visual bug fix**: Black pieces on dark squares were using `blackBright` which is invisible on gray backgrounds. Changed to `red` for visibility.

## Attempt Summary
- Rebuilt once more, launched with `npm start` (PID 26064), and navigated through *Let's Play → Chess vs AI* via the documented Navigate → Poll → Enter pattern.
- Entered text mode (`{TAB}`), played `e4` followed by `{ENTER}`, and immediately saw `STATUS: AI played e6` plus the correct French Defence FEN (`rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2`). A second move `d4` → `{ENTER}` triggered `AI played d5`, confirming that both player and AI moves now log automatically without the hint/new hack.
- The only remaining UI quirk is the initial placeholder: upon entering Chess the state file still shows “(Game or Sub-screen Active)” until the first move lands.
- Text-mode UX feels smoother: the status line shows each move, and errors are surfaced inline (though sending an `N…` SAN without text-mode focus can still hit the global “New game” shortcut).
- WebSocket requests `client.query('gameState')` and `client.query('gamestate')` continue to time out, leaving file logging as the sole telemetry source.

## Key Findings
1. **Move logging is now reliable.** Every move (human or AI) writes the full board, FEN, history, and status immediately after `{ENTER}`.
2. **Initial snapshot still missing.** The chess screen doesn’t emit a log until the first move, so observers remain blind between the menu and move one.
3. **WebSocket gamestate query remains broken.** Both camelCase and lowercase queries still return “Query timeout,” so there’s no network fallback despite the router changes.

## Areas for Improvement
- **Emit a snapshot when the chess screen loads.** Mirror the first-move logging so `likubuddy-state.txt` shows the initial board as soon as Chess mounts.
- **Finish wiring the gamestate query.** Ensure the router responds to `gameState`/`gamestate` so agents can poll the board without relying on the file.
- **Guard hotkeys while typing.** Ignore global shortcuts like `n`/`N` when the text-input field has focus to prevent accidental resets while entering SAN moves.
