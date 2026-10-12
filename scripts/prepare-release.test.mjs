import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

/** Create isolated repositories under the ignored workspace cache; never modify the real Git refs. */
function fixture() {
  const cache = resolve('.cache/release-tests')
  mkdirSync(cache, { recursive: true })
  const root = mkdtempSync(join(cache, 'repo-'))
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git('init', '-b', 'main')
  git('config', 'commit.gpgsign', 'false')
  git('config', 'user.name', 'Release fixture')
  git('config', 'user.email', 'fixture@example.com')
  git('remote', 'add', 'origin', root)
  mkdirSync(join(root, 'scripts'))
  for (const file of ['prepare-release.mjs', 'release-request.mjs']) {
    copyFileSync(new URL(file, import.meta.url), join(root, 'scripts', file))
  }
  for (const [name, version] of [['dsh-context-rollover', '0.2.3'], ['dsh-client-continue', '0.1.0']]) {
    mkdirSync(join(root, 'packages', name), { recursive: true })
    writeFileSync(join(root, 'packages', name, 'package.json'), JSON.stringify({ name: `@chlrc/${name}`, version }))
  }
  git('add', '.')
  git('commit', '-m', 'Fixture')
  const sha = git('rev-parse', 'HEAD')
  const eventPath = join(cache, `${root.split('/').at(-1)}-event.json`)
  const output = `${eventPath}.output`
  const event = { repository: { full_name: 'KiritoKing/dsh-plugins', default_branch: 'main' } }
  function run(overrides = {}, eventOverride = event) {
    writeFileSync(eventPath, JSON.stringify(eventOverride))
    return spawnSync(process.execPath, ['scripts/prepare-release.mjs'], { cwd: root, encoding: 'utf8', env: {
      ...process.env, GITHUB_EVENT_PATH: eventPath, GITHUB_EVENT_NAME: 'push',
      GITHUB_REF: 'refs/tags/dsh-context-rollover-v0.2.3', GITHUB_SHA: sha, GITHUB_OUTPUT: output, ...overrides,
    } })
  }
  return { git, sha, output, run }
}

test('tag on default-branch history emits only validated outputs', () => {
  const repo = fixture()
  repo.git('tag', 'dsh-context-rollover-v0.2.3')
  repo.git('checkout', '--detach', repo.sha)
  const result = repo.run()
  assert.equal(result.status, 0, result.stderr)
  assert.equal(readFileSync(repo.output, 'utf8'), `package=@chlrc/dsh-context-rollover\nversion=0.2.3\ndist-tag=latest\nsha=${repo.sha}\n`)
})
test('unmerged tag fails ancestry check without publishing outputs', () => {
  const repo = fixture()
  repo.git('checkout', '-b', 'feature')
  repo.git('commit', '--allow-empty', '-m', 'Unmerged')
  const result = repo.run({ GITHUB_SHA: repo.git('rev-parse', 'HEAD') })
  assert.notEqual(result.status, 0)
  assert.equal(existsSync(repo.output), false)
})
test('wrong checkout SHA and fork repository are rejected', () => {
  const repo = fixture()
  assert.notEqual(repo.run({ GITHUB_SHA: '0'.repeat(40) }).status, 0)
  assert.notEqual(repo.run({}, { repository: { full_name: 'other/dsh-plugins', default_branch: 'main' } }).status, 0)
  assert.equal(existsSync(repo.output), false)
})
