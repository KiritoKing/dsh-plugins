# @chlrc/dsh-client-continue

A native **Continue / 继续** composer button and remappable command for DSH `0.2.0-rc.2`. It submits the visible message `继续` through ordinary prompt admission; it is **not** rollback or exact request replay.

## Usage

Once published, install `@chlrc/dsh-client-continue` with DSH's plugin manager. Its bundle patch adds the browser plugin without replacing built-in UI. This repository does not install it into an existing profile automatically.

The button appears after a model error, token-limit ending, or user stop. Open the native shortcut settings and bind **Continue conversation** (`chlrc.continue`) if desired; no default key is claimed. The shortcut acts only within the focused conversation, not an unrelated pane.

Running turns, queued input, approvals, nonempty drafts, attachments, and references disable admission. Authentication/billing failures require resolving credentials first. Completed turns and child-agent conversations do not show the button. English and Chinese labels use DSH's locale service.

## Development

Follow the [root setup](../../README.md). Run `pnpm --filter @chlrc/dsh-client-continue typecheck`, `test`, or `build` with `DSH_CHECKOUT_DIR` pointing to the built, pinned public checkout. Types are generated locally and never packaged; runtime code uses Cordis services, conversation projections, slots, shortcuts, and DSH primitives. No DOM replacement, model selector changes, private RPC, or transcript rescans are used.

## Model Experience

- **Prompt:** one explicit user message, `继续`, using the current session's model and settings.
- **Tokens:** normal continuation cost; no automatic retries or added system instructions.
- **KV cache:** existing context remains; the plugin neither rewinds nor compacts it.

## Known Limitations and Deferred Work

Only the pinned public `0.2.0-rc.2` API is targeted. This does not imply compatibility with unreleased/internal builds. Tests cover admission, event folding, and native plugin registration; a live GUI acceptance test remains required before profile installation.

The plugin prevents duplicate submissions for one ending within its lifetime. An ambiguous transport failure is not replayed automatically: inspect the transcript and use the ordinary composer to continue if needed. Reloading the plugin resets this local fence. It cannot undo tools or roll back side effects, and does not provide automatic recovery. No separate runtime invariant companion is needed because the plugin owns no independent durable state.
