# Chess Feature Review

## Summary
The Chess implementation in LikuBuddy has a functional UI and input system, but the AI opponent is critically unreliable, causing the game to hang indefinitely.

## Playthrough Log
- **Launch**: Successful via `npm start`.
- **Navigation**: Menu navigation to Chess works correctly.
- **Mode Switching**: `TAB` key correctly toggles Text Mode.
- **Gameplay**:
    - **Move 1**: `e4` (White) -> `e6` (Black) [French Defense] - OK
    - **Move 2**: `d4` (White) -> `d5` (Black) - OK
    - **Move 3**: `Nc3` (White) -> `Nf6` (Black) - OK
    - **Move 4**: `Bg5` (White) -> **HANG** (Black)
        - AI status: "AI thinking..."
        - State file timestamp frozen.
        - Attempted fix: Sent `hint` command.
        - Result: AI played `dxe4` after delay/hint.
    - **Move 5**: `Nxe4` (White) -> **HANG** (Black)
        - AI status: "AI thinking..."
        - State file timestamp frozen.
        - Attempted fix: Sent `hint` command.
        - Result: No response. Game remained frozen.

## Key Findings

### Positives
1. **Text Mode Input**: The SAN input system (`e4`, `Nf3`) works flawlessly. It correctly parses moves and updates the board.
2. **State Monitoring**: The `likubuddy-state.txt` file provides excellent real-time visibility into the game state, including FEN, history, and legal moves.
3. **Visuals**: The ASCII board representation in the state file is accurate and helpful.

### Critical Issues
1. **AI Hangs**: The AI opponent frequently enters an infinite loop or deadlock state.
    - **Root Cause Analysis**: The `quiescence` search in `ChessSearch.ts` **does not check the time limit**. If the search enters a complex capture sequence, it can run indefinitely (or for a very long time) without yielding, blocking the main thread.
    - **Impact**: The entire application freezes, including UI updates and input processing.
2. **Unresponsiveness**: When the AI hangs, the main game loop appears to block, preventing graceful exit via `ESC` in some cases.

## Recommendations
1. **Fix Quiescence Search**: Add `shouldStop()` checks within the `quiescence` loop in `ChessSearch.ts` to respect the time limit.
2. **Async AI**: Move the AI calculation to a Worker thread to prevent blocking the main UI thread.
3. **Watchdog**: Implement a watchdog timer that resets the AI or forces a random move if it takes longer than 5 seconds.
4. **Logging**: Add debug logs to `likubuddy-state.txt` or a separate log file to capture the AI's internal state during these hangs.

## Conclusion
The Chess feature is **Not Ready** for general release due to the game-breaking AI freeze bug. The UI and Input layers are solid, but the core gameplay loop is broken.
