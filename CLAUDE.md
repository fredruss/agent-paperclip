# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claude Code Companion is a desktop pet application that displays Claude Code's real-time status in a floating window. It uses Claude Code hooks to capture tool usage events and displays them via an animated mascot.

## Commands

All commands run from the `app/` directory:

```bash
cd app
npm install         # Install dependencies
npm run dev         # Run in development mode (hot reload)
npm run build       # Build for production
npm run start       # Run built app
npm run lint        # Run ESLint
```

**Always run `npm run lint` after making code changes.**

## Architecture

```
Claude Code (Terminal) --[hooks]--> ~/.claude-companion/status.json <--[chokidar]-- Desktop Pet (Electron)
```

### Hook System (`hooks/status-reporter.js`)
- Node.js script that receives Claude Code events via stdin as JSON
- Maps tool names to pet states (`working`, `reading`, `idle`, `done`, `error`)
- Writes status to `~/.claude-companion/status.json`
- Handles events: `PreToolUse`, `PostToolUse`, `Stop`, `SessionStart`, `SessionEnd`

### Electron App (`app/`)

**Main Process** (`src/main/index.ts`):
- Creates frameless, transparent, always-on-top window
- Watches status.json with chokidar
- Sends status updates to renderer via IPC

**Preload** (`src/preload/index.ts`):
- Exposes `electronAPI` to renderer: `getStatus()`, `onStatusUpdate()`, `startDrag()`

**Renderer** (`src/renderer/`):
- React app with `Pet` component (SVG-based animated faces)
- `StatusBubble` shows current action text
- `useStatus` hook receives IPC updates
- `useStateTransition` handles animation between states

**Shared Types** (`src/shared/types.ts`):
- `PetState`: `'idle' | 'working' | 'reading' | 'done' | 'error'`
- `Status`: `{ status: PetState, action: string, timestamp: number }`

## Code Guidelines

### React Best Practices

**Components should mostly render** - Keep components focused on rendering. Extract stateful logic, animations, and side effects into custom hooks.

**useEffect for external systems only** - Only use useEffect for synchronizing with external systems (IPC, file watchers, timers). All effects must have proper cleanup.

**Custom hooks for reusable logic**:
- `useStateTransition` - Handles fade transitions between states
- `useAutoHide` - Handles visibility with timeout
- `useStatus` - Handles IPC communication with main process

### Type Management

**Use shared types** - All shared types live in `src/shared/types.ts`. Import from there in both preload and renderer to avoid type drift.

**Re-export for convenience** - Hooks can re-export types they use (e.g., `useStatus` re-exports `Status`).

### File Organization

**Barrel exports** - Use `index.ts` files in `components/` and `hooks/` for clean imports:
```typescript
import { Pet, StatusBubble } from './components'
import { useStatus } from './hooks'
```

**Flat structure is appropriate** - This is a single-feature app. Don't over-engineer with `features/` folders.

**Keep feature code close** - Related code stays together. No grab-bag utility folders.

### Avoid Over-Engineering

- Don't add features beyond what's requested
- Don't add error handling for scenarios that can't happen
- Don't create abstractions for one-time operations
- Three similar lines of code is better than a premature abstraction

## Hook Installation

To use with Claude Code, add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "node /path/to/hooks/status-reporter.js" }] }],
    "PostToolUse": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "node /path/to/hooks/status-reporter.js" }] }],
    "Stop": [{ "hooks": [{ "type": "command", "command": "node /path/to/hooks/status-reporter.js" }] }]
  }
}
```
