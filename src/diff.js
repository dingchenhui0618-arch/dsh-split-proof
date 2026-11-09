// Compare two verification reports.
//
// This is the "国内规则没变" half of the acceptance: a single run says what the
// profile does now; two runs say whether anything the user already approved has
// silently moved. Nothing here writes or re-runs anything.

function policyOf(entry) {
  if (entry === null || entry === undefined) return ''
  const actual = entry.actual
  if (actual !== null && actual !== undefined && typeof actual.policy === 'string') return actual.policy
  return ''
}

export function compareReports(previous, current) {
  if (previous === null || previous === undefined || previous.kind !== 'split-proof/report' || !Array.isArray(previous.cases)) {
    return {
      comparable: false,
      reason: '基线不是 split-proof 报告（缺 kind: "split-proof/report" 或 cases）',
    }
  }
  if (current === null || current === undefined || !Array.isArray(current.cases)) {
    return { comparable: false, reason: '当前报告没有 cases' }
  }
  const before = new Map()
  for (const entry of previous.cases) before.set(entry.domain, entry)

  const added = []
  const changed = []
  const seen = new Set()
  for (const entry of current.cases) {
    seen.add(entry.domain)
    const old = before.get(entry.domain)
    if (old === undefined) {
      added.push(entry.domain)
      continue
    }
    const fromPolicy = policyOf(old)
    const toPolicy = policyOf(entry)
    if (old.verdict === entry.verdict && fromPolicy === toPolicy) continue
    const item = {
      domain: entry.domain,
      category: entry.category,
      expect: entry.expectRaw,
      expectKind: entry.expectKind,
      from: { verdict: old.verdict, policy: fromPolicy },
      to: { verdict: entry.verdict, policy: toPolicy },
    }
    changed.push(item)
  }
  const removed = previous.cases
    .map(function (entry) { return entry.domain })
    .filter(function (domain) { return !seen.has(domain) })

  const regressions = changed.filter(function (item) {
    return item.from.verdict === 'pass' && item.to.verdict === 'fail'
  })
  const fixes = changed.filter(function (item) {
    return item.from.verdict === 'fail' && item.to.verdict === 'pass'
  })
  const newIndeterminate = changed.filter(function (item) {
    return item.to.verdict === 'indeterminate' && item.from.verdict !== 'indeterminate'
  })
  const directRegressions = regressions.filter(function (item) {
    return item.expectKind === 'direct'
  })

  const previousConfig = previous.config && previous.config.sha256
  const currentConfig = current.config && current.config.sha256

  return {
    comparable: true,
    baselineCreatedAt: previous.createdAt,
    configChanged: previousConfig !== currentConfig,
    previousConfig: previousConfig,
    currentConfig: currentConfig,
    added: added,
    removed: removed,
    changed: changed,
    regressions: regressions,
    fixes: fixes,
    newIndeterminate: newIndeterminate,
    directRegressions: directRegressions,
    unchanged: added.length === 0 && removed.length === 0 && changed.length === 0,
    summary: {
      from: previous.summary,
      to: current.summary,
    },
  }
}
