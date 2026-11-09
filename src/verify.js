// The acceptance run.
//
// One config + one suite + optionally one previous report in; one report out.
// Read-only by construction: this module and everything under it only calls
// readFileSync / statSync. There is no client for the router, no SSH, no HTTP, and
// no writer of device configuration anywhere in the package.

import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, resolve as resolvePath } from 'node:path'
import { parseConfig, ConfigError } from './config.js'
import { loadProviders, describeProviders } from './provider.js'
import { makeTarget } from './rules.js'
import { evaluateRules } from './engine.js'
import { buildPolicyIndex, classifyPolicy, expectationOf } from './policy.js'
import { compareReports } from './diff.js'

const MAX_CONFIG_BYTES = 16 * 1024 * 1024
const MAX_SUITE_BYTES = 2 * 1024 * 1024
const MAX_BASELINE_BYTES = 16 * 1024 * 1024

export class VerificationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'VerificationError'
  }
}

export class SuiteError extends VerificationError {
  constructor(message) {
    super(message)
    this.name = 'SuiteError'
  }
}

function readCapped(file, limit, label) {
  let info
  try {
    info = statSync(file)
  } catch (error) {
    throw new VerificationError(label + '不存在：' + file)
  }
  if (!info.isFile()) throw new VerificationError(label + '不是文件：' + file)
  if (info.size > limit) {
    throw new VerificationError(label + '超过 ' + String(Math.round(limit / 1024 / 1024)) + ' MiB，拒绝读取：' + file)
  }
  try {
    return readFileSync(file, 'utf8')
  } catch (error) {
    throw new VerificationError('读取' + label + '失败：' + String((error && error.message) || error))
  }
}

function stringList(value) {
  if (!Array.isArray(value)) return []
  return value.filter(function (item) { return typeof item === 'string' && item.trim() !== '' }).map(function (item) { return item.trim() })
}

export function normalizeSuite(input, sourcePath) {
  let suite = input
  if (typeof suite === 'string') {
    try {
      suite = JSON.parse(suite)
    } catch (error) {
      throw new SuiteError('用例文件不是合法 JSON：' + String((error && error.message) || error))
    }
  }
  if (suite === null || typeof suite !== 'object' || Array.isArray(suite)) {
    throw new SuiteError('用例文件必须是一个 JSON 对象，例如 { "cases": [ { "domain": "...", "expect": "direct" } ] }')
  }
  if (!Array.isArray(suite.cases) || suite.cases.length === 0) {
    throw new SuiteError('用例文件里没有 cases（至少要有一条）')
  }
  const cases = []
  for (let i = 0; i < suite.cases.length; i++) {
    const raw = suite.cases[i]
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      cases.push({ index: i, domain: '', invalid: '第 ' + String(i + 1) + ' 条用例不是对象' })
      continue
    }
    cases.push({
      index: i,
      domain: String(raw.domain === undefined || raw.domain === null ? '' : raw.domain).trim(),
      expect: raw.expect === undefined || raw.expect === null ? undefined : String(raw.expect).trim(),
      group: typeof raw.group === 'string' ? raw.group.trim() : undefined,
      note: typeof raw.note === 'string' ? raw.note : undefined,
      ip: typeof raw.ip === 'string' ? raw.ip.trim() : undefined,
      sourceIp: typeof raw.sourceIp === 'string' ? raw.sourceIp.trim() : undefined,
      port: Number.isInteger(raw.port) ? raw.port : undefined,
      network: typeof raw.network === 'string' ? raw.network.trim() : undefined,
    })
  }
  return {
    name: typeof suite.name === 'string' && suite.name.trim() !== '' ? suite.name.trim() : '未命名验收',
    note: typeof suite.note === 'string' ? suite.note : undefined,
    directGroups: stringList(suite.directGroups),
    rejectGroups: stringList(suite.rejectGroups),
    cases: cases,
    path: sourcePath,
  }
}

function expectationLabel(expectation) {
  if (expectation === null) return '（无期望）'
  if (expectation.kind === 'direct') return '直连'
  if (expectation.kind === 'proxy') return '走代理组'
  if (expectation.kind === 'block') return '拦截'
  return '策略「' + expectation.policy + '」'
}

function defaultCategory(expectation) {
  if (expectation === null) return '未分类'
  if (expectation.kind === 'direct') return '直连'
  if (expectation.kind === 'proxy') return '代理'
  if (expectation.kind === 'block') return '拦截'
  return '指定策略'
}

function compareExpectation(expectation, actual) {
  if (expectation.kind !== undefined) return actual.kind === expectation.kind
  return String(actual.policy || '').trim().toLowerCase() === expectation.policy.trim().toLowerCase()
}

export function runVerification(input) {
  const settings = input !== null && typeof input === 'object' ? input : {}
  if (typeof settings.configText !== 'string' || settings.configText.trim() === '') {
    throw new VerificationError('没有配置内容')
  }
  let config
  try {
    config = parseConfig(settings.configText)
  } catch (error) {
    if (error instanceof ConfigError) throw new VerificationError(error.message)
    throw error
  }
  const providers = loadProviders(config.ruleProviders, settings.configDir || process.cwd(), {
    allowOutside: settings.allowOutsideProviders === true,
  })
  const policyIndex = buildPolicyIndex(config)
  const suite = settings.suite
  if (suite === undefined || suite === null) throw new SuiteError('没有验收用例')
  const now = settings.now === undefined ? new Date() : new Date(settings.now)
  if (Number.isNaN(now.getTime())) throw new VerificationError('now 不是合法时间')

  const sha256 = createHash('sha256').update(settings.configText, 'utf8').digest('hex')
  const seenDomains = new Set()
  const duplicateDomains = []
  const caveats = []
  const cases = []

  for (const testCase of suite.cases) {
    const category = testCase.group === undefined || testCase.group === ''
      ? null
      : testCase.group
    if (testCase.invalid !== undefined) {
      cases.push({
        domain: testCase.domain,
        category: category || '未分类',
        expect: null,
        expectRaw: '',
        expectKind: 'invalid',
        note: testCase.note,
        verdict: 'invalid',
        actual: null,
        matched: null,
        blockedBy: null,
        reason: testCase.invalid,
      })
      continue
    }
    if (testCase.domain === '') {
      cases.push({
        domain: '',
        category: category || '未分类',
        expect: null,
        expectRaw: testCase.expect || '',
        expectKind: 'invalid',
        note: testCase.note,
        verdict: 'invalid',
        actual: null,
        matched: null,
        blockedBy: null,
        reason: '用例缺少 domain',
      })
      continue
    }
    const domain = makeTarget({ domain: testCase.domain }).domain
    if (domain === '') {
      cases.push({
        domain: testCase.domain,
        category: category || '未分类',
        expect: null,
        expectRaw: testCase.expect || '',
        expectKind: 'invalid',
        note: testCase.note,
        verdict: 'invalid',
        actual: null,
        matched: null,
        blockedBy: null,
        reason: '域名规范化之后为空',
      })
      continue
    }
    if (seenDomains.has(domain)) duplicateDomains.push(domain)
    seenDomains.add(domain)

    const expectation = expectationOf(testCase.expect)
    const usedCategory = category || defaultCategory(expectation)
    if (expectation === null) {
      cases.push({
        domain: domain,
        category: usedCategory,
        expect: null,
        expectRaw: '',
        expectKind: 'invalid',
        note: testCase.note,
        verdict: 'invalid',
        actual: null,
        matched: null,
        blockedBy: null,
        reason: '用例没有写 expect（direct / proxy / block，或一个具体策略名）',
      })
      continue
    }

    const target = makeTarget({
      domain: domain,
      ip: testCase.ip,
      sourceIp: testCase.sourceIp,
      port: testCase.port,
      network: testCase.network,
    })
    const walk = evaluateRules(config.rules, target, providers)

    const base = {
      domain: domain,
      category: usedCategory,
      expect: expectation,
      expectRaw: expectation.raw,
      expectKind: expectation.kind === undefined ? 'policy' : expectation.kind,
      note: testCase.note,
      target: {
        ip: target.ip || null,
        sourceIp: target.sourceIp || null,
        port: target.port,
        network: target.network || null,
      },
    }

    if (walk.verdict === 'indeterminate') {
      cases.push(Object.assign({}, base, {
        verdict: 'indeterminate',
        actual: null,
        matched: null,
        blockedBy: walk.rule === undefined ? null : {
          index: walk.rule.index,
          raw: walk.rule.raw,
          code: walk.code,
          reason: walk.reason,
        },
        reason: '第 ' + String(walk.rule.index + 1) + ' 条「' + walk.rule.raw + '」无法离线判定：' + walk.reason,
      }))
      continue
    }
    if (walk.verdict === 'unmatched') {
      cases.push(Object.assign({}, base, {
        verdict: 'fail',
        actual: null,
        matched: null,
        blockedBy: null,
        reason: '规则链走完没有命中任何规则，也没有 MATCH 兜底；真实客户端上的走向未定义',
      }))
      continue
    }

    const actual = classifyPolicy(walk.policy, policyIndex, suite)
    if (actual.note !== undefined) {
      if (caveats.indexOf(actual.note) < 0) caveats.push(actual.note)
    }
    const passed = compareExpectation(expectation, actual)
    let reason
    if (passed) {
      reason = '命中第 ' + String(walk.rule.index + 1) + ' 条「' + walk.rule.raw + '」→ ' + actual.policy
    } else {
      reason = '期望' + expectationLabel(expectation) + '，实际是' + actual.policy +
        '（第 ' + String(walk.rule.index + 1) + ' 条：' + walk.rule.raw + '）'
      if (actual.reason !== undefined) reason += '；' + actual.reason
    }
    cases.push(Object.assign({}, base, {
      verdict: passed ? 'pass' : 'fail',
      actual: actual,
      matched: {
        index: walk.rule.index,
        raw: walk.rule.raw,
        type: walk.rule.type,
        policy: walk.rule.policy,
      },
      passedRules: walk.passed.length > 0 ? walk.passed : undefined,
      blockedBy: null,
      reason: reason,
    }))
  }

  const summary = {
    total: cases.length,
    pass: 0,
    fail: 0,
    indeterminate: 0,
    invalid: 0,
    byCategory: {},
    passRate: 0,
    decidable: 0,
  }
  for (const entry of cases) {
    summary[entry.verdict] += 1
    const bucket = summary.byCategory[entry.category] || { total: 0, pass: 0, fail: 0, indeterminate: 0, invalid: 0 }
    bucket.total += 1
    bucket[entry.verdict] += 1
    summary.byCategory[entry.category] = bucket
  }
  const effective = summary.total - summary.invalid
  summary.decidable = summary.pass + summary.fail
  summary.passRate = effective > 0 ? summary.pass / effective : 0

  const providerList = describeProviders(providers)
  const limits = []
  const limitCounts = new Map()
  for (const entry of cases) {
    if (entry.verdict !== 'indeterminate') continue
    const code = entry.blockedBy === null ? 'unknown' : entry.blockedBy.code
    const bucket = limitCounts.get(code) || { code: code, count: 0, reason: entry.blockedBy === null ? '' : entry.blockedBy.reason }
    bucket.count += 1
    limitCounts.set(code, bucket)
  }
  for (const bucket of limitCounts.values()) limits.push(bucket)

  const notes = []
  for (const warning of config.warnings) notes.push(warning)
  if (duplicateDomains.length > 0) {
    notes.push('用例里有重复域名：' + Array.from(new Set(duplicateDomains)).join('、'))
  }
  for (const provider of providerList) {
    if (provider.status !== 'loaded') {
      notes.push('规则集「' + provider.name + '」未加载（' + provider.status + '）：' + (provider.reason || ''))
    } else if (provider.cached) {
      notes.push('规则集「' + provider.name + '」用的是本地缓存文件，未联网校验它是否与订阅源一致')
    }
  }
  for (const caveat of caveats) notes.push(caveat)

  const report = {
    kind: 'split-proof/report',
    version: 1,
    createdAt: now.toISOString(),
    readOnly: { network: false, wroteDeviceConfig: false },
    suite: {
      name: suite.name,
      note: suite.note,
      path: suite.path,
      caseCount: suite.cases.length,
    },
    config: {
      path: settings.configPath,
      sha256: sha256,
      mode: config.mode,
      ruleCount: config.rules.length,
      providerCount: providerList.length,
      groupCount: config.groups.length,
      proxyCount: config.proxies.length,
      warnings: config.warnings,
    },
    providers: providerList,
    cases: cases,
    summary: summary,
    limits: limits,
    notes: notes,
    baseline: null,
  }

  if (settings.baseline !== undefined && settings.baseline !== null) {
    report.baseline = compareReports(settings.baseline, report)
  }
  return report
}

/**
 * File-in / report-out wrapper shared by the CLI, the tool and the HTTP route.
 * Only reads files; `cwd` resolves relative paths.
 */
export function runFromFiles(options) {
  const settings = options !== null && typeof options === 'object' ? options : {}
  const cwd = typeof settings.cwd === 'string' && settings.cwd !== '' ? settings.cwd : process.cwd()
  if (typeof settings.configPath !== 'string' || settings.configPath.trim() === '') {
    throw new VerificationError('没有给配置路径')
  }
  const configPath = isAbsolute(settings.configPath) ? settings.configPath : resolvePath(cwd, settings.configPath)
  const configText = readCapped(configPath, MAX_CONFIG_BYTES, '配置文件')
  let suite
  let suitePath
  if (settings.suite !== undefined && settings.suite !== null) {
    suite = settings.suite
  } else {
    if (typeof settings.suitePath !== 'string' || settings.suitePath.trim() === '') {
      throw new VerificationError('没有给用例路径，也没有内联 cases')
    }
    suitePath = isAbsolute(settings.suitePath) ? settings.suitePath : resolvePath(cwd, settings.suitePath)
    const suiteText = readCapped(suitePath, MAX_SUITE_BYTES, '用例文件')
    try {
      suite = JSON.parse(suiteText)
    } catch (error) {
      throw new SuiteError('用例文件不是合法 JSON：' + String((error && error.message) || error))
    }
  }
  const normalizedSuite = normalizeSuite(suite, suitePath)

  let baseline
  if (settings.baseline !== undefined && settings.baseline !== null) {
    baseline = settings.baseline
  } else if (typeof settings.baselinePath === 'string' && settings.baselinePath.trim() !== '') {
    const baselinePath = isAbsolute(settings.baselinePath) ? settings.baselinePath : resolvePath(cwd, settings.baselinePath)
    const baselineText = readCapped(baselinePath, MAX_BASELINE_BYTES, '基线报告')
    try {
      baseline = JSON.parse(baselineText)
    } catch (error) {
      throw new VerificationError('基线报告不是合法 JSON：' + String((error && error.message) || error))
    }
  }

  return runVerification({
    configText: configText,
    configPath: configPath,
    configDir: dirname(configPath),
    suite: normalizedSuite,
    baseline: baseline,
    allowOutsideProviders: settings.allowOutsideProviders === true,
    now: settings.now,
  })
}

export const internals = {
  MAX_CONFIG_BYTES: MAX_CONFIG_BYTES,
  MAX_SUITE_BYTES: MAX_SUITE_BYTES,
  readCapped: readCapped,
  compareExpectation: compareExpectation,
}
