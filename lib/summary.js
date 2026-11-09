// Plain-text summaries. Used by the agent tool and the CLI; the HTML report and
// the panel render the same data differently.

const VERDICT_MARK = {
  pass: '✓',
  fail: '✗',
  indeterminate: '?',
  invalid: '!',
}

const VERDICT_LABEL = {
  pass: '通过',
  fail: '失败',
  indeterminate: '无法判定',
  invalid: '用例无效',
}

function percent(value) {
  return (Math.round(value * 1000) / 10).toFixed(1) + '%'
}

function policyText(entry) {
  if (entry.actual !== null && entry.actual !== undefined) {
    if (entry.actual.kind === 'unknown') return '无法识别（' + entry.actual.policy + '）'
    return entry.actual.policy
  }
  if (entry.verdict === 'indeterminate') return '未判定'
  return '无命中'
}

function lineFor(entry) {
  return VERDICT_MARK[entry.verdict] + ' ' + entry.domain + '  期望 ' +
    (entry.expectRaw || '—') + '，实际 ' + policyText(entry) + '：' + entry.reason
}

export function summarise(report, options) {
  if (report === null || report === undefined || !Array.isArray(report.cases)) {
    return '没有可汇总的报告'
  }
  const settings = options !== null && typeof options === 'object' ? options : {}
  const maxEach = Number.isInteger(settings.maxEach) ? settings.maxEach : 8
  const summary = report.summary || {}
  const out = []
  out.push('分流验收 · ' + (report.suite && report.suite.name ? report.suite.name : '未命名验收') +
    '（' + String(summary.total || report.cases.length) + ' 条用例）')
  const config = report.config || {}
  out.push('配置 ' + (config.path || '(未记录路径)') + ' · ' + String(config.ruleCount || 0) + ' 条规则 · sha256 ' +
    String(config.sha256 || '').slice(0, 12) + (config.mode ? ' · mode=' + config.mode : ''))
  out.push('结论：通过 ' + String(summary.pass || 0) + ' / 失败 ' + String(summary.fail || 0) +
    ' / 无法判定 ' + String(summary.indeterminate || 0) + ' / 用例无效 ' + String(summary.invalid || 0) +
    ' · 通过率 ' + percent(summary.passRate || 0))
  out.push('')

  for (const verdict of ['fail', 'indeterminate', 'invalid']) {
    const rows = report.cases.filter(function (entry) { return entry.verdict === verdict })
    if (rows.length === 0) continue
    out.push(VERDICT_LABEL[verdict] + '（' + String(rows.length) + '）')
    for (const entry of rows.slice(0, maxEach)) out.push('  ' + lineFor(entry))
    if (rows.length > maxEach) out.push('  …还有 ' + String(rows.length - maxEach) + ' 条，见 HTML 报告或面板')
    out.push('')
  }

  if (Array.isArray(report.notes) && report.notes.length > 0) {
    out.push('提示')
    for (const note of report.notes.slice(0, maxEach)) out.push('  · ' + note)
    if (report.notes.length > maxEach) out.push('  · …还有 ' + String(report.notes.length - maxEach) + ' 条')
    out.push('')
  }

  if (report.baseline !== null && report.baseline !== undefined) {
    out.push('基线：' + summariseDiff(report.baseline))
  }

  out.push('只读：不联网、不写任何设备配置。')
  return out.join('\n')
}

export function summariseDiff(diff) {
  if (diff === null || diff === undefined) return '没有基线'
  if (diff.comparable !== true) return '基线不可比：' + (diff.reason || '格式不符')
  if (diff.unchanged) return '与基线完全一致（无新增、无删除、无变化）'
  const parts = []
  if (diff.configChanged) parts.push('配置文件变了')
  if (diff.regressions.length > 0) parts.push('回退 ' + String(diff.regressions.length) + ' 条')
  if (diff.fixes.length > 0) parts.push('修复 ' + String(diff.fixes.length) + ' 条')
  if (diff.newIndeterminate.length > 0) parts.push('新变得无法判定 ' + String(diff.newIndeterminate.length) + ' 条')
  if (diff.added.length > 0) parts.push('新增用例 ' + String(diff.added.length) + ' 条')
  if (diff.removed.length > 0) parts.push('删除用例 ' + String(diff.removed.length) + ' 条')
  if (parts.length === 0) parts.push('有变化')
  let text = parts.join('，')
  if (diff.directRegressions.length > 0) {
    text += '；其中直连用例回退：' + diff.directRegressions.map(function (item) { return item.domain }).slice(0, 5).join('、')
  }
  return text
}

export function verdictLabel(verdict) {
  return VERDICT_LABEL[verdict] || verdict
}

export function verdictMark(verdict) {
  return VERDICT_MARK[verdict] || '·'
}
