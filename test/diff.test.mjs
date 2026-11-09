import { strict as assert } from 'node:assert'
import test from 'node:test'
import { compareReports } from '../src/diff.js'

function entry(domain, verdict, policy, expectKind) {
  return {
    domain: domain,
    category: '国内',
    expectRaw: expectKind === 'direct' ? 'direct' : (expectKind || 'proxy'),
    expectKind: expectKind || 'proxy',
    verdict: verdict,
    actual: policy === null ? null : { kind: policy === 'DIRECT' ? 'direct' : 'proxy', policy: policy },
  }
}

function report(cases, sha) {
  return {
    kind: 'split-proof/report',
    createdAt: '2026-01-01T00:00:00.000Z',
    config: { sha256: sha || 'a' },
    summary: { total: cases.length, pass: 0, fail: 0, indeterminate: 0, invalid: 0 },
    cases: cases,
  }
}

test('identical reports are unchanged', () => {
  const one = report([entry('a.com', 'pass', 'DIRECT', 'direct'), entry('b.com', 'fail', '节点选择', 'proxy')])
  const diff = compareReports(one, one)
  assert.equal(diff.comparable, true)
  assert.equal(diff.unchanged, true)
  assert.equal(diff.configChanged, false)
  assert.equal(diff.regressions.length, 0)
})

test('verdict and policy changes are detected, split into regressions and fixes', () => {
  const before = report([
    entry('a.com', 'pass', 'DIRECT', 'direct'),
    entry('b.com', 'fail', '节点选择', 'proxy'),
    entry('c.com', 'pass', '节点选择', 'proxy'),
  ])
  const after = report([
    entry('a.com', 'fail', '节点选择', 'direct'),
    entry('b.com', 'pass', '流媒体', 'proxy'),
    entry('c.com', 'fail', 'DIRECT', 'proxy'),
  ], 'b')
  const diff = compareReports(before, after)
  assert.equal(diff.configChanged, true)
  assert.equal(diff.regressions.length, 2)
  assert.equal(diff.fixes.length, 1)
  assert.equal(diff.directRegressions.length, 1)
  assert.equal(diff.directRegressions[0].domain, 'a.com')
  assert.deepEqual(diff.regressions.map(function (item) { return item.domain }).sort(), ['a.com', 'c.com'])
  assert.equal(diff.unchanged, false)
})

test('added and removed case domains are listed', () => {
  const before = report([entry('a.com', 'pass', 'DIRECT', 'direct')])
  const after = report([entry('b.com', 'pass', 'DIRECT', 'direct')])
  const diff = compareReports(before, after)
  assert.deepEqual(diff.added, ['b.com'])
  assert.deepEqual(diff.removed, ['a.com'])
  assert.equal(diff.unchanged, false)
})

test('becoming indeterminate is its own bucket', () => {
  const before = report([entry('a.com', 'pass', 'DIRECT', 'direct')])
  const after = report([{ domain: 'a.com', category: '国内', expectRaw: 'direct', expectKind: 'direct', verdict: 'indeterminate', actual: null }])
  const diff = compareReports(before, after)
  assert.equal(diff.newIndeterminate.length, 1)
  assert.equal(diff.regressions.length, 0)
})

test('a non-report baseline is not comparable', () => {
  assert.equal(compareReports({ hello: 'world' }, report([])).comparable, false)
  assert.equal(compareReports(report([]), { hello: 'world' }).comparable, false)
})
