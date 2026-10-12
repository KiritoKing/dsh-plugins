#!/usr/bin/env node
/** Derive the opt-in preset patch from the public host's standard declaration. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_PRESET_ID = 'standard-rollover'
const PRESET_ID = /^[a-z0-9][a-z0-9-]*$/
const BASIC_ROW = "              - id: compaction-basic\n                name: '@deepseek-ai/dsh-compaction-basic'"
const DECLARATION = "    - id: preset-standard\n      name: '@deepseek-ai/dsh-agent-preset'\n      config:\n        id: standard\n        order: 1\n        plugins:"

/** Resolve the public standard declaration; no sibling-checkout fallback. */
export function findSourcePreset(checkoutDir = process.env.DSH_CHECKOUT_DIR) {
  if (!checkoutDir || !isAbsolute(checkoutDir)) {
    throw new Error('make-web-preset: DSH_CHECKOUT_DIR must be an absolute public DSH checkout path')
  }
  const file = join(checkoutDir, 'packages/bundle/web-app/presets/standard.patch.yml')
  if (!existsSync(file)) throw new Error(`make-web-preset: standard preset patch missing at ${file}`)
  return file
}

/** Validate engine options before writing the generated patch. */
export function resolveOptions(config) {
  const thresholdRatio = config.thresholdRatio ?? 0.9
  const reminderRatio = config.reminderRatio ?? 0.75
  const handoffMaxChars = config.handoffMaxChars ?? 20000
  for (const [name, value] of [['threshold-ratio', thresholdRatio], ['reminder-ratio', reminderRatio]]) {
    if (!Number.isFinite(value) || value <= 0 || value > 1) {
      throw new Error(`make-web-preset: --${name} must be in (0, 1], got ${String(value)}`)
    }
  }
  if (reminderRatio > thresholdRatio) throw new Error('make-web-preset: reminder-ratio must not exceed threshold-ratio')
  const retainTokens = config.retainTokens ?? null
  if (retainTokens !== null && (!Number.isSafeInteger(retainTokens) || retainTokens < 0)) {
    throw new Error('make-web-preset: --retain-tokens must be a non-negative integer')
  }
  const retainRatio = config.retainRatio ?? 0.1
  if (retainTokens === null && (!Number.isFinite(retainRatio) || retainRatio <= 0 || retainRatio > 1)) {
    throw new Error('make-web-preset: --retain-ratio must be in (0, 1]')
  }
  if (!Number.isSafeInteger(handoffMaxChars) || handoffMaxChars <= 0) {
    throw new Error('make-web-preset: --handoff-max-chars must be a positive integer')
  }
  return { thresholdRatio, reminderRatio, retainTokens, retainRatio, handoffMaxChars }
}

/** Render a bare scoped package specifier, independent of installation paths. */
export function renderEngineRow(options) {
  const tail = options.retainTokens !== null
    ? `                  retainTokens: ${options.retainTokens}`
    : `                  retainRatio: ${options.retainRatio}`
  return `              - id: context-rollover\n`
    + `                name: '@chlrc/dsh-context-rollover'\n`
    + `                config:\n`
    + `                  thresholdRatio: ${options.thresholdRatio}\n`
    + `                  reminderThresholdRatio: ${options.reminderRatio}\n`
    + `${tail}\n`
    + `                  handoffMaxChars: ${options.handoffMaxChars}\n`
    + `                  modelSurface: 'always'`
}

/** Replace only preset metadata and the backend; preserve all other composition bytes. */
export function transformPresetText(text, options, presetId = DEFAULT_PRESET_ID) {
  if (!PRESET_ID.test(presetId)) throw new Error(`make-web-preset: invalid preset id ${presetId}`)
  for (const [anchor, label] of [[DECLARATION, 'standard agent-preset declaration'], [BASIC_ROW, 'compaction-basic row']]) {
    const index = text.indexOf(anchor)
    if (index === -1) throw new Error(`make-web-preset: missing expected ${label}`)
    if (text.indexOf(anchor, index + 1) !== -1) throw new Error(`make-web-preset: more than one ${label}`)
  }
  const after = text.slice(text.indexOf(BASIC_ROW) + BASIC_ROW.length).split('\n')
  const next = after.slice(1).find(line => line.trim() !== '' && !line.trim().startsWith('#'))
  if (next !== undefined && /^ {15,}/.test(next)) {
    throw new Error('make-web-preset: compaction-basic row carries an unexpected config block')
  }
  const declaration = `    - id: preset-${presetId}\n      name: '@deepseek-ai/dsh-agent-preset'\n      config:\n`
    + `        id: ${presetId}\n`
    + `        name: Standard + rollover (experimental)\n`
    + `        description: Full coding agent with model-driven context rollover instead of summarization. Experimental opt-in.\n`
    + `        order: 2\n        plugins:`
  return text.replace(DECLARATION, declaration).replace(BASIC_ROW, renderEngineRow(options))
}

/** Parse supported generator flags, rejecting misspellings. */
export function parseArgs(argv) {
  const flags = {}
  const supported = new Set(['out-dir', 'preset-id', 'threshold-ratio', 'reminder-ratio', 'retain-tokens', 'retain-ratio', 'handoff-max-chars'])
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help') { flags.help = true; continue }
    if (!arg.startsWith('--')) throw new Error(`make-web-preset: unexpected argument ${arg}`)
    const [key, inline] = arg.slice(2).split('=', 2)
    if (!supported.has(key)) throw new Error(`make-web-preset: unknown option --${key}`)
    const value = inline ?? argv[index + 1]
    if (value === undefined || value.startsWith('--')) throw new Error(`make-web-preset: --${key} needs a value`)
    if (inline === undefined) index += 1
    flags[key] = value
  }
  return flags
}

/** Generate the maintained preset artifact; does not need a plugin build. */
export async function main(argv = process.argv.slice(2)) {
  const flags = parseArgs(argv)
  if (flags.help) {
    console.log('DSH_CHECKOUT_DIR=/absolute/public-checkout node scripts/make-web-preset.mjs [--out-dir <dir>] [--preset-id <id>] [--threshold-ratio <n>] [--reminder-ratio <n>] [--retain-tokens <n> | --retain-ratio <n>] [--handoff-max-chars <n>]')
    return
  }
  const number = name => flags[name] === undefined ? undefined : Number(flags[name])
  if (flags['retain-tokens'] !== undefined && flags['retain-ratio'] !== undefined) {
    throw new Error('make-web-preset: --retain-tokens and --retain-ratio are exclusive')
  }
  const options = resolveOptions({
    thresholdRatio: number('threshold-ratio'), reminderRatio: number('reminder-ratio'),
    retainTokens: number('retain-tokens'), retainRatio: number('retain-ratio'),
    handoffMaxChars: number('handoff-max-chars'),
  })
  const presetId = flags['preset-id'] ?? DEFAULT_PRESET_ID
  const source = findSourcePreset()
  const preset = transformPresetText(readFileSync(source, 'utf8'), options, presetId)
  const outDir = flags['out-dir'] === undefined ? join(packageDir, 'presets') : resolve(flags['out-dir'])
  mkdirSync(outDir, { recursive: true })
  const destination = join(outDir, `${presetId}.patch.yml`)
  writeFileSync(destination, preset)
  console.log(`make-web-preset: derived ${presetId} from ${source}; wrote ${destination}`)
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 })
}
