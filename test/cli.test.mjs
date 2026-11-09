import { strict as assert } from 'node:assert'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const BIN = join(root, 'bin', 'split-proof.mjs')

function run(args) {
  return spawnSync(process.execPath, [BIN].concat(args), { cwd: root, encoding: 'utf8' })
}

function workspace() {
  return mkdtempSync(join(tmpdir(), 'split-proof-cli-'))
}

test('the fixture run exits 1 and reports the three failures', () => {
  const result = run(['--config', 'fixtures/home-wifi.yaml', '--suite', 'fixtures/domestic-foreign.json'])
  assert.equal(result.status, 1, result.stderr)
  assert.match(result.stdout, /分流验收/)
  assert.match(result.stdout, /失败 3/)
  assert.match(result.stdout, /无法判定 3/)
  assert.match(result.stdout, /只读/)
})

test('--quiet prints one line and --html / --json write the requested files only', () => {
  const dir = workspace()
  const html = join(dir, 'report.html')
  const json = join(dir, 'report.json')
  const result = run([
    '--config', 'fixtures/home-wifi.yaml',
    '--suite', 'fixtures/domestic-foreign.json',
    '--quiet', '--html', html, '--json', json,
  ])
  assert.equal(result.status, 1, result.stderr)
  assert.match(result.stdout, /通过 17 \/ 失败 3 \/ 无法判定 3/)
  assert.equal(existsSync(html), true)
  assert.equal(existsSync(json), true)
  assert.match(readFileSync(html, 'utf8'), /分流验收/)
  const report = JSON.parse(readFileSync(json, 'utf8'))
  assert.equal(report.kind, 'split-proof/report')
  assert.equal(report.summary.fail, 3)
})

test('an all-pass suite exits 0', () => {
  const dir = workspace()
  const suite = join(dir, 'pass.json')
  writeFileSync(suite, JSON.stringify({ cases: [{ domain: 'www.taobao.com', expect: 'direct' }] }), 'utf8')
  const result = run(['--config', 'fixtures/home-wifi.yaml', '--suite', suite, '--quiet'])
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /失败 0/)
})

test('a suite with only offline-indeterminate cases exits 3', () => {
  const dir = workspace()
  const suite = join(dir, 'unknown.json')
  writeFileSync(suite, JSON.stringify({ cases: [{ domain: 'www.wikipedia.org', expect: 'proxy' }] }), 'utf8')
  const result = run(['--config', 'fixtures/home-wifi.yaml', '--suite', suite, '--quiet'])
  assert.equal(result.status, 3, result.stderr)
  assert.match(result.stdout, /无法判定 1/)
})

test('missing arguments and unknown flags are usage errors (exit 2)', () => {
  const noArgs = run([])
  assert.equal(noArgs.status, 2)
  assert.match(noArgs.stderr, /--config/)
  const unknown = run(['--config', 'x', '--suite', 'y', '--wat'])
  assert.equal(unknown.status, 2)
  assert.match(unknown.stderr, /不认识的参数/)
})

test('an unreadable config exits 2 without pretending to verify', () => {
  const result = run(['--config', 'fixtures/nope.yaml', '--suite', 'fixtures/domestic-foreign.json', '--quiet'])
  assert.equal(result.status, 2)
  assert.match(result.stderr, /没有跑起来/)
})
