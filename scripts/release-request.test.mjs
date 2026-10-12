import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveReleaseRequest } from './release-request.mjs'

const manifests = {
  '@chlrc/dsh-context-rollover': { name: '@chlrc/dsh-context-rollover', version: '0.2.3' },
  '@chlrc/dsh-client-continue': { name: '@chlrc/dsh-client-continue', version: '0.1.0' },
}
const request = (overrides = {}) => resolveReleaseRequest({
  eventName: 'push', ref: 'refs/tags/dsh-context-rollover-v0.2.3', defaultBranch: 'main', manifests, ...overrides,
})

test('stable package tag resolves to latest', () => {
  assert.deepEqual(request(), { package: '@chlrc/dsh-context-rollover', version: '0.2.3', distTag: 'latest' })
})
test('second package has an independent release tag', () => {
  assert.equal(request({ ref: 'refs/tags/dsh-client-continue-v0.1.0' }).package, '@chlrc/dsh-client-continue')
})
test('prerelease tag resolves to next without promoting latest', () => {
  assert.equal(request({ ref: 'refs/tags/dsh-client-continue-v0.2.0-rc.1', manifests: {
    ...manifests, '@chlrc/dsh-client-continue': { name: '@chlrc/dsh-client-continue', version: '0.2.0-rc.1' },
  } }).distTag, 'next')
})
test('manual dispatch accepts the default branch and committed version', () => {
  assert.equal(request({ eventName: 'workflow_dispatch', ref: 'refs/heads/main', inputs: {
    package: '@chlrc/dsh-client-continue', version: '0.1.0',
  } }).version, '0.1.0')
})
test('rejects unknown tags, branch pushes and injected versions', () => {
  for (const ref of ['refs/tags/v0.2.3', 'refs/heads/main', 'refs/tags/other-v0.2.3',
    'refs/tags/dsh-context-rollover-v0.2.3\nsha=injected', 'refs/tags/dsh-context-rollover-v0.2.4']) {
    assert.throws(() => request({ ref }))
  }
})
test('rejects invalid SemVer, leading zeroes and build metadata', () => {
  for (const version of ['01.2.3', '1.02.3', '1.2.03', '1.2.3-01', '1.2.3-', '1.2.3+build', '1.2', '1.2.3-rc..1']) {
    assert.throws(() => request({ ref: `refs/tags/dsh-context-rollover-v${version}`, manifests: {
      ...manifests, '@chlrc/dsh-context-rollover': { name: '@chlrc/dsh-context-rollover', version },
    } }))
  }
})
test('manual dispatch rejects feature branches, mismatched versions and unknown packages', () => {
  for (const overrides of [
    { ref: 'refs/heads/feature', inputs: { package: '@chlrc/dsh-context-rollover', version: '0.2.3' } },
    { inputs: { package: '@chlrc/dsh-context-rollover', version: '0.2.4' } },
    { inputs: { package: '@other/plugin', version: '0.2.3' } },
    { inputs: {} },
  ]) assert.throws(() => request({ eventName: 'workflow_dispatch', ref: 'refs/heads/main', ...overrides }))
})
test('rejects unsupported event types and manifest identities', () => {
  assert.throws(() => request({ eventName: 'pull_request' }))
  assert.throws(() => request({ manifests: {} }))
  assert.throws(() => request({ manifests: {
    ...manifests, '@chlrc/dsh-context-rollover': { name: '@other/plugin', version: '0.2.3' },
  } }))
})
