# @chlrc/dsh-context-rollover

Summarization-free context rollover for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): a fresh working context with durable model-managed notes, an optional handoff, a small verbatim recent tail, and targeted recovery from full session history. A rollover uses the host's compaction transaction; it does not call a summarizer or erase persisted events.

## Compatibility

Version **0.2.3** targets the public **dsh-v0.2.0-rc.2** release, commit `639ed015397290b3745d163aafe02ffee4aa3f84`. Host peers are pinned to that tested prerelease, not an unverified development fork. The inspected public release exposes the `agentPresets` service from `@deepseek-ai/dsh-agent-preset-registry`; presets are `@deepseek-ai/dsh-agent-preset` declaration rows, not preset-root directories. The small session compatibility adapter remains covered by tests, but older hosts are not claimed as supported.

## Install and opt in

```sh
dsh plugin --profile <profile> add @chlrc/dsh-context-rollover@0.2.3
```

Restart after changing bundle membership. In Web profiles, choose **Standard + rollover (experimental)** for a **new, blank session before its first turn**. The `standard` preset, its composition, and the deployment's default selection remain unchanged. Other presets receive no rollover tools or guidance from the host row. On preset-free profiles the host backend replaces `compaction-basic` directly. `/compact` uses the same deterministic rollover on an idle agent.

The bundle lists two patches: the host backend patch and the generated `standard-rollover` preset declaration. The declaration keeps the public standard plugin composition, replacing only the compaction backend and preset metadata. Its engine uses the portable `@chlrc/dsh-context-rollover` specifier; no local installation path is embedded. Threshold changes belong in a copied preset's `context-rollover` row.

## Model-facing behavior

- `new_context({ handoff? })` requests a rollover at the next safe lifecycle point, not in the middle of a tool batch.
- `get_context_remaining()` returns measured token headroom or reports that it is not measured yet.
- `notes` supports `list`, `read`, `write`, `append`, and `search` over markdown files under `<dsh home>/notes/<session id>/`. The model chooses what to save; nothing is saved automatically.
- `history` supports targeted `search` and `read` over conversation that has left the active context.

A once-per-window reminder appears around 75% usage; automatic rollover starts around 90%. Provider-confirmed context overflow also triggers rollover and retry. Only a model-requested rollover carries a handoff. Pressure, overflow, and manual rollover preserve notes and the retained tail without manufacturing a handoff or reviving old user requests. The reminder uses a producer-owned message source accepted by session format v4; legacy reminder recognition prevents duplicate reminders after migration.

## Configuration

```yaml
- insert:
    - id: context-rollover
      name: '@chlrc/dsh-context-rollover'
      config:
        thresholdRatio: 0.9
        reminderThresholdRatio: 0.75
        retainRatio: 0.1
        # retainTokens: 4096 # optional absolute tail budget, overriding retainRatio
        handoffMaxChars: 20000
        notesEnabled: true
        historyEnabled: true
        # notesDir: /absolute/notes-directory
        modelSurface: auto # host: auto; preset engine: always
```

## Monorepo development

Use the monorepo's root dependencies and lockfile (TypeScript 6, Vitest 4). All generators require `DSH_CHECKOUT_DIR` to name an **absolute external public host checkout**. Build that host first so vendored and build-time declarations exist. No generator guesses a sibling directory or installs compatibility packages.

```sh
export DSH_CHECKOUT_DIR=/absolute/path/to/public-deepseek-harness
pnpm --filter @chlrc/dsh-context-rollover typecheck
pnpm --filter @chlrc/dsh-context-rollover test
pnpm --filter @chlrc/dsh-context-rollover build
pnpm --filter @chlrc/dsh-context-rollover preset:sync
```

`preset:sync` reads `packages/bundle/web-app/presets/standard.patch.yml` from that checkout and writes this package's preset patch. It fails on unexpected preset/backend declarations rather than silently dropping host composition. Commit the refreshed preset artifact after host changes. Tests execute public host TypeScript through generated aliases and cover session invariants, real agent-loop reminder admission, ownership deferral, notes/history safety, rollover paths, tools, and preset generation. Builds resolve host declarations, emit only this plugin, and disable declaration maps because source files are not published.

## Known limitations

- The experiment is opt-in and does not support changing a session's preset after its first turn.
- Notes persist per session; there is no cross-session synchronization or embedding store.
- Large retained tails or per-step injections can remain above the rollover threshold; pressure rollover is limited to once per turn to avoid repeatedly discarding the prefix cache.
- Host peers resolve from the running DSH installation. This package is a plugin, not a standalone host application.
- Keyless tests do not establish live-provider or full Web deployment acceptance.

## Attribution and license

Derived from the fixed [athif23/dsh-context-rollover](https://github.com/athif23/dsh-context-rollover) snapshot, with the existing source and regression fixes retained; the related upstream GitHub PR remains separate and is not modified by this migration. This scoped package is maintained in [KiritoKing/dsh-plugins](https://github.com/KiritoKing/dsh-plugins). Inspired by Codex-style explicit context management. MIT; the original contributor copyright and license are preserved in [LICENSE](./LICENSE).
