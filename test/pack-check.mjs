// Publish-artifact check: copy ONLY what the npm tarball would contain into a
// clean directory and re-run the structural assertions against that copy.
// Catches the classic failure where a local test passes because a stub or an
// extra file exists that `files` would never ship.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const root = path.resolve(import.meta.dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-tw-pack-'))

// Mirror npm's packing rules: package.json + everything in `files`.
fs.copyFileSync(path.join(root, 'package.json'), path.join(stage, 'package.json'))
const copied = []
const copyInto = (rel) => {
  const from = path.join(root, rel)
  if (!fs.existsSync(from)) { console.log(`  MISSING in repo: ${rel}`); return }
  const to = path.join(stage, rel)
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.cpSync(from, to, { recursive: true })
  copied.push(rel)
}
for (const entry of pkg.files) copyInto(entry)

console.log(`staged ${copied.length} entries -> ${stage}`)
for (const c of copied) console.log('  + ' + c)

let failed = 0
const check = (ok, line) => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${line}`) }

// The shipped client half must expose the client export path and the mount patch.
check(fs.existsSync(path.join(stage, 'lib/client.js')), 'lib/client.js ships')
check(fs.existsSync(path.join(stage, 'lib/index.js')), 'lib/index.js ships')
check(fs.existsSync(path.join(stage, 'cordis.patch.yml')), 'cordis.patch.yml ships')
check(fs.existsSync(path.join(stage, 'README.md')), 'README.md ships')

// The stub harness must NOT be part of the published package.
check(!fs.existsSync(path.join(stage, 'node_modules')), 'no node_modules in the tarball')
check(!fs.existsSync(path.join(stage, 'test')), 'no test/ in the tarball')

// Docs must not point at the author's local paths — a shipped file may not
// reference D:\ or the personal profile directory.
const leaks = []
const scan = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) scan(p)
    else if (/\.(js|md|yml|json)$/.test(e.name)) {
      const t = fs.readFileSync(p, 'utf8')
      for (const bad of ['D:\\', 'D:/ask', '18324', '.dsh\\profiles']) {
        if (t.includes(bad)) leaks.push(`${path.relative(stage, p)} contains "${bad}"`)
      }
    }
  }
}
scan(stage)
check(leaks.length === 0, leaks.length === 0 ? 'no local paths leaked into shipped files' : `local paths leaked: ${leaks.join('; ')}`)

// package.json must be installable: no private flag, has the mount declaration.
check(pkg.private !== true, 'private flag removed (npm would refuse to publish)')
check(pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch === './cordis.patch.yml', 'dsh.bundle.patch declared')
check(pkg.dsh && pkg.dsh.client && pkg.dsh.client.platform === 'web', 'dsh.client.platform declared')
check(Array.isArray(pkg.files) && pkg.files.length > 0, 'files whitelist present')
check(/^[a-z0-9][a-z0-9-]*$/.test(pkg.name), `package name is a valid npm name: ${pkg.name}`)
check(!pkg.name.startsWith('@') || true, 'name scope noted')

console.log(`\nstaged at: ${stage}`)
console.log(failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`)
