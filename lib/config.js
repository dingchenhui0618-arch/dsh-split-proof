// Config parsing: turn one Clash / Mihomo profile into what the verifier needs —
// the ordered rules, the rule-provider declarations, the proxy groups, and the
// declared mode. Nothing here writes to the config.

import { parseYaml } from './yaml.js'
import { parseRule } from './rules.js'

export class ConfigError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ConfigError'
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function parseConfig(text) {
  let document
  try {
    document = parseYaml(text)
  } catch (error) {
    throw new ConfigError('配置不是可解析的 YAML：' + String((error && error.message) || error))
  }
  if (!isObject(document)) throw new ConfigError('配置根节点不是一个映射（key: value）')

  const rawRules = document.rules
  if (!Array.isArray(rawRules) || rawRules.length === 0) {
    throw new ConfigError('配置里没有 rules 列表；请传入完整的 Clash/Mihomo 配置，而不是单个规则集文件')
  }
  const rules = []
  const warnings = []
  for (let i = 0; i < rawRules.length; i++) {
    const rule = parseRule(rawRules[i], i)
    if (rule === null) continue
    if (rule.invalid !== undefined) warnings.push('第 ' + String(i + 1) + ' 条规则无法解析：' + rule.raw)
    rules.push(rule)
    if (rule.type === 'MATCH') break
  }
  const last = rules[rules.length - 1]
  if (last === undefined || last.type !== 'MATCH') {
    warnings.push('配置里没有 MATCH 兜底规则；未命中任何规则的流量在真实客户端上的走向未定义')
  } else if (rules.length < rawRules.length) {
    warnings.push('MATCH 之后还有 ' + String(rawRules.length - rules.length) + ' 条规则；真实客户端不会执行它们，报告按截断到 MATCH 处理')
  }

  const groups = []
  if (Array.isArray(document['proxy-groups'])) {
    for (const group of document['proxy-groups']) {
      if (!isObject(group)) continue
      groups.push({
        name: typeof group.name === 'string' ? group.name : '',
        type: typeof group.type === 'string' ? group.type : '',
        proxies: Array.isArray(group.proxies) ? group.proxies.map(String) : [],
      })
    }
  }
  const proxies = []
  if (Array.isArray(document.proxies)) {
    for (const proxy of document.proxies) {
      if (isObject(proxy) && typeof proxy.name === 'string') proxies.push(proxy.name)
    }
  }

  let mode = null
  if (typeof document.mode === 'string') {
    mode = document.mode
    if (mode !== 'rule') {
      warnings.push('配置里写着 mode: ' + mode + '；手机客户端可能按自己的设置运行，这条只是提示')
    }
  }

  const ruleProviders = isObject(document['rule-providers']) ? document['rule-providers'] : {}

  return {
    mode: mode,
    rules: rules,
    ruleProviders: ruleProviders,
    groups: groups,
    proxies: proxies,
    warnings: warnings,
  }
}
