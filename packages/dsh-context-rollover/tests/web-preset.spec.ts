/** Public preset declarations, portable engine resolution, and drift rejection. */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'

// Use the public host's owned YAML parser rather than an undeclared root dependency.
const publicCheckout = process.env.DSH_CHECKOUT_DIR
if (!publicCheckout || !isAbsolute(publicCheckout)) throw new Error('DSH_CHECKOUT_DIR must be absolute')
const { load }: { load: (text: string, options: { schema: typeof entryListSchema }) => unknown } =
  createRequire(join(publicCheckout, 'vendor/include/package.json'))('js-yaml')

const script = fileURLToPath(new URL('../scripts/make-web-preset.mjs', import.meta.url))
const repoRoot = resolve(dirname(script), '..')
const declaration = "    - id: preset-standard\n      name: '@deepseek-ai/dsh-agent-preset'\n      config:\n        id: standard\n        order: 1\n        plugins:"
const basicRow = "              - id: compaction-basic\n                name: '@deepseek-ai/dsh-compaction-basic'"

function standardFixture(): string {
  return `- insert:\n${declaration}
          - id: persona
            name: '@deepseek-ai/dsh-persona'
          - id: compaction
            name: cordis:group
            group: true
            isolate:
              compaction: true
              toolResultPruner: true
            config:
${basicRow}
              - id: command-compact
                name: '@deepseek-ai/dsh-command-compact'
              - id: tool-result-pruner
                name: '@deepseek-ai/dsh-compaction-tool-result-pruner'
                config:
                  thresholdChars: 8192
`
}

function scratch(fixture: string) {
  const base = mkdtempSync(join(repoRoot, 'tmp-scratch-'))
  const checkout = join(base, 'public-host')
  const presets = join(checkout, 'packages/bundle/web-app/presets')
  mkdirSync(presets, { recursive: true })
  writeFileSync(join(presets, 'standard.patch.yml'), fixture)
  return {
    checkout,
    outDir: join(base, 'out'),
    cleanup: () => {
      // The exact temp path was created under this package, never derived from env.
      if (!isAbsolute(base) || dirname(base) !== repoRoot) throw new Error('Unexpected scratch deletion path')
      rmSync(base, { recursive: true, force: true })
    },
  }
}

function run(args: readonly string[], checkout: string | null | undefined = process.env.DSH_CHECKOUT_DIR): string {
  const env = { ...process.env }
  if (checkout == null) delete env.DSH_CHECKOUT_DIR
  else env.DSH_CHECKOUT_DIR = checkout
  return execFileSync(process.execPath, [script, ...args], { encoding: 'utf8', env, stdio: 'pipe' })
}

describe('make-web-preset', () => {
  it('declares a portable opt-in preset and preserves other plugin rows byte-for-byte', () => {
    const fixture = standardFixture()
    const { checkout, outDir, cleanup } = scratch(fixture)
    try {
      run(['--out-dir', outDir, '--retain-tokens', '12000'], checkout)
      const patch = readFileSync(join(outDir, 'standard-rollover.patch.yml'), 'utf8')
      expect(patch).toContain('id: preset-standard-rollover')
      expect(patch).toContain('id: standard-rollover')
      expect(patch).toContain("name: '@chlrc/dsh-context-rollover'")
      expect(patch).not.toContain('lib/index.js')
      expect(patch).not.toContain(checkout)
      expect(patch).toContain('thresholdRatio: 0.9')
      expect(patch).toContain('retainTokens: 12000')
      expect(patch).not.toContain('retainRatio')
      expect(patch).toContain("modelSurface: 'always'")
      // Normalize exactly the two replacements, not any surrounding composition.
      const recovered = patch.replace(
        / {4}- id: preset-standard-rollover\n {6}name: '@deepseek-ai\/dsh-agent-preset'\n {6}config:\n {8}id: standard-rollover\n {8}name: .*\n {8}description: .*\n {8}order: 2\n {8}plugins:/,
        declaration,
      ).replace(/ {14}- id: context-rollover\n[\s\S]*? {18}modelSurface: 'always'/, basicRow)
      expect(recovered).toBe(fixture)
      expect(() => load(patch, { schema: entryListSchema })).not.toThrow()
      expect(readFileSync(join(checkout, 'packages/bundle/web-app/presets/standard.patch.yml'), 'utf8')).toBe(fixture)
    } finally { cleanup() }
  })

  it.each([
    ['absent backend', standardFixture().replace(basicRow, ''), /compaction-basic row/],
    ['duplicate backend', standardFixture().replace(basicRow, `${basicRow}\n${basicRow}`), /more than one/],
    ['backend config drift', standardFixture().replace(basicRow, `${basicRow}\n                config:\n                  future: true`), /unexpected config block/],
    ['declaration drift', standardFixture().replace('id: preset-standard', 'id: unexpected'), /standard agent-preset declaration/],
  ])('rejects %s', (_label, fixture, error) => {
    const { checkout, outDir, cleanup } = scratch(fixture as string)
    try { expect(() => run(['--out-dir', outDir], checkout)).toThrow(error as RegExp) }
    finally { cleanup() }
  })

  it('requires an absolute explicit public checkout', () => {
    expect(() => run([], null)).toThrow(/DSH_CHECKOUT_DIR must be an absolute/)
    expect(() => run([], 'relative-host')).toThrow(/DSH_CHECKOUT_DIR must be an absolute/)
  })

  it('rejects invalid flags and path-traversing preset ids', () => {
    const { checkout, outDir, cleanup } = scratch(standardFixture())
    try {
      for (const [flags, error] of [
        [['--threshold-ratio', '2'], /in \(0, 1\]/],
        [['--reminder-ratio', '1', '--threshold-ratio', '0.8'], /must not exceed/],
        [['--retain-tokens', '-1'], /non-negative integer/],
        [['--retain-ratio', '0'], /in \(0, 1\]/],
        [['--handoff-max-chars', '0'], /positive integer/],
        [['--retain-tokens', '10', '--retain-ratio', '0.1'], /exclusive/],
        [['--preset-id', '../escape'], /invalid preset id/],
        [['--unknown', 'x'], /unknown option/],
      ] as const) {
        expect(() => run(['--out-dir', outDir, ...flags], checkout)).toThrow(error)
      }
    } finally { cleanup() }
  })

  it('committed patch matches the exact public checkout sync without overriding standard defaults', () => {
    const { outDir, cleanup } = scratch(standardFixture())
    try {
      run(['--out-dir', outDir])
      expect(readFileSync(join(outDir, 'standard-rollover.patch.yml'), 'utf8'))
        .toBe(readFileSync(join(repoRoot, 'presets/standard-rollover.patch.yml'), 'utf8'))
      const manifest = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))
      expect(manifest.dsh.bundle.patch).toEqual(['./cordis.patch.yml', './presets/standard-rollover.patch.yml'])
      const hostPatch = readFileSync(join(repoRoot, 'cordis.patch.yml'), 'utf8')
      expect(hostPatch).toContain("name: '@chlrc/dsh-context-rollover'")
      expect(hostPatch).not.toMatch(/- id: (agent-presets|agent-preset-registry|preset-standard)\n/)
      expect(hostPatch).not.toContain('roots:')
      expect(hostPatch).not.toContain('default:')
    } finally { cleanup() }
  })
})
