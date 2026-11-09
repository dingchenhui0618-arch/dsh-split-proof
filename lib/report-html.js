// A self-contained HTML acceptance report.
//
// No scripts, no external assets, no fonts fetched from a CDN: the file opens
// anywhere and nothing in it phones home. The visual language is deliberately
// plain — verdict colour is the only saturated thing on the page, because the
// reader is here for the two lists that matter (failed, indeterminate).

import { verdictLabel, verdictMark } from './summary.js'

function escapeHtml(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function percent(value) {
  return (Math.round(Number(value || 0) * 1000) / 10).toFixed(1) + '%'
}

function when(iso) {
  const text = String(iso || '')
  if (text.length < 16) return text
  return text.slice(0, 10) + ' ' + text.slice(11, 16) + ' UTC'
}

function actualText(entry) {
  if (entry.actual !== null && entry.actual !== undefined) {
    if (entry.actual.kind === 'unknown') return '无法识别：' + entry.actual.policy
    return entry.actual.policy + (entry.actual.entity === 'group' ? '（组）' : '')
  }
  if (entry.verdict === 'indeterminate') return '—'
  return '无命中'
}

const CSS = [
  ':root{',
  '--bg:#f7f6f3;--surface:#ffffff;--surface-2:#fbfaf7;--border:#e4e1db;--border-strong:#d3cfc7;',
  '--text:#1b1a18;--muted:#5c5752;--faint:#6d6862;',
  '--pass:#137a4b;--fail:#b3261e;--unknown:#8a5a00;--accent:#2a4d8f;',
  '--space-1:4px;--space-2:8px;--space-3:12px;--space-4:16px;--space-5:24px;--space-6:32px;--space-7:48px;--space-8:64px;',
  '--mono:ui-monospace,"SFMono-Regular","Cascadia Mono",Consolas,monospace;',
  '--sans:"Segoe UI Variable Text","Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;',
  '}',
  '*{box-sizing:border-box}',
  'html,body{margin:0;padding:0}',
  'body{background:var(--bg);color:var(--text);font-family:var(--sans);font-size:14px;line-height:1.55;',
  '-webkit-font-smoothing:antialiased}',
  '.page{max-width:1080px;margin:0 auto;padding:var(--space-7) var(--space-6) var(--space-8)}',
  '.top{display:flex;align-items:center;justify-content:space-between;gap:var(--space-4)}',
  '.wordmark{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint)}',
  '.ro{font-size:12px;color:var(--muted);border:1px solid var(--border);border-radius:999px;',
  'padding:var(--space-1) var(--space-3);background:var(--surface)}',
  'h1{font-size:28px;line-height:1.25;font-weight:600;letter-spacing:-.01em;margin:var(--space-5) 0 var(--space-2)}',
  '.sub{color:var(--muted);font-size:13px;max-width:66ch}',
  '.meta{display:flex;flex-wrap:wrap;gap:var(--space-2) var(--space-5);margin-top:var(--space-3);',
  'font-size:12px;color:var(--muted)}',
  '.meta b{color:var(--text);font-weight:500}',
  '.mono{font-family:var(--mono);font-size:12px;word-break:break-all}',
  '.summary{display:grid;grid-template-columns:repeat(4,1fr);background:var(--surface);',
  'border:1px solid var(--border);border-radius:10px;margin:var(--space-6) 0 var(--space-5);overflow:hidden}',
  '.stat{padding:var(--space-4) var(--space-5);border-right:1px solid var(--border)}',
  '.stat:last-child{border-right:none}',
  '.stat .n{font-size:34px;line-height:1.1;font-weight:500;font-variant-numeric:tabular-nums;letter-spacing:-.02em}',
  '.stat .l{font-size:12px;color:var(--muted);margin-top:var(--space-1)}',
  '.stat.pass .n{color:var(--pass)}',
  '.stat.fail .n{color:var(--fail)}',
  '.stat.unknown .n{color:var(--unknown)}',
  '.grid{display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);margin-top:var(--space-5)}',
  '.card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:var(--space-4) var(--space-5)}',
  '.card h2{font-size:12px;font-weight:600;letter-spacing:.06em;margin:0 0 var(--space-2);color:var(--muted);text-transform:uppercase}',
  '.k{font-size:26px;font-weight:500;font-variant-numeric:tabular-nums;line-height:1.2}',
  '.k small{font-size:12px;color:var(--muted);font-weight:400;margin-left:var(--space-2)}',
  'h2.section{font-size:16px;font-weight:600;letter-spacing:-.01em;margin:var(--space-7) 0 var(--space-3);',
  'display:flex;align-items:baseline;gap:var(--space-3)}',
  'h2.section .count{font-size:12px;color:var(--faint);font-weight:400;font-variant-numeric:tabular-nums}',
  '.case{background:var(--surface);border:1px solid var(--border);border-left:3px solid var(--border-strong);',
  'border-radius:8px;padding:var(--space-3) var(--space-4);margin-bottom:var(--space-2)}',
  '.case.fail{border-left-color:var(--fail)}',
  '.case.indeterminate{border-left-color:var(--unknown)}',
  '.case.invalid{border-left-color:var(--faint)}',
  '.case .row1{display:flex;align-items:baseline;gap:var(--space-3);flex-wrap:wrap}',
  '.domain{font-family:var(--mono);font-size:13px;font-weight:600;word-break:break-all}',
  '.badge{font-size:12px;line-height:1;padding:3px 7px;border-radius:4px;border:1px solid transparent;white-space:nowrap}',
  '.badge.pass{color:var(--pass);background:#eaf4ee;border-color:#cde3d6}',
  '.badge.fail{color:var(--fail);background:#fbeeec;border-color:#efd2ce}',
  '.badge.indeterminate{color:var(--unknown);background:#fbf3e3;border-color:#eeddb9}',
  '.badge.invalid{color:var(--muted);background:var(--surface-2);border-color:var(--border)}',
  '.flow{font-size:13px;color:var(--muted)}',
  '.flow b{color:var(--text);font-weight:500}',
  '.rule{margin-top:var(--space-2);font-family:var(--mono);font-size:12px;color:var(--muted);word-break:break-all}',
  '.why{margin-top:var(--space-1);font-size:13px;color:var(--muted)}',
  '.why strong{color:var(--text);font-weight:500}',
  'table{width:100%;border-collapse:collapse;background:var(--surface);border:1px solid var(--border);',
  'border-radius:10px;overflow:hidden}',
  'thead th{font-size:12px;color:var(--muted);text-align:left;font-weight:600;letter-spacing:.04em;',
  'padding:var(--space-2) var(--space-3);border-bottom:1px solid var(--border);background:var(--surface-2);white-space:nowrap}',
  'tbody td{padding:var(--space-2) var(--space-3);border-bottom:1px solid var(--border);font-size:13px;vertical-align:top}',
  'tbody tr:last-child td{border-bottom:none}',
  'tbody td.domain{font-size:13px}',
  'td.v{white-space:nowrap;font-size:12px}',
  'td.v.pass{color:var(--pass)}td.v.fail{color:var(--fail)}td.v.indeterminate{color:var(--unknown)}td.v.invalid{color:var(--faint)}',
  'td.rule-cell{font-family:var(--mono);font-size:12px;color:var(--muted);word-break:break-all;max-width:320px}',
  '.group-head td{background:var(--surface-2);font-size:12px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase}',
  '.notes{list-style:none;margin:0;padding:0}',
  '.notes li{font-size:13px;color:var(--muted);padding:var(--space-1) 0 var(--space-1) var(--space-4);position:relative}',
  '.notes li:before{content:"";position:absolute;left:0;top:11px;width:5px;height:5px;border-radius:50%;background:var(--border-strong)}',
  '.baseline{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:var(--space-4) var(--space-5)}',
  '.baseline .line{font-size:13px;color:var(--muted);margin-bottom:var(--space-2)}',
  '.baseline .line b{color:var(--text);font-weight:500}',
  '.chg{display:flex;gap:var(--space-3);font-size:12px;font-family:var(--mono);padding:var(--space-1) 0;flex-wrap:wrap}',
  '.chg .from{color:var(--muted)}.chg .to{color:var(--text)}.chg .to.bad{color:var(--fail)}',
  'footer{margin-top:var(--space-7);padding-top:var(--space-4);border-top:1px solid var(--border);',
  'display:flex;justify-content:space-between;gap:var(--space-4);flex-wrap:wrap;font-size:12px;color:var(--faint)}',
  '@media (max-width:720px){.page{padding:var(--space-5) var(--space-4) var(--space-7)}',
  '.summary{grid-template-columns:1fr 1fr}.stat:nth-child(2){border-right:none}',
  '.stat:nth-child(1),.stat:nth-child(2){border-bottom:1px solid var(--border)}',
  '.grid{grid-template-columns:1fr}h1{font-size:22px}',
  'table,tbody,tr,td{display:block}thead{display:none}',
  'tbody tr{border:1px solid var(--border);border-radius:8px;margin-bottom:var(--space-2);padding:var(--space-2) var(--space-3);background:var(--surface)}',
  'tbody td{border:none;padding:2px 0;display:flex;gap:var(--space-2)}',
  'tbody td:before{content:attr(data-label);color:var(--muted);font-size:12px;flex:none;width:56px}',
  'tbody td.domain{font-size:13px;padding-top:var(--space-1)}',
  'td.rule-cell{max-width:none}',
  '.group-head{padding:0;margin:var(--space-3) 0 var(--space-2);background:none;border:none}',
  '.group-head td{display:block;background:none;border:none;padding:0}}',
  '@media print{body{background:#fff}.page{max-width:none;padding:0}.ro{border:none}}',
].join('\n')

function caseCard(entry) {
  const cls = entry.verdict === 'pass' ? 'pass' : entry.verdict
  const rule = entry.matched !== null && entry.matched !== undefined
    ? '第 ' + String(entry.matched.index + 1) + ' 条 · ' + entry.matched.raw
    : (entry.blockedBy !== null && entry.blockedBy !== undefined
      ? '第 ' + String(entry.blockedBy.index + 1) + ' 条 · ' + entry.blockedBy.raw
      : '')
  return [
    '<div class="case ' + cls + '">',
    '<div class="row1">',
    '<span class="badge ' + cls + '">' + escapeHtml(verdictLabel(entry.verdict)) + '</span>',
    '<span class="domain">' + escapeHtml(entry.domain || '(空域名)') + '</span>',
    '<span class="flow">期望 <b>' + escapeHtml(entry.expectRaw || '—') + '</b> → 实际 <b>' + escapeHtml(actualText(entry)) + '</b></span>',
    '</div>',
    '<div class="why"><strong>' + escapeHtml(entry.category) + '</strong> · ' + escapeHtml(entry.reason) + '</div>',
    rule === '' ? '' : '<div class="rule">' + escapeHtml(rule) + '</div>',
    '</div>',
  ].join('')
}

function fullTable(cases) {
  const groups = new Map()
  for (const entry of cases) {
    const list = groups.get(entry.category) || []
    list.push(entry)
    groups.set(entry.category, list)
  }
  const rows = []
  for (const category of groups.keys()) {
    rows.push('<tr class="group-head"><td colspan="5">' + escapeHtml(category) + ' · ' + String(groups.get(category).length) + ' 条</td></tr>')
    for (const entry of groups.get(category)) {
      const actual = actualText(entry)
      const rule = entry.matched !== null && entry.matched !== undefined
        ? entry.matched.raw
        : (entry.blockedBy !== null && entry.blockedBy !== undefined ? entry.blockedBy.raw : '')
      rows.push([
        '<tr>',
        '<td class="v ' + entry.verdict + '" data-label="结果">' + escapeHtml(verdictMark(entry.verdict) + ' ' + verdictLabel(entry.verdict)) + '</td>',
        '<td class="domain" data-label="域名">' + escapeHtml(entry.domain || '(空域名)') + '</td>',
        '<td data-label="期望">' + escapeHtml(entry.expectRaw || '—') + '</td>',
        '<td data-label="实际">' + escapeHtml(actual) + '</td>',
        '<td class="rule-cell" data-label="命中规则">' + escapeHtml(rule) + '</td>',
        '</tr>',
      ].join(''))
    }
  }
  return [
    '<table>',
    '<thead><tr><th>结果</th><th>域名</th><th>期望</th><th>实际</th><th>命中规则</th></tr></thead>',
    '<tbody>', rows.join(''), '</tbody>',
    '</table>',
  ].join('')
}

function baselineBlock(baseline) {
  if (baseline === null || baseline === undefined) return ''
  if (baseline.comparable !== true) {
    return '<h2 class="section">基线对比</h2><div class="baseline"><div class="line">' +
      escapeHtml(baseline.reason || '基线不可比') + '</div></div>'
  }
  if (baseline.unchanged) {
    return '<h2 class="section">基线对比</h2><div class="baseline"><div class="line">与基线 <b>完全一致</b>：无新增、无删除、无变化。</div></div>'
  }
  const lines = []
  if (baseline.configChanged) lines.push('<div class="line">配置文件哈希已变（基线 ' + escapeHtml(String(baseline.previousConfig || '').slice(0, 12)) +
    ' → 现在 ' + escapeHtml(String(baseline.currentConfig || '').slice(0, 12)) + '）</div>')
  if (baseline.regressions.length > 0) {
    lines.push('<div class="line"><b>' + String(baseline.regressions.length) + ' 条回退</b>' +
      (baseline.directRegressions.length > 0 ? '，其中直连用例 ' + String(baseline.directRegressions.length) + ' 条' : '') + '</div>')
  }
  if (baseline.fixes.length > 0) lines.push('<div class="line"><b>' + String(baseline.fixes.length) + ' 条修复</b></div>')
  if (baseline.newIndeterminate.length > 0) lines.push('<div class="line"><b>' + String(baseline.newIndeterminate.length) + ' 条变成无法判定</b></div>')
  if (baseline.added.length > 0) lines.push('<div class="line">新增用例：' + escapeHtml(baseline.added.join('、')) + '</div>')
  if (baseline.removed.length > 0) lines.push('<div class="line">删除用例：' + escapeHtml(baseline.removed.join('、')) + '</div>')
  for (const change of baseline.changed.slice(0, 12)) {
    lines.push('<div class="chg"><span class="from">' + escapeHtml(change.domain) + ' ' + escapeHtml(change.from.verdict + ' · ' + (change.from.policy || '—')) +
      '</span><span>→</span><span class="to' + (change.to.verdict === 'fail' ? ' bad' : '') + '">' +
      escapeHtml(change.to.verdict + ' · ' + (change.to.policy || '—')) + '</span></div>')
  }
  if (baseline.changed.length > 12) lines.push('<div class="line">…还有 ' + String(baseline.changed.length - 12) + ' 条变化</div>')
  return '<h2 class="section">基线对比</h2><div class="baseline">' + lines.join('') + '</div>'
}

export function renderReportHtml(report, options) {
  const settings = options !== null && typeof options === 'object' ? options : {}
  if (report === null || report === undefined || !Array.isArray(report.cases)) {
    return '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>分流验收</title><body>没有报告</body></html>'
  }
  const summary = report.summary || {}
  const title = (report.suite && report.suite.name) || '分流验收'
  const failed = report.cases.filter(function (entry) { return entry.verdict === 'fail' })
  const unknown = report.cases.filter(function (entry) { return entry.verdict === 'indeterminate' })
  const invalid = report.cases.filter(function (entry) { return entry.verdict === 'invalid' })
  const version = typeof settings.version === 'string' ? settings.version : '0.1.0'

  const categories = Object.keys(summary.byCategory || {})
  const categoryCards = categories.map(function (category) {
    const bucket = summary.byCategory[category]
    return '<div class="card"><h2>' + escapeHtml(category) + '</h2><div class="k">' + String(bucket.pass) +
      ' <small>通过 / ' + String(bucket.total) + ' 条 · 失败 ' + String(bucket.fail) + ' · 无法判定 ' +
      String(bucket.indeterminate) + '</small></div></div>'
  }).join('')

  const notes = Array.isArray(report.notes) && report.notes.length > 0
    ? '<h2 class="section">提示</h2><ul class="notes">' + report.notes.map(function (note) {
      return '<li>' + escapeHtml(note) + '</li>'
    }).join('') + '</ul>'
    : ''

  const limits = Array.isArray(report.limits) && report.limits.length > 0
    ? '<h2 class="section">无法离线判定的原因分布</h2><ul class="notes">' + report.limits.map(function (limit) {
      return '<li>' + escapeHtml(limit.code + ' × ' + String(limit.count) + '：' + (limit.reason || '')) + '</li>'
    }).join('') + '</ul>'
    : ''

  return [
    '<!doctype html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>' + escapeHtml(title) + ' · 分流验收报告</title>',
    '<style>' + CSS + '</style>',
    '</head>',
    '<body>',
    '<main class="page">',
    '<div class="top"><span class="wordmark">Split proof · 分流验收</span><span class="ro">只读 · 不联网 · 不写设备配置</span></div>',
    '<h1>' + escapeHtml(title) + '</h1>',
    report.suite && report.suite.note ? '<div class="sub">' + escapeHtml(report.suite.note) + '</div>' : '',
    '<div class="meta">',
    '<span>配置 <span class="mono">' + escapeHtml((report.config && report.config.path) || '(未记录)') + '</span></span>',
    '<span>规则 <b>' + String((report.config && report.config.ruleCount) || 0) + '</b> 条</span>',
    '<span>sha256 <span class="mono">' + escapeHtml(String((report.config && report.config.sha256) || '').slice(0, 12)) + '</span></span>',
    '<span>' + escapeHtml(when(report.createdAt)) + '</span>',
    '</div>',
    '<div class="summary">',
    '<div class="stat pass"><div class="n">' + String(summary.pass || 0) + '</div><div class="l">通过 · 共 ' + String(summary.total || 0) + ' 条用例</div></div>',
    '<div class="stat fail"><div class="n">' + String(summary.fail || 0) + '</div><div class="l">失败</div></div>',
    '<div class="stat unknown"><div class="n">' + String(summary.indeterminate || 0) + '</div><div class="l">无法离线判定</div></div>',
    '<div class="stat"><div class="n">' + escapeHtml(percent(summary.passRate || 0)) + '</div><div class="l">通过率（已剔除无效）</div></div>',
    '</div>',
    categories.length > 1 ? '<div class="grid">' + categoryCards + '</div>' : '',

    failed.length > 0
      ? '<h2 class="section">失败 <span class="count">' + String(failed.length) + ' 条</span></h2>' + failed.map(caseCard).join('')
      : '<h2 class="section">失败 <span class="count">0 条</span></h2><div class="case pass"><div class="row1"><span class="badge pass">✓ 全部可判定的用例通过</span></div></div>',

    unknown.length > 0
      ? '<h2 class="section">无法离线判定 <span class="count">' + String(unknown.length) + ' 条</span></h2>' +
        '<div class="sub" style="margin-bottom:12px">这些用例走到了需要 DNS / IP 库 / 运行时状态才能决定的规则。这里不猜结果。</div>' +
        unknown.map(caseCard).join('')
      : '',

    invalid.length > 0
      ? '<h2 class="section">用例无效 <span class="count">' + String(invalid.length) + ' 条</span></h2>' + invalid.map(caseCard).join('')
      : '',

    baselineBlock(report.baseline),
    limits,
    notes,

    '<h2 class="section">全部用例 <span class="count">' + String(report.cases.length) + ' 条</span></h2>',
    fullTable(report.cases),

    '<footer>',
    '<span>dsh-split-proof ' + escapeHtml(version) + ' · 只读验收，不连接路由器、不修改设备配置</span>',
    '<span>期望来自用例文件；命中结果来自配置文件的规则链，按配置里写着的顺序逐条求值</span>',
    '</footer>',
    '</main>',
    '</body>',
    '</html>',
  ].join('\n')
}
