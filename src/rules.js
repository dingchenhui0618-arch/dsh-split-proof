// Rule parsing and matching.
//
// The shape is Clash / Mihomo: an ordered list of `TYPE,payload,POLICY,params`
// rules, evaluated top-down, first match wins. This module is the honest core of
// the verifier: every rule it cannot decide offline returns INDETERMINATE with a
// reason instead of a guess, because a wrong "matches" is worse than "unknown".
//
// Supported without resolution: DOMAIN, DOMAIN-SUFFIX, DOMAIN-KEYWORD,
// DOMAIN-REGEX, RULE-SET (when the provider file is local and readable), MATCH /
// FINAL, and IP / SRC-IP rules when the test case supplies the address. GEOIP
// needs a database this package does not ship, so it is indeterminate — except
// `GEOIP,LAN`, which only needs the private-range check.
//
// Policies: a rule pointing at `DIRECT` or `REJECT` is decidable; a rule pointing
// at a proxy group is decidable as "goes through this group", but which node the
// group currently selects lives in the phone's runtime state and is NOT in the
// config. The report says so instead of pretending otherwise.

import { domainToASCII } from 'node:url'
import { inCidr, isPrivateIp, parseIpv4, parseIpv6 } from './ip.js'

// Trailing tokens that are flags, not part of the payload or the policy.
const PARAM_TOKENS = new Set(['no-resolve', 'src', 'extended'])

const DOMAIN_TYPES = new Set(['DOMAIN', 'DOMAIN-SUFFIX', 'DOMAIN-KEYWORD', 'DOMAIN-REGEX'])
const IP_TYPES = new Set(['IP-CIDR', 'IP-CIDR6'])

/** Strip scheme, path, port, wildcard prefix and trailing dot; lowercase + IDN. */
export function normalizeDomain(value) {
  let text = String(value === undefined || value === null ? '' : value).trim().toLowerCase()
  if (text === '') return ''
  text = text.replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
  const cut = text.search(/[/?#]/)
  if (cut >= 0) text = text.slice(0, cut)
  // Bracketed IPv6 literal: keep the address, drop the port.
  if (text[0] === '[') {
    const end = text.indexOf(']')
    if (end > 0) text = text.slice(1, end)
  } else if (text.indexOf(':') >= 0) {
    text = text.slice(0, text.indexOf(':'))
  }
  text = text.replace(/^\+\./, '').replace(/^\*\./, '').replace(/^\.+/, '').replace(/\.+$/, '')
  if (/[^\x00-\x7f]/.test(text)) {
    try {
      const ascii = domainToASCII(text)
      if (typeof ascii === 'string' && ascii.length > 0) text = ascii
    } catch (error) {
      // Leave the original text; the caller reports it verbatim.
    }
  }
  return text
}

export function makeTarget(input) {
  const source = input !== null && typeof input === 'object' ? input : {}
  const domain = normalizeDomain(source.domain)
  const ip = typeof source.ip === 'string' ? source.ip.trim() : ''
  const sourceIp = typeof source.sourceIp === 'string' ? source.sourceIp.trim() : ''
  return {
    domain: domain,
    ip: ip,
    sourceIp: sourceIp,
    port: Number.isInteger(source.port) ? source.port : null,
    network: typeof source.network === 'string' ? source.network.toLowerCase() : '',
  }
}

/**
 * Parse one rule line. Returns null for comments / blank lines.
 * `policyOptional` is for rule-provider `classical` payloads, whose lines carry
 * no policy: `DOMAIN-SUFFIX,example.com`.
 */
export function parseRule(raw, index, options) {
  const settings = options !== null && typeof options === 'object' ? options : {}
  const text = String(raw === undefined || raw === null ? '' : raw).trim()
  if (text === '' || text[0] === '#' || text[0] === ';' || text.slice(0, 2) === '//') return null
  const parts = text.split(',').map(function (part) { return part.trim() })
  const type = parts[0].toUpperCase()
  if (type === '') return null
  const params = []
  let end = parts.length
  while (end > 1 && PARAM_TOKENS.has(parts[end - 1].toLowerCase())) {
    params.unshift(parts[end - 1].toLowerCase())
    end--
  }
  const core = parts.slice(1, end)
  if (type === 'MATCH' || type === 'FINAL') {
    return {
      index: index,
      raw: text,
      type: 'MATCH',
      payload: '',
      policy: core.length > 0 ? core[0] : '',
      params: params,
      invalid: core.length === 0 ? 'MATCH 缺少目标策略' : undefined,
    }
  }
  if (core.length === 0) {
    return {
      index: index,
      raw: text,
      type: type,
      payload: '',
      policy: '',
      params: params,
      invalid: '规则只有类型，没有匹配内容',
    }
  }
  const hasPolicy = settings.policyOptional === true ? core.length >= 2 : true
  if (!hasPolicy) {
    return { index: index, raw: text, type: type, payload: core[0], policy: '', params: params }
  }
  return {
    index: index,
    raw: text,
    type: type,
    payload: core.slice(0, -1).join(','),
    policy: core[core.length - 1],
    params: params,
  }
}

function matchOutcome(matched) {
  return matched ? { kind: 'match' } : { kind: 'no' }
}

function indeterminate(code, reason) {
  return { kind: 'indeterminate', code: code, reason: reason }
}

function domainSuffixMatches(domain, suffix) {
  const clean = normalizeDomain(suffix)
  if (clean === '') return false
  return domain === clean || domain.endsWith('.' + clean)
}

/**
 * Evaluate one rule against one target.
 * Returns { kind: 'match' | 'no' | 'indeterminate', code?, reason? }.
 */
export function matchRule(rule, target, providers) {
  if (rule === null || rule === undefined) return { kind: 'no' }
  if (rule.invalid !== undefined) return indeterminate('invalid-rule', rule.invalid)
  const type = rule.type
  const payload = rule.payload
  const domain = target !== null && target !== undefined ? String(target.domain || '') : ''

  if (type === 'MATCH') return { kind: 'match' }

  if (type === 'DOMAIN') {
    return matchOutcome(domain !== '' && domain === normalizeDomain(payload))
  }
  if (type === 'DOMAIN-SUFFIX') {
    return matchOutcome(domain !== '' && domainSuffixMatches(domain, payload))
  }
  if (type === 'DOMAIN-KEYWORD') {
    const keyword = String(payload).toLowerCase()
    return matchOutcome(domain !== '' && keyword !== '' && domain.indexOf(keyword) >= 0)
  }
  if (type === 'DOMAIN-REGEX') {
    if (rule.regex === undefined) {
      const source = String(payload)
      if (source.length === 0 || source.length > 2000) {
        rule.regex = null
      } else {
        try {
          rule.regex = new RegExp(source, 'i')
        } catch (error) {
          rule.regex = null
        }
      }
    }
    if (rule.regex === null) return indeterminate('regex-invalid', 'DOMAIN-REGEX 无法编译：' + payload)
    return matchOutcome(domain !== '' && rule.regex.test(domain))
  }

  if (type === 'RULE-SET') {
    const map = providers !== undefined && providers !== null ? providers : new Map()
    const provider = map.get ? map.get(payload) : undefined
    if (provider === undefined) {
      return indeterminate('provider-unknown', '规则集 ' + payload + ' 没有在 rule-providers 里声明')
    }
    if (provider.status !== 'loaded') {
      return indeterminate(
        'provider-' + provider.status,
        '规则集 ' + payload + ' ' + (provider.reason || '不可用（' + provider.status + '）') +
          '，只能用真实客户端的缓存判定',
      )
    }
    try {
      const verdict = provider.match(target)
      if (verdict !== null && typeof verdict === 'object') return verdict
      return matchOutcome(verdict === true)
    } catch (error) {
      return indeterminate('provider-error', '规则集 ' + payload + ' 判定报错：' + String((error && error.message) || error))
    }
  }

  if (type === 'GEOIP') {
    const country = String(payload).toUpperCase()
    if (country === 'LAN' || country === 'PRIVATE') {
      if (target.ip === '') return indeterminate('no-ip', 'GEOIP,' + country + ' 需要先解析出 IP')
      const isPrivate = isPrivateIp(target.ip)
      if (isPrivate === null) return indeterminate('ip-invalid', '无法解析 IP：' + target.ip)
      return matchOutcome(isPrivate)
    }
    return indeterminate(
      'geoip-database',
      'GEOIP,' + country + ' 需要 IP 地理位置库；本插件不内置、也不联网查询',
    )
  }

  if (IP_TYPES.has(type)) {
    const hasNoResolve = rule.params.indexOf('no-resolve') >= 0
    if (target.ip === '') {
      // With no-resolve the real router never resolves a domain-only connection,
      // so the rule truly cannot match. Without it, the verdict depends on DNS.
      if (hasNoResolve) return { kind: 'no' }
      return indeterminate('needs-ip', type + ',' + payload + ' 需要先解析域名，离线无法判定')
    }
    const verdict = inCidr(target.ip, payload)
    if (verdict === null) return indeterminate('cidr-invalid', type + ' 的网段无法解析：' + payload)
    return matchOutcome(verdict)
  }

  if (type === 'SRC-IP-CIDR' || type === 'SRC-IP-CIDR6') {
    if (target.sourceIp === '') return indeterminate('needs-source-ip', type + ' 需要手机的源地址（用例里用 sourceIp 提供）')
    const verdict = inCidr(target.sourceIp, payload)
    if (verdict === null) return indeterminate('cidr-invalid', type + ' 的网段无法解析：' + payload)
    return matchOutcome(verdict)
  }

  if (type === 'DST-PORT') {
    if (target.port === null) return indeterminate('needs-port', 'DST-PORT 需要用例提供 port')
    const fields = String(payload).split('/')
    for (const field of fields) {
      const range = field.split('-')
      if (range.length === 2 && target.port >= Number(range[0]) && target.port <= Number(range[1])) {
        return { kind: 'match' }
      }
      if (range.length === 1 && target.port === Number(range[0])) return { kind: 'match' }
    }
    return { kind: 'no' }
  }

  if (type === 'NETWORK') {
    if (target.network === '') return indeterminate('needs-network', 'NETWORK 需要用例提供 network（tcp / udp）')
    return matchOutcome(target.network === String(payload).toLowerCase())
  }

  if (type === 'PROCESS-NAME' || type === 'PROCESS-PATH' || type === 'IN-TYPE' ||
    type === 'IN-USER' || type === 'IN-NAME' || type === 'SRC-PORT' || type === 'AND' ||
    type === 'OR' || type === 'NOT' || type === 'GEOSITE' || type === 'SUB-RULE') {
    return indeterminate('unsupported-type', type + ' 依赖进程、连接或域名库信息，离线无法判定')
  }

  return indeterminate('unknown-type', '不认识的规则类型：' + type)
}

export const internals = {
  PARAM_TOKENS: PARAM_TOKENS,
  domainSuffixMatches: domainSuffixMatches,
  parseIpv4: parseIpv4,
  parseIpv6: parseIpv6,
}
