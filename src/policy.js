// Turning a rule's target into something an expectation can be compared with.
//
// Three policy kinds exist: DIRECT, REJECT and "a proxy group / node". The fourth
// state matters just as much: UNKNOWN — a target that is not DIRECT, not REJECT,
// and not declared in `proxy-groups` / `proxies` is a broken config, and saying
// "proxy" would hide exactly the mistake the user is trying to find.

const DIRECT_NAMES = new Set(['direct'])
const BLOCK_NAMES = new Set(['reject', 'reject-drop'])

export function buildPolicyIndex(config) {
  const groups = new Map()
  const proxies = new Set()
  if (config !== null && config !== undefined) {
    for (const group of config.groups || []) {
      if (group.name) groups.set(group.name, group)
    }
    for (const name of config.proxies || []) proxies.add(name)
  }
  return { groups: groups, proxies: proxies }
}

function canonical(name) {
  return String(name === undefined || name === null ? '' : name).trim().toLowerCase()
}

/**
 * Classify one policy target. `suite.directGroups` / `suite.rejectGroups` let a
 * user declare their own group names (e.g. 「直连」 or 「广告拦截」) — the verifier
 * never guesses from the Chinese label alone.
 */
export function classifyPolicy(policy, index, suite) {
  const name = String(policy === undefined || policy === null ? '' : policy).trim()
  const lower = canonical(name)
  const directGroups = new Set((suite && suite.directGroups ? suite.directGroups : []).map(canonical))
  const rejectGroups = new Set((suite && suite.rejectGroups ? suite.rejectGroups : []).map(canonical))

  if (lower === '') {
    return { kind: 'unknown', policy: name, reason: '规则没有给出目标策略' }
  }
  if (DIRECT_NAMES.has(lower) || directGroups.has(lower)) {
    return { kind: 'direct', policy: name }
  }
  if (BLOCK_NAMES.has(lower) || rejectGroups.has(lower)) {
    return { kind: 'block', policy: name }
  }
  const group = index !== undefined && index !== null ? index.groups.get(name) : undefined
  if (group !== undefined) {
    return {
      kind: 'proxy',
      policy: name,
      entity: 'group',
      groupType: group.type,
      // A selector's current node lives in the phone's runtime state, not in the
      // config. The report carries that caveat instead of inferring an exit node.
      selectionKnown: false,
      note: '目标是代理组「' + name + '」，组里当前选中哪个节点由手机运行时决定，配置里看不到',
    }
  }
  if (index !== undefined && index !== null && index.proxies.has(name)) {
    return { kind: 'proxy', policy: name, entity: 'node' }
  }
  return {
    kind: 'unknown',
    policy: name,
    reason: '目标策略「' + name + '」既不是 DIRECT/REJECT，也不在 proxy-groups 或 proxies 里（配置可能不完整，或名字写错了）',
  }
}

export function expectationOf(raw) {
  const text = String(raw === undefined || raw === null ? '' : raw).trim()
  const lower = text.toLowerCase()
  if (lower === 'direct') return { kind: 'direct', raw: text }
  if (lower === 'proxy') return { kind: 'proxy', raw: text }
  if (lower === 'block') return { kind: 'block', raw: text }
  if (text === '') return null
  return { policy: text, raw: text }
}
