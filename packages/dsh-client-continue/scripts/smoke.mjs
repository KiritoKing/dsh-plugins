/** Verify the published browser factory registers and tears down its contributions. */
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import assert from 'node:assert/strict'
import * as react from 'react'
import * as jsx from 'react/jsx-runtime'
let plugin
const externals = { react, 'react/jsx-runtime': jsx, '@deepseek-ai/dsh-client-ui-primitives': { Button: () => null } }
runInNewContext(readFileSync('lib/client.js', 'utf8'), { window: { __ModuleLoader__: { load(row) {
  assert.equal(row.id, '@chlrc/dsh-client-continue')
  plugin = row.factory(name => { assert.ok(name in externals, `unexpected external: ${name}`); return externals[name] })
} } } })
assert.deepEqual(Object.keys(plugin).sort(), ['apply', 'inject'])
const cleanups = []
const records = new Map()
function register(kind, row) { records.set(kind, row); return () => records.delete(kind) }
const ctx = {
  effect(fn) { cleanups.push(fn()) },
  uiConversation: { events: { register: row => register('events', row) }, views: { register: row => register('views', row) } },
  locale: { register: (id, rows) => register('locale', { id, rows }), bind: () => key => key },
  slots: { inject: (name, fn) => cleanups.push(fn()), register: row => register('slot', row) },
  shortcuts: { register: row => register('shortcut', row) },
}
plugin.apply(ctx)
assert.equal(records.get('slot').name, 'conversation.input.right')
assert.equal(records.get('shortcut').id, 'chlrc.continue')
assert.equal(records.get('events').target, records.get('views').target)
assert.equal(records.get('shortcut').resolve({ modal: {}, target: null }).status, 'pass')
for (const dispose of cleanups.reverse()) dispose()
assert.equal(records.size, 0)
console.log('Browser factory registration/disposal smoke passed (not a live GUI acceptance test)')
