#!/usr/bin/env node
/** Validate release identity and default-branch ancestry before requesting OIDC. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'
import { resolveReleaseRequest } from './release-request.mjs'

const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
assert.equal(event.repository.full_name, 'KiritoKing/dsh-plugins', 'Releases require the upstream repository')
const defaultBranch = event.repository.default_branch
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
git('check-ref-format', `refs/heads/${defaultBranch}`)
const sha = git('rev-parse', 'HEAD')
assert.equal(sha, process.env.GITHUB_SHA, 'Checkout must match the triggered revision')
git('fetch', '--no-tags', 'origin', `refs/heads/${defaultBranch}:refs/remotes/origin/${defaultBranch}`)
git('merge-base', '--is-ancestor', sha, `refs/remotes/origin/${defaultBranch}`)
const manifests = Object.fromEntries(['dsh-context-rollover', 'dsh-client-continue'].map((name) => {
  const manifest = JSON.parse(readFileSync(new URL(`../packages/${name}/package.json`, import.meta.url), 'utf8'))
  return [manifest.name, manifest]
}))
const release = resolveReleaseRequest({
  eventName: process.env.GITHUB_EVENT_NAME,
  ref: process.env.GITHUB_REF,
  defaultBranch,
  inputs: event.inputs,
  manifests,
})
assert.ok(process.env.GITHUB_OUTPUT, 'GitHub output file is required')
appendFileSync(process.env.GITHUB_OUTPUT, `package=${release.package}\nversion=${release.version}\ndist-tag=${release.distTag}\nsha=${sha}\n`)
console.log(`Validated ${release.package}@${release.version} (${release.distTag}) from default-branch history`)
