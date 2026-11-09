// Rule-provider loading.
//
// A `RULE-SET,X,POLICY` rule can only be verified when X's payload is readable
// locally. This module reads `type: file` providers (and cached files behind a
// `type: http` provider) and NEVER fetches a URL: the verifier is offline and
// read-only, so a provider that exists only remotely is reported as unresolved
// rather than guessed from its name.
//
// Supported behaviors: `classical` (payload lines are rules without a policy),
// `domain` (payload lines are domains, matched as suffix rules), `ipcidr`
// (payload lines are CIDRs). Unknown behaviors disable the rule set with a
// stated reason.

import { readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { parseYaml } from './yaml.js'
import { parseRule } from './rules.js'
import { inCidr } from './ip.js'

const MAX_PROVIDER_BYTES = 8 * 1024 * 1024

function redact(provider) {
  return {
    name: provider.name,
    type: provider.type,
    behavior: provider.behavior,
    status: provider.status,
    reason: provider.reason,
    path: provider.path,
    url: provider.url,
    count: provider.entries === undefined ? 0 : provider.entries.length,
    cached: provider.cached === true,
  }
}

function isInside(baseDir, target) {
  const rel = relative(baseDir, target)
  return rel === '' || (rel.slice(0, 2) !== '..' && !isAbsolute(rel))
}

function readText(file, baseDir, settings) {
  const absolute = isAbsolute(file) ? resolve(file) : resolve(baseDir, file)
  if (settings.allowOutside !== true && !isInside(baseDir, absolute)) {
    return { error: 'outside', reason: '规则集路径在配置目录之外：' + absolute + '（只允许配置目录内的文件）' }
  }
  let info
  try {
    info = statSync(absolute)
  } catch (error) {
    return { error: 'missing', reason: '规则集文件不存在：' + absolute }
  }
  if (!info.isFile()) return { error: 'missing', reason: '规则集路径不是文件：' + absolute }
  if (info.size > MAX_PROVIDER_BYTES) {
    return { error: 'too-large', reason: '规则集文件超过 8 MiB：' + absolute }
  }
  try {
    return { text: readFileSync(absolute, 'utf8'), path: absolute }
  } catch (error) {
    return { error: 'unreadable', reason: '规则集读取失败：' + String((error && error.message) || error) }
  }
}

function linesOf(text) {
  return String(text).split(/\r?\n/)
}

function payloadEntries(text, format) {
  const trimmed = String(text).replace(/^\uFEFF/, '').trim()
  if (trimmed === '') return []
  const looksYaml = format === 'yaml' || /^payload\s*:/m.test(trimmed)
  if (looksYaml) {
    let document
    try {
      document = parseYaml(trimmed)
    } catch (error) {
      return { error: String((error && error.message) || error) }
    }
    if (document === null || typeof document !== 'object' || Array.isArray(document)) {
      return { error: '规则集 YAML 不是映射' }
    }
    if (Array.isArray(document.payload)) {
      return { entries: document.payload.map(function (entry) { return String(entry) }) }
    }
    if (Array.isArray(document.rules)) {
      return { entries: document.rules.map(function (entry) { return String(entry) }) }
    }
    return { error: '规则集 YAML 里既没有 payload 也没有 rules' }
  }
  const entries = []
  for (const raw of linesOf(trimmed)) {
    const line = raw.trim()
    if (line === '' || line[0] === '#' || line.slice(0, 2) === '//') continue
    entries.push(line)
  }
  return { entries: entries }
}

function cleanDomainEntry(entry) {
  return String(entry)
    .trim()
    .replace(/^\+\+\./, '')
    .replace(/^\+\./, '')
    .replace(/^\*\./, '')
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')
    .toLowerCase()
}

function compiler(provider) {
  provider.match = function (target) {
    const domain = target !== null && target !== undefined ? String(target.domain || '') : ''
    if (provider.behavior === 'classical') {
      for (const rule of provider.entries) {
        if (rule === null) continue
        const verdict = matchProviderRule(rule, target)
        if (verdict.kind !== 'no') return verdict
      }
      return { kind: 'no' }
    }
    if (provider.behavior === 'domain') {
      if (domain === '') return { kind: 'no' }
      for (const entry of provider.entries) {
        if (domain === entry || domain.endsWith('.' + entry)) return { kind: 'match' }
      }
      return { kind: 'no' }
    }
    if (provider.behavior === 'ipcidr') {
      if (target.ip === '') {
        return {
          kind: 'indeterminate',
          code: 'needs-ip',
          reason: '规则集 ' + provider.name + ' 是 IP 网段，需要先解析域名',
        }
      }
      for (const cidr of provider.entries) {
        const verdict = inCidr(target.ip, cidr)
        if (verdict === true) return { kind: 'match' }
        if (verdict === null) {
          return { kind: 'indeterminate', code: 'cidr-invalid', reason: '规则集 ' + provider.name + ' 里的网段无法解析：' + cidr }
        }
      }
      return { kind: 'no' }
    }
    return { kind: 'indeterminate', code: 'unsupported-behavior', reason: '不支持的规则集 behavior：' + provider.behavior }
  }
}

// Reuse the rule matcher without importing the whole engine: provider rules are
// either domain/IP rules or something the caller should see as unresolved.
function matchProviderRule(rule, target) {
  if (rule.type === 'MATCH') return { kind: 'match' }
  if (rule.type === 'DOMAIN') {
    const clean = cleanDomainEntry(rule.payload)
    return target.domain === clean ? { kind: 'match' } : { kind: 'no' }
  }
  if (rule.type === 'DOMAIN-SUFFIX') {
    const clean = cleanDomainEntry(rule.payload)
    if (clean === '' || target.domain === '') return { kind: 'no' }
    return target.domain === clean || target.domain.endsWith('.' + clean) ? { kind: 'match' } : { kind: 'no' }
  }
  if (rule.type === 'DOMAIN-KEYWORD') {
    const keyword = String(rule.payload).toLowerCase()
    return keyword !== '' && target.domain.indexOf(keyword) >= 0 ? { kind: 'match' } : { kind: 'no' }
  }
  if (rule.type === 'DOMAIN-REGEX') {
    try {
      return new RegExp(String(rule.payload), 'i').test(target.domain) ? { kind: 'match' } : { kind: 'no' }
    } catch (error) {
      return { kind: 'indeterminate', code: 'regex-invalid', reason: '规则集里的正则无法编译：' + rule.payload }
    }
  }
  if (rule.type === 'IP-CIDR' || rule.type === 'IP-CIDR6') {
    if (target.ip === '') {
      if (rule.params.indexOf('no-resolve') >= 0) return { kind: 'no' }
      return { kind: 'indeterminate', code: 'needs-ip', reason: '规则集里的 IP 规则需要先解析域名' }
    }
    const verdict = inCidr(target.ip, rule.payload)
    if (verdict === null) return { kind: 'indeterminate', code: 'cidr-invalid', reason: '规则集里的网段无法解析：' + rule.payload }
    return verdict ? { kind: 'match' } : { kind: 'no' }
  }
  return {
    kind: 'indeterminate',
    code: 'unsupported-rule',
    reason: '规则集里出现了离线无法判定的规则：' + (rule.raw || rule.type),
  }
}

/**
 * Build providers from a config's `rule-providers` map.
 * `options.allowOutside` widens the path guard (default false).
 */
export function loadProviders(ruleProviders, baseDir, options) {
  const settings = options !== null && typeof options === 'object' ? options : {}
  const map = new Map()
  const source = ruleProviders !== null && typeof ruleProviders === 'object' ? ruleProviders : {}
  for (const name of Object.keys(source)) {
    const raw = source[name] !== null && typeof source[name] === 'object' ? source[name] : {}
    const provider = {
      name: name,
      type: String(raw.type || 'file').toLowerCase(),
      behavior: String(raw.behavior || 'classical').toLowerCase(),
      format: typeof raw.format === 'string' ? raw.format.toLowerCase() : undefined,
      path: typeof raw.path === 'string' ? raw.path : undefined,
      url: typeof raw.url === 'string' ? raw.url : undefined,
      status: 'loaded',
      reason: undefined,
      entries: [],
      cached: false,
    }
    if (provider.behavior !== 'classical' && provider.behavior !== 'domain' && provider.behavior !== 'ipcidr') {
      provider.status = 'unsupported'
      provider.reason = '不支持的 behavior：' + provider.behavior
      map.set(name, provider)
      continue
    }
    if (provider.type !== 'file' && provider.type !== 'http') {
      provider.status = 'unsupported'
      provider.reason = '不支持的规则集类型：' + provider.type
      map.set(name, provider)
      continue
    }
    if (provider.path === undefined) {
      provider.status = provider.type === 'http' ? 'remote' : 'missing'
      provider.reason = provider.type === 'http'
        ? '远程规则集，本插件不联网拉取'
        : '没有配置 path'
      map.set(name, provider)
      continue
    }
    const read = readText(provider.path, baseDir, settings)
    if (read.error !== undefined) {
      provider.status = read.error === 'outside' ? 'outside' : (read.error === 'too-large' ? 'too-large' : read.error)
      provider.reason = read.reason
      map.set(name, provider)
      continue
    }
    const parsed = payloadEntries(read.text, provider.format)
    if (parsed.error !== undefined) {
      provider.status = 'unreadable'
      provider.reason = parsed.error
      map.set(name, provider)
      continue
    }
    provider.path = read.path
    provider.cached = provider.type === 'http'
    if (provider.behavior === 'classical') {
      provider.entries = parsed.entries
        .map(function (line, i) { return parseRule(line, i, { policyOptional: true }) })
        .filter(function (rule) { return rule !== null })
    } else if (provider.behavior === 'domain') {
      provider.entries = parsed.entries
        .map(cleanDomainEntry)
        .filter(function (entry) { return entry !== '' })
    } else {
      provider.entries = parsed.entries.map(function (entry) { return String(entry).trim() })
    }
    compiler(provider)
    map.set(name, provider)
  }
  return map
}

/** JSON-safe view for reports: no entry payload, no match function. */
export function describeProviders(providers) {
  const out = []
  if (providers === undefined || providers === null) return out
  for (const provider of providers.values()) out.push(redact(provider))
  return out
}

export function providerPaths(providers) {
  const out = []
  if (providers === undefined || providers === null) return out
  for (const provider of providers.values()) {
    if (typeof provider.path === 'string' && provider.path.length > 0) out.push(provider.path)
  }
  return out
}

export const internals = {
  MAX_PROVIDER_BYTES: MAX_PROVIDER_BYTES,
  isInside: isInside,
  cleanDomainEntry: cleanDomainEntry,
  payloadEntries: payloadEntries,
}
