import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  normalizeSuite,
  runFromFiles,
  runVerification,
  SuiteError,
  VerificationError,
} from '../src/verify.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const FIXTURES = join(root, 'fixtures')
const CONFIG = join(FIXTURES, 'home-wifi.yaml')
const SUITE = join(FIXTURES, 'domestic-foreign.json')

function report(options) {
  return runFromFiles(Object.assign({ configPath: CONFIG, suitePath: SUITE }, options || {}))
}

function byDomain(result, domain) {
  const entry = result.cases.find(function (c) { return c.domain === domain })
  assert.ok(entry, 'case exists: ' + domain)
  return entry
}

test('the bundled home-wifi fixture verifies with the expected mix of verdicts', () => {
  const result = report()
  assert.equal(result.kind, 'split-proof/report')
  assert.equal(result.summary.total, 23)
  assert.equal(result.summary.pass, 17)
  assert.equal(result.summary.fail, 3)
  assert.equal(result.summary.indeterminate, 3)
  assert.equal(result.summary.invalid, 0)
  assert.equal(result.config.ruleCount, 11)
  assert.equal(result.config.sha256.length, 64)
  assert.equal(result.readOnly.network, false)
  assert.equal(result.readOnly.wroteDeviceConfig, false)

  assert.equal(byDomain(result, 'www.taobao.com').verdict, 'pass')
  assert.equal(byDomain(result, 'www.taobao.com').matched.index, 6)
  assert.equal(byDomain(result, 'www.baidu.com').verdict, 'fail')
  assert.equal(byDomain(result, 'www.baidu.com').matched.index, 4)
  assert.equal(byDomain(result, 'github.com').verdict, 'fail')
  assert.equal(byDomain(result, 'ads.doubleclick.net').verdict, 'pass')
  assert.equal(byDomain(result, 'router.lan').verdict, 'pass')

  const wikipedia = byDomain(result, 'www.wikipedia.org')
  assert.equal(wikipedia.verdict, 'indeterminate')
  assert.equal(wikipedia.blockedBy.code, 'geoip-database')
  assert.equal(result.limits[0].count, 3)
})

test('proxy-group targets are reported as decidable routing, with the runtime caveat stated', () => {
  const result = report()
  const youtube = byDomain(result, 'www.youtube.com')
  assert.equal(youtube.actual.kind, 'proxy')
  assert.equal(youtube.actual.entity, 'group')
  assert.equal(youtube.actual.selectionKnown, false)
  assert.ok(result.notes.some(function (note) { return /运行时/.test(note) }))
})

test('an explicit policy name can be the expectation', () => {
  const result = verifySimple([
    { domain: 'www.google.com', expect: '节点选择' },
    { domain: 'www.google.com', expect: '流媒体' },
  ])
  assert.equal(result.cases[0].verdict, 'pass')
  assert.equal(result.cases[1].verdict, 'fail')
})

test('a target that is not DIRECT/REJECT and not declared is a failure, not a guess', () => {
  const result = runVerification({
    configText: [
      'proxy-groups: []',
      'rules:',
      '  - DOMAIN-SUFFIX,example.com,Typo-Group',
      '  - MATCH,DIRECT',
    ].join('\n'),
    configPath: 'inline.yaml',
    configDir: FIXTURES,
    suite: normalizeSuite({ cases: [{ domain: 'example.com', expect: 'proxy' }] }),
    now: '2026-01-01T00:00:00.000Z',
  })
  assert.equal(result.cases[0].verdict, 'fail')
  assert.equal(result.cases[0].actual.kind, 'unknown')
  assert.match(result.cases[0].reason, /不在 proxy-groups/)
})

test('a chain with no MATCH is an explicit failure, not a silent pass', () => {
  const result = runVerification({
    configText: [
      'rules:',
      '  - DOMAIN-SUFFIX,example.com,DIRECT',
    ].join('\n'),
    configPath: 'inline.yaml',
    configDir: FIXTURES,
    suite: normalizeSuite({ cases: [{ domain: 'other.com', expect: 'proxy' }] }),
  })
  assert.equal(result.cases[0].verdict, 'fail')
  assert.match(result.cases[0].reason, /没有任何规则|没有命中/)
  assert.ok(result.notes.some(function (note) { return /MATCH 兜底/.test(note) }))
})

test('a remote RULE-SET makes the case indeterminate and names the provider', () => {
  const result = runVerification({
    configText: [
      'rule-providers:',
      '  remote:',
      '    type: http',
      '    behavior: classical',
      '    url: https://rules.example.invalid/cn.yaml',
      'rules:',
      '  - RULE-SET,remote,DIRECT',
      '  - MATCH,节点选择',
      'proxy-groups:',
      '  - name: 节点选择',
      '    type: select',
      '    proxies: [DIRECT]',
    ].join('\n'),
    configPath: 'inline.yaml',
    configDir: FIXTURES,
    suite: normalizeSuite({ cases: [{ domain: 'x.com', expect: 'direct' }] }),
  })
  assert.equal(result.cases[0].verdict, 'indeterminate')
  assert.equal(result.cases[0].blockedBy.code, 'provider-remote')
  assert.ok(result.notes.some(function (note) { return /未加载/.test(note) }))
})

test('a case without expect is invalid and counted separately', () => {
  const result = verifySimple([
    { domain: 'www.taobao.com' },
    { domain: 'www.taobao.com', expect: 'direct' },
  ])
  assert.equal(result.cases[0].verdict, 'invalid')
  assert.equal(result.summary.invalid, 1)
  assert.equal(result.summary.pass, 1)
})

test('duplicate domains are reported as a note', () => {
  const result = verifySimple([
    { domain: 'www.taobao.com', expect: 'direct' },
    { domain: 'WWW.TAOBAO.COM', expect: 'direct' },
  ])
  assert.ok(result.notes.some(function (note) { return /重复域名/.test(note) }))
})

test('the baseline diff flags the two direct cases that regressed', () => {
  const baseline = JSON.parse(readFileSync(join(FIXTURES, 'baseline.json'), 'utf8'))
  const result = report({ baseline: baseline })
  assert.equal(result.baseline.comparable, true)
  assert.equal(result.baseline.configChanged, true)
  assert.equal(result.baseline.regressions.length, 2)
  const domains = result.baseline.regressions.map(function (item) { return item.domain }).sort()
  assert.deepEqual(domains, ['m.api.weibo.com', 'www.baidu.com'])
  assert.equal(result.baseline.directRegressions.length, 2)
})

test('the report is deterministic for a fixed clock', () => {
  const options = { configPath: CONFIG, suitePath: SUITE, now: '2026-01-02T03:04:05.000Z' }
  const first = runFromFiles(options)
  const second = runFromFiles(options)
  assert.deepEqual(first, second)
  assert.equal(first.createdAt, '2026-01-02T03:04:05.000Z')
})

test('missing files and malformed suites are VerificationError / SuiteError', () => {
  assert.throws(function () {
    runFromFiles({ configPath: join(FIXTURES, 'nope.yaml'), suitePath: SUITE })
  }, VerificationError)
  assert.throws(function () {
    runFromFiles({ configPath: CONFIG, suitePath: join(root, 'package.json') })
  }, SuiteError)
  assert.throws(function () {
    normalizeSuite({ cases: [] })
  }, SuiteError)
})

test('a config without a rules list is rejected with a useful message', () => {
  assert.throws(function () {
    runVerification({
      configText: 'payload:\n  - DOMAIN-SUFFIX,x.com\n',
      configPath: 'inline.yaml',
      configDir: FIXTURES,
      suite: normalizeSuite({ cases: [{ domain: 'x.com', expect: 'direct' }] }),
    })
  }, VerificationError)
})

function verifySimple(cases) {
  return runVerification({
    configText: readFileSync(CONFIG, 'utf8'),
    configPath: CONFIG,
    configDir: FIXTURES,
    suite: normalizeSuite({ name: 'inline', cases: cases }),
  })
}
