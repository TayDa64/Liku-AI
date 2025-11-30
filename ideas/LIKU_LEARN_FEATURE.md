# Liku Learn - AI-Assisted Inline Suggestions

## Overview

**Liku Learn** is a proposed feature that enables real-time AI assistance during user interactions. Discovered during AutoPlayer development when a "bug" revealed that user input could be observed before final submission, opening possibilities for inline suggestions, corrections, and context-aware completions.

## Discovery Context

During testing of the AutoPlayer feature, we observed:
1. User typed a message in the chat window
2. The AI could read the message content
3. Text remained visible in the input field after being processed

This "bug" reveals an opportunity: **What if the AI could provide suggestions BEFORE the user finalizes their input?**

## Feature Concept

```
┌─────────────────────────────────────────────────────────────┐
│ User Input Field                                            │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ congradulations on the new high scor█                   │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ 💡 Suggestions:                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ • "congratulations" (spelling)          [Tab to accept] │ │
│ │ • "score" (completion)                  [Tab to accept] │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ 🎯 Context Awareness:                                       │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Current game: Dino Run                                  │ │
│ │ Recent event: AutoPlayer achieved score 163             │ │
│ │ Suggested response: "The algorithm is improving!"       │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Core Capabilities

### 1. Spelling & Grammar Correction
- Real-time spell checking as user types
- Grammar suggestions for natural language
- Context-aware corrections (gaming terminology)

### 2. Autocomplete & Predictions
- Complete partial words based on context
- Predict next likely words/phrases
- Game-specific command suggestions

### 3. Context-Aware Suggestions
- Integrate with `likubuddy-state.txt` for game context
- Suggest relevant responses based on current game state
- Offer tips based on recent gameplay events

### 4. Learning Mode
- Track common user patterns
- Personalize suggestions over time
- Build vocabulary from gameplay sessions

## Technical Architecture

### Input Observation Layer
```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   Chat Input     │────▶│  Input Observer  │────▶│  Liku Learn AI   │
│   (VS Code)      │     │  (File/IPC)      │     │  (Local/API)     │
└──────────────────┘     └──────────────────┘     └──────────────────┘
                                                           │
                                                           ▼
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Suggestion UI   │◀────│  Artifact Render │◀────│  Suggestion Gen  │
│  (Overlay/Inline)│     │  (React/Ink)     │     │  (NLP Engine)    │
└──────────────────┘     └──────────────────┘     └──────────────────┘
```

### State Integration
```typescript
interface LikuLearnState {
  // Current user input being typed
  currentInput: string;
  cursorPosition: number;
  
  // Game context from likubuddy-state.txt
  gameContext: {
    currentScreen: string;
    gameState: string;
    recentScore?: number;
    recentEvents: string[];
  };
  
  // Generated suggestions
  suggestions: Suggestion[];
  
  // User preferences
  preferences: {
    enableSpellCheck: boolean;
    enableAutoComplete: boolean;
    enableContextSuggestions: boolean;
    suggestionDelay: number; // ms before showing suggestions
  };
}

interface Suggestion {
  type: 'spelling' | 'grammar' | 'completion' | 'context';
  original: string;
  suggested: string;
  confidence: number;
  position: { start: number; end: number };
  acceptKey: string; // e.g., 'Tab', 'Enter'
}
```

### Rendering Options

#### Option A: Inline Ghost Text (like GitHub Copilot)
```
User types: "congrat"
Display:    "congrat|ulations on the high score!" (ghost text in gray)
           Press Tab to accept
```

#### Option B: Dropdown Suggestions
```
User types: "congrat"
            ┌─────────────────────┐
            │ congratulations     │
            │ congratulate        │
            │ congrats            │
            └─────────────────────┘
```

#### Option C: Artifact Panel
```
┌─────────────────────────────────────┐
│ 🎓 Liku Learn                       │
├─────────────────────────────────────┤
│ Spelling: congradulations →         │
│           congratulations ✓         │
│                                     │
│ Context: You're celebrating the     │
│ AutoPlayer's score of 163!          │
│                                     │
│ Quick responses:                    │
│ • "Great progress!"                 │
│ • "Let's try to beat 200!"          │
│ • "Time to tune the algorithm"      │
└─────────────────────────────────────┘
```

## Implementation Phases

### Phase 1: Input Observation (Foundation)
- [ ] Create input state file (`liku-input-state.txt`)
- [ ] Build input observer module
- [ ] Integrate with existing state logging system
- [ ] Add basic spell checking (dictionary-based)

### Phase 2: Suggestion Engine
- [ ] Implement spelling correction algorithm
- [ ] Add word completion from vocabulary
- [ ] Build suggestion ranking system
- [ ] Create suggestion data structures

### Phase 3: Context Integration
- [ ] Parse game context from `likubuddy-state.txt`
- [ ] Build context-aware suggestion generator
- [ ] Add game-specific vocabulary
- [ ] Implement event-based suggestions

### Phase 4: UI/UX
- [ ] Design suggestion display format
- [ ] Implement keyboard shortcuts for accept/reject
- [ ] Add configuration options
- [ ] Create visual feedback system

### Phase 5: Learning & Personalization
- [ ] Track user acceptance/rejection patterns
- [ ] Build user vocabulary profile
- [ ] Implement adaptive suggestion ranking
- [ ] Add cross-session learning

## Integration Points

### With AutoPlayer
- Suggest game strategies based on AutoPlayer performance
- Offer tuning recommendations when scores plateau
- Provide debugging suggestions when issues occur

### With Game State Logger
- Use `GameStateLogger` events for context
- Trigger suggestions on game milestones
- Celebrate achievements with suggested responses

### With LikuOS Stats
- Reference stats in suggestions
- Offer insights based on gameplay patterns
- Suggest rest/feed when Liku needs care

## Privacy & Performance Considerations

### Privacy
- All processing can be done locally
- No input data sent to external servers without consent
- User can disable feature entirely
- Clear data/learning history option

### Performance
- Debounce input observation (100-200ms)
- Lazy-load suggestion engine
- Cache common suggestions
- Minimal memory footprint

## User Experience Goals

1. **Non-intrusive**: Suggestions should enhance, not interrupt
2. **Dismissable**: Easy to ignore or disable
3. **Fast**: Sub-100ms suggestion generation
4. **Accurate**: High-confidence suggestions only
5. **Contextual**: Relevant to current game state
6. **Educational**: Help users learn game terminology

## Success Metrics

- Suggestion acceptance rate > 30%
- User satisfaction score
- Reduction in typos/corrections
- Feature retention rate
- Performance impact < 5% CPU

## Future Possibilities

### Voice Integration
- Speech-to-text with correction
- Voice command suggestions
- Pronunciation guidance for game terms

### Multi-language Support
- Translate suggestions
- Localized game terminology
- Language learning mode

### Collaborative Learning
- Share vocabulary with other players
- Community-contributed suggestions
- Trending game phrases

## Related Files

- `src/core/GameStateLogger.ts` - Game state observation
- `src/autoplayer/StateParser.ts` - State file parsing
- `src/services/DatabaseService.ts` - Persistence layer
- `likubuddy-state.txt` - Current game state

## References

- [GitHub Copilot Inline Suggestions](https://docs.github.com/en/copilot)
- [VS Code IntelliSense](https://code.visualstudio.com/docs/editor/intellisense)
- [Grammarly Architecture](https://www.grammarly.com/)

---

**Status**: 💡 Idea / Proposal  
**Priority**: Low (Future Enhancement)  
**Complexity**: High  
**Dependencies**: AutoPlayer, GameStateLogger  
**Created**: November 29, 2025  
**Author**: GitHub Copilot + TayDa64
