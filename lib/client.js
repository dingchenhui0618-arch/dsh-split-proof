/* dsh-split-proof client bundle — generated from src/client.cjs */
window.__ModuleLoader__.load({
  id: "dsh-split-proof",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
// Client half of dsh-split-proof: the 分流验收 tab in the conversation view.
//
// Must stay CommonJS — the build wraps this in window.__ModuleLoader__.load() and
// React is supplied by the harness. The host is the single source of truth; this
// side polls /dsh-split-proof/state and renders whatever it says.

const React = require('react')
const h = React.createElement
const CSS = ".sp-root{--sp-space-1:4px;--sp-space-2:8px;--sp-space-3:12px;--sp-space-4:16px;--sp-space-5:24px;--sp-space-6:32px;--sp-line:color-mix(in srgb,currentColor 14%,transparent);--sp-line-soft:color-mix(in srgb,currentColor 9%,transparent);--sp-fill:color-mix(in srgb,currentColor 3%,transparent);--sp-fill-strong:color-mix(in srgb,currentColor 6%,transparent);--sp-muted:color-mix(in srgb,currentColor 66%,transparent);--sp-faint:color-mix(in srgb,currentColor 52%,transparent);--sp-pass:color-mix(in srgb,#16a34a 62%,currentColor);--sp-fail:color-mix(in srgb,#ef4444 62%,currentColor);--sp-warn:color-mix(in srgb,#d97706 62%,currentColor);display:flex;flex-direction:column;gap:var(--sp-space-4);padding:var(--sp-space-4);height:100%;overflow:auto;color:inherit;font-size:13px;line-height:1.55;font-variant-numeric:tabular-nums}.sp-head{display:flex;align-items:baseline;gap:var(--sp-space-3);flex-wrap:wrap}.sp-title{font-size:15px;font-weight:600;letter-spacing:-.01em}.sp-sub{font-size:12px;color:var(--sp-muted);max-width:56ch}.sp-spacer{flex:1}.sp-btn{border:1px solid var(--sp-line);background:transparent;color:inherit;font:inherit;font-size:12px;padding:3px 10px;border-radius:6px;cursor:pointer;line-height:1.6;text-decoration:none}.sp-btn:hover{background:var(--sp-fill-strong)}.sp-btn:disabled{opacity:.45;cursor:default}.sp-btn.primary{border-color:color-mix(in srgb,#2563eb 55%,transparent);background:color-mix(in srgb,#2563eb 14%,transparent)}.sp-form{display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-space-2) var(--sp-space-3);border:1px solid var(--sp-line-soft);border-radius:8px;padding:var(--sp-space-3);background:var(--sp-fill)}.sp-field{display:flex;flex-direction:column;gap:var(--sp-space-1);min-width:0}.sp-field label{font-size:12px;letter-spacing:.05em;color:var(--sp-faint);text-transform:uppercase}.sp-field input{width:100%;box-sizing:border-box;background:transparent;color:inherit;border:1px solid var(--sp-line);border-radius:5px;padding:5px 8px;font:inherit;font-size:13px;font-family:ui-monospace,\"SFMono-Regular\",Consolas,monospace}.sp-field input:focus{outline:none;border-color:color-mix(in srgb,#2563eb 60%,transparent)}.sp-actions{grid-column:1 / -1;display:flex;align-items:center;gap:var(--sp-space-2);flex-wrap:wrap}.sp-hint{font-size:12px;color:var(--sp-faint)}.sp-err{border:1px solid color-mix(in srgb,var(--sp-fail) 45%,transparent);background:color-mix(in srgb,var(--sp-fail) 8%,transparent);border-radius:7px;padding:var(--sp-space-2) var(--sp-space-3);font-size:12px}.sp-meta{border:1px solid var(--sp-line-soft);border-radius:8px;padding:var(--sp-space-3);background:var(--sp-fill);display:flex;flex-direction:column;gap:var(--sp-space-1)}.sp-meta .sp-suite{font-size:13px;font-weight:600}.sp-meta .sp-mono{font-family:ui-monospace,\"SFMono-Regular\",Consolas,monospace;font-size:12px;color:var(--sp-muted);word-break:break-all}.sp-meta .sp-small{font-size:12px;color:var(--sp-faint)}.sp-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:var(--sp-space-2)}.sp-stat{border:1px solid var(--sp-line-soft);border-radius:8px;padding:var(--sp-space-2) var(--sp-space-3);background:var(--sp-fill)}.sp-stat b{display:block;font-size:24px;line-height:1.2;font-weight:500;letter-spacing:-.02em}.sp-stat span{display:block;font-size:12px;color:var(--sp-muted);margin-top:2px}.sp-stat.pass b{color:var(--sp-pass)}.sp-stat.fail b{color:var(--sp-fail)}.sp-stat.warn b{color:var(--sp-warn)}.sp-section{display:flex;flex-direction:column;gap:var(--sp-space-2)}.sp-sectionhead{display:flex;align-items:baseline;gap:var(--sp-space-2);flex-wrap:wrap}.sp-sectionhead h4{margin:0;font-size:13px;font-weight:600;letter-spacing:.02em;white-space:nowrap}.sp-count{font-size:12px;color:var(--sp-faint);white-space:nowrap}.sp-case{border:1px solid var(--sp-line-soft);border-left:2px solid var(--sp-line);border-radius:6px;padding:var(--sp-space-2) var(--sp-space-3);background:var(--sp-fill);display:flex;flex-direction:column;gap:2px}.sp-case.fail{border-left-color:var(--sp-fail)}.sp-case.indeterminate{border-left-color:var(--sp-warn)}.sp-case.invalid{border-left-color:var(--sp-faint)}.sp-caserow{display:flex;align-items:baseline;gap:var(--sp-space-2);flex-wrap:wrap}.sp-domain{font-family:ui-monospace,\"SFMono-Regular\",Consolas,monospace;font-size:13px;font-weight:500;word-break:break-all}.sp-badge{font-size:12px;line-height:1;padding:3px 6px;border-radius:4px;border:1px solid transparent;white-space:nowrap}.sp-badge.pass{color:var(--sp-pass);border-color:color-mix(in srgb,var(--sp-pass) 38%,transparent);background:color-mix(in srgb,var(--sp-pass) 8%,transparent)}.sp-badge.fail{color:var(--sp-fail);border-color:color-mix(in srgb,var(--sp-fail) 38%,transparent);background:color-mix(in srgb,var(--sp-fail) 8%,transparent)}.sp-badge.warn{color:var(--sp-warn);border-color:color-mix(in srgb,var(--sp-warn) 38%,transparent);background:color-mix(in srgb,var(--sp-warn) 8%,transparent)}.sp-badge.muted{color:var(--sp-muted);border-color:var(--sp-line);background:var(--sp-fill)}.sp-flow{font-size:12px;color:var(--sp-muted)}.sp-flow b{color:inherit;font-weight:500}.sp-reason{font-size:12px;color:var(--sp-muted)}.sp-rule{font-family:ui-monospace,\"SFMono-Regular\",Consolas,monospace;font-size:12px;color:var(--sp-faint);word-break:break-all} .sp-diff{border:1px solid color-mix(in srgb,var(--sp-warn) 40%,transparent);border-radius:6px;padding:var(--sp-space-2) var(--sp-space-3);font-size:12px;background:color-mix(in srgb,var(--sp-warn) 7%,transparent)}.sp-diff b{font-weight:600}.sp-chips{display:flex;gap:var(--sp-space-1);flex-wrap:wrap}.sp-chip{border:1px solid var(--sp-line-soft);border-radius:999px;padding:2px 9px;font-size:12px;cursor:pointer;background:transparent;color:var(--sp-muted);font:inherit;line-height:1.6}.sp-chip.on{border-color:color-mix(in srgb,currentColor 34%,transparent);background:var(--sp-fill-strong);color:inherit}.sp-table{width:100%;border-collapse:collapse}.sp-table th,.sp-table td{text-align:left;padding:4px 6px;border-bottom:1px solid var(--sp-line-soft);font-size:12px;vertical-align:top}.sp-table th{font-size:12px;font-weight:600;color:var(--sp-faint);text-transform:uppercase;letter-spacing:.05em;white-space:nowrap}.sp-table tr:last-child td{border-bottom:none}.sp-table td.sp-mono{font-family:ui-monospace,\"SFMono-Regular\",Consolas,monospace;word-break:break-all}.sp-table td.sp-actual{white-space:nowrap}.sp-table td.sp-num{font-variant-numeric:tabular-nums;white-space:nowrap}.sp-empty{border:1px dashed var(--sp-line);border-radius:8px;padding:var(--sp-space-4);color:var(--sp-muted);font-size:12px;display:flex;flex-direction:column;gap:var(--sp-space-2);align-items:flex-start}.sp-note{font-size:12px;color:var(--sp-muted);display:flex;gap:var(--sp-space-2)}.sp-note:before{content:\"\";flex:none;width:4px;height:4px;border-radius:50%;background:var(--sp-line);margin-top:8px}.sp-foot{font-size:12px;color:var(--sp-faint);border-top:1px solid var(--sp-line-soft);padding-top:var(--sp-space-2)}@media (max-width:560px){.sp-form{grid-template-columns:1fr}.sp-stats{grid-template-columns:1fr 1fr}.sp-hide-sm{display:none}.sp-chips{flex-basis:100%}}"

const API = '/dsh-split-proof'
const POLL_MS = 1500

let snap = { data: null, error: '', at: 0 }
const listeners = new Set()
let timer = null

function emit() {
  Array.from(listeners).forEach(function (fn) {
    try {
      fn(snap)
    } catch (error) {
      if (typeof console !== 'undefined' && console.warn) console.warn('[dsh-split-proof] listener failed', error)
    }
  })
}

function load() {
  fetch(API + '/state', { headers: { accept: 'application/json' } })
    .then(function (res) { return res.json() })
    .then(function (data) {
      snap = { data: data, error: '', at: Date.now() }
      emit()
    })
    .catch(function (error) {
      snap = { data: snap.data, error: String((error && error.message) || error), at: Date.now() }
      emit()
    })
}

function post(method, body) {
  return fetch(API + '/' + method, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body === undefined ? {} : body),
  }).then(function (res) {
    return res.json().then(function (data) {
      if (res.ok !== true || (data !== null && data !== undefined && data.error !== undefined)) {
        throw new Error((data && data.error) || ('HTTP ' + res.status))
      }
      return data
    })
  })
}

function subscribe(fn) {
  listeners.add(fn)
  if (timer === null) {
    load()
    timer = setInterval(load, POLL_MS)
  }
  fn(snap)
  return function () {
    listeners.delete(fn)
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }
}

const VERDICT = {
  pass: { label: '通过', mark: '✓', cls: 'pass' },
  fail: { label: '失败', mark: '×', cls: 'fail' },
  indeterminate: { label: '无法判定', mark: '?', cls: 'warn' },
  invalid: { label: '用例无效', mark: '!', cls: 'muted' },
}

function verdictOf(value) {
  return VERDICT[value] || { label: String(value), mark: '·', cls: 'muted' }
}

function pad(n) { return n < 10 ? '0' + n : String(n) }

function when(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return String(iso || '')
  return pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
}

function pct(value) {
  return (Math.round(Number(value || 0) * 1000) / 10).toFixed(1) + '%'
}

function actualText(entry) {
  if (entry.actual !== null && entry.actual !== undefined) {
    if (entry.actual.kind === 'unknown') return '无法识别：' + entry.actual.policy
    return entry.actual.policy
  }
  if (entry.verdict === 'indeterminate') return '—'
  return '无命中'
}

function Badge(props) {
  const meta = verdictOf(props.verdict)
  return h('span', { className: 'sp-badge ' + meta.cls }, meta.mark + ' ' + meta.label)
}

function Stat(props) {
  return h('div', { className: 'sp-stat' + (props.tone ? ' ' + props.tone : '') },
    h('b', null, String(props.value)),
    h('span', null, props.label),
  )
}

function CaseCard(props) {
  const entry = props.entry
  const meta = verdictOf(entry.verdict)
  const rule = entry.matched !== null && entry.matched !== undefined
    ? '第 ' + String(entry.matched.index + 1) + ' 条 · ' + entry.matched.raw
    : (entry.blockedBy !== null && entry.blockedBy !== undefined
      ? '第 ' + String(entry.blockedBy.index + 1) + ' 条 · ' + entry.blockedBy.raw
      : '')
  return h('div', { className: 'sp-case ' + meta.cls },
    h('div', { className: 'sp-caserow' },
      h('span', { className: 'sp-domain' }, entry.domain || '(空域名)'),
      h(Badge, { verdict: entry.verdict }),
      h('span', { className: 'sp-flow' },
        '期望 ', h('b', null, entry.expectRaw || '—'),
        ' → 实际 ', h('b', null, actualText(entry)),
      ),
    ),
    h('div', { className: 'sp-reason' }, entry.reason),
    rule === '' ? null : h('div', { className: 'sp-rule' }, rule),
  )
}

function Meta(props) {
  const report = props.report
  const config = report.config || {}
  const suite = report.suite || {}
  return h('div', { className: 'sp-meta' },
    h('div', { className: 'sp-suite' }, suite.name || '未命名验收'),
    h('div', { className: 'sp-mono' }, String(config.path || '(未记录配置路径)')),
    h('div', { className: 'sp-small' },
      [String(config.ruleCount || 0) + ' 条规则',
        String(config.providerCount || 0) + ' 个规则集',
        'sha256 ' + String(config.sha256 || '').slice(0, 10),
        config.mode ? 'mode=' + config.mode : null,
        when(report.createdAt)].filter(Boolean).join(' · '),
    ),
  )
}

function Baseline(props) {
  const diff = props.diff
  if (diff === null || diff === undefined) return null
  if (diff.comparable !== true) {
    return h('div', { className: 'sp-diff' }, '基线不可比：', String(diff.reason || '格式不符'))
  }
  if (diff.unchanged) {
    return h('div', { className: 'sp-diff' }, h('b', null, '与基线完全一致'), ' · 无新增、无删除、无变化')
  }
  const bits = []
  if (diff.regressions.length > 0) bits.push('回退 ' + String(diff.regressions.length) + ' 条')
  if (diff.directRegressions.length > 0) bits.push('直连 ' + String(diff.directRegressions.length) + ' 条')
  if (diff.fixes.length > 0) bits.push('修复 ' + String(diff.fixes.length) + ' 条')
  if (diff.newIndeterminate.length > 0) bits.push('新无法判定 ' + String(diff.newIndeterminate.length) + ' 条')
  if (diff.added.length > 0) bits.push('新增用例 ' + String(diff.added.length) + ' 条')
  if (diff.removed.length > 0) bits.push('删除用例 ' + String(diff.removed.length) + ' 条')
  if (bits.length === 0) bits.push('有变化')
  return h('div', { className: 'sp-diff' },
    h('b', null, '与基线相比'), ' · ' + bits.join(' · ') +
      (diff.configChanged ? ' · 配置哈希已变' : ''),
    diff.regressions.slice(0, 3).map(function (item, i) {
      return h('div', { key: String(i) + item.domain, className: 'sp-small', style: { marginTop: '4px' } },
        item.domain + '：' + item.from.policy + ' → ' + item.to.policy,
      )
    }),
  )
}

function SplitProofView(props) {
  const seeded = props !== null && props !== undefined && props.initial !== undefined && props.initial !== null
    ? { data: props.initial, error: '', at: Date.now() }
    : snap
  const initialData = seeded.data || {}
  const initialDefaults = initialData.defaults || {}
  const [state, setState] = React.useState(seeded)
  const [configPath, setConfigPath] = React.useState(String(initialDefaults.configPath || ''))
  const [suitePath, setSuitePath] = React.useState(String(initialDefaults.suitePath || ''))
  const [baselinePath, setBaselinePath] = React.useState(String(initialDefaults.baselinePath || ''))
  const [busy, setBusy] = React.useState('')
  const [formError, setFormError] = React.useState('')
  const [filter, setFilter] = React.useState('全部')

  React.useEffect(function () { return subscribe(setState) }, [])

  const data = state.data || {}
  const defaults = data.defaults || {}
  const report = data.latest || null
  const stats = data.stats || {}
  const history = data.history || []

  function run() {
    setFormError('')
    setBusy('run')
    post('run', { configPath: configPath, suitePath: suitePath, baselinePath: baselinePath })
      .then(function () { load() })
      .catch(function (error) { setFormError(String((error && error.message) || error)) })
      .then(function () { setBusy('') })
  }

  function demo() {
    setFormError('')
    setBusy('demo')
    post('demo', {})
      .then(function (result) {
        if (result && result.state && result.state.defaults) {
          setConfigPath(String(result.state.defaults.configPath || ''))
          setSuitePath(String(result.state.defaults.suitePath || ''))
        }
        load()
      })
      .catch(function (error) { setFormError(String((error && error.message) || error)) })
      .then(function () { setBusy('') })
  }

  const categories = report === null ? [] : ['全部'].concat(Object.keys((report.summary && report.summary.byCategory) || {}))
  const visible = report === null
    ? []
    : report.cases.filter(function (entry) { return filter === '全部' || entry.category === filter })
  const shown = visible.slice(0, 150)
  const failed = report === null ? [] : report.cases.filter(function (entry) { return entry.verdict === 'fail' })
  const unknown = report === null ? [] : report.cases.filter(function (entry) { return entry.verdict === 'indeterminate' })
  const notes = report === null ? [] : (report.notes || [])

  return h('div', { className: 'sp-root' },
    h('div', { className: 'sp-head' },
      h('div', { className: 'sp-title' }, '分流验收'),
      h('div', { className: 'sp-sub' }, '逐条比对「期望」与「实际命中」；只读、不联网。'),
      h('div', { className: 'sp-spacer' }),
      h('button', { className: 'sp-btn primary', type: 'button', disabled: busy !== '', onClick: demo },
        busy === 'demo' ? '正在跑内置样例…' : '跑内置样例'),
      h('button', { className: 'sp-btn', type: 'button', disabled: busy !== '', onClick: function () { load() } }, '刷新'),
      report !== null ? h('a', {
        className: 'sp-btn',
        href: API + '/report',
        target: '_blank',
        rel: 'noopener noreferrer',
      }, 'HTML 报告') : null,
    ),

    h('div', { className: 'sp-form' },
      h('div', { className: 'sp-field' },
        h('label', { htmlFor: 'sp-config' }, '配置 / 订阅内容'),
        h('input', {
          id: 'sp-config',
          value: configPath,
          placeholder: defaults.configPath || 'D:\\path\\to\\config.yaml',
          onChange: function (event) { setConfigPath(event.target.value) },
        }),
      ),
      h('div', { className: 'sp-field' },
        h('label', { htmlFor: 'sp-suite' }, '用例文件（期望值）'),
        h('input', {
          id: 'sp-suite',
          value: suitePath,
          placeholder: defaults.suitePath || 'D:\\path\\to\\suite.json',
          onChange: function (event) { setSuitePath(event.target.value) },
        }),
      ),
      h('div', { className: 'sp-field', style: { gridColumn: '1 / -1' } },
        h('label', { htmlFor: 'sp-baseline' }, '基线报告（可选，检查「国内规则没变」）'),
        h('input', {
          id: 'sp-baseline',
          value: baselinePath,
          placeholder: defaults.baselinePath || '上一次验收的 report.json',
          onChange: function (event) { setBaselinePath(event.target.value) },
        }),
      ),
      h('div', { className: 'sp-actions' },
        h('button', { className: 'sp-btn primary', type: 'button', disabled: busy !== '', onClick: run },
          busy === 'run' ? '正在验收…' : '运行验收'),
        h('span', { className: 'sp-hint' }, '相对路径按 DSH 工作目录解析；不填基线就只做本次判定。'),
      ),
    ),

    formError !== '' ? h('div', { className: 'sp-err' }, '运行失败：' + formError) : null,
    state.error !== '' ? h('div', { className: 'sp-err' }, '与 host 通信失败：' + state.error) : null,

    report === null
      ? h('div', { className: 'sp-empty' },
        h('div', null, '还没有跑过验收。选一份 Clash / Mihomo 配置和一份用例文件，或者先用内置样例看一遍报告。'),
        h('div', { className: 'sp-hint' }, '用例文件里的 expect 写 direct / proxy / block，或者一个具体策略名；期望由你声明，插件不替你猜。'),
        h('button', { className: 'sp-btn primary', type: 'button', disabled: busy !== '', onClick: demo }, '跑内置样例'),
      )
      : h('div', null,
        h(Meta, { report: report }),
        h('div', { className: 'sp-stats' },
          h(Stat, { label: '通过 / ' + String(report.summary.total) + ' 条', value: report.summary.pass, tone: 'pass' }),
          h(Stat, { label: '失败', value: report.summary.fail, tone: report.summary.fail > 0 ? 'fail' : '' }),
          h(Stat, { label: '无法离线判定', value: report.summary.indeterminate, tone: report.summary.indeterminate > 0 ? 'warn' : '' }),
          h(Stat, { label: '通过率', value: pct(report.summary.passRate) }),
        ),
        h(Baseline, { diff: report.baseline }),

        failed.length > 0
          ? h('div', { className: 'sp-section' },
            h('div', { className: 'sp-sectionhead' },
              h('h4', null, '失败'),
              h('span', { className: 'sp-count' }, String(failed.length) + ' 条 · 期望与命中不一致'),
            ),
            failed.map(function (entry, i) { return h(CaseCard, { key: 'f' + i, entry: entry }) }),
          )
          : null,

        unknown.length > 0
          ? h('div', { className: 'sp-section' },
            h('div', { className: 'sp-sectionhead' },
              h('h4', null, '无法离线判定'),
              h('span', { className: 'sp-count' }, String(unknown.length) + ' 条 · 需要 DNS / IP 库 / 运行时状态'),
            ),
            unknown.map(function (entry, i) { return h(CaseCard, { key: 'u' + i, entry: entry }) }),
          )
          : null,

        h('div', { className: 'sp-section' },
          h('div', { className: 'sp-sectionhead' },
            h('h4', null, '全部用例'),
            h('span', { className: 'sp-count' }, String(visible.length) + ' 条' + (shown.length < visible.length ? '（显示前 ' + String(shown.length) + ' 条）' : '')),
            h('div', { className: 'sp-spacer' }),
            h('div', { className: 'sp-chips' },
              categories.map(function (category) {
                return h('button', {
                  key: category,
                  type: 'button',
                  className: 'sp-chip' + (filter === category ? ' on' : ''),
                  onClick: function () { setFilter(category) },
                }, category === '全部' ? '全部' : category + ' ' + String(report.summary.byCategory[category].total))
              }),
            ),
          ),
          h('table', { className: 'sp-table' },
            h('thead', null, h('tr', null,
              h('th', null, '结果'),
              h('th', null, '域名'),
              h('th', { className: 'sp-hide-sm' }, '期望'),
              h('th', null, '实际'),
              h('th', { className: 'sp-hide-sm' }, '命中规则'),
            )),
            h('tbody', null, shown.map(function (entry, i) {
              const meta = verdictOf(entry.verdict)
              const rule = entry.matched !== null && entry.matched !== undefined
                ? entry.matched.raw
                : (entry.blockedBy !== null && entry.blockedBy !== undefined ? entry.blockedBy.raw : '')
              return h('tr', { key: 'r' + i },
                h('td', { className: 'sp-num' }, h('span', { className: 'sp-badge ' + meta.cls }, meta.mark + ' ' + meta.label)),
                h('td', { className: 'sp-mono' }, entry.domain || '(空域名)'),
                h('td', { className: 'sp-hide-sm' }, entry.expectRaw || '—'),
                h('td', { className: 'sp-actual' }, actualText(entry)),
                h('td', { className: 'sp-hide-sm sp-rule' }, rule),
              )
            })),
          ),
        ),

        notes.length > 0
          ? h('div', { className: 'sp-section' },
            h('div', { className: 'sp-sectionhead' }, h('h4', null, '提示'), h('span', { className: 'sp-count' }, String(notes.length) + ' 条')),
            notes.slice(0, 8).map(function (note, i) { return h('div', { key: 'n' + i, className: 'sp-note' }, note) }),
            notes.length > 8 ? h('div', { className: 'sp-hint' }, '…还有 ' + String(notes.length - 8) + ' 条，见 HTML 报告') : null,
          )
          : null,

        h('div', { className: 'sp-foot' },
          '只读验收 · 本轮 ' + String(stats.runs || 0) + ' 次 · 上次 ' + when(report.createdAt) +
          (history.length > 0 ? ' · 历史 ' + String(history.length) + ' 次' : '') +
          ' · 结果只在内存，重启即清空',
        ),
      ),
  )
}

function SplitProofPanel(props) {
  return h(SplitProofView, props)
}

function apply(ctx) {
  ctx.effect(function () {
    return function () {
      if (timer !== null) {
        clearInterval(timer)
        timer = null
      }
      listeners.clear()
      snap = { data: null, error: '', at: 0 }
    }
  })

  ctx.effect(function () {
    const style = document.createElement('style')
    style.dataset.plugin = 'dsh-split-proof'
    style.textContent = CSS
    document.head.appendChild(style)
    return function () { style.remove() }
  })

  ctx.slots.inject('conversation.view', function () {
    let disposeView
    try {
      disposeView = ctx.slots.register(
        { name: 'conversation.view', id: 'split-proof', order: 32, label: '分流验收' },
        SplitProofPanel,
      )
    } catch (error) {
      disposeView = undefined
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[dsh-split-proof] could not register the 分流验收 view; the split_proof tool still works on the host', error)
      }
    }
    return typeof disposeView === 'function' ? disposeView : function () {}
  })
}

module.exports = {
  name: 'dsh-split-proof',
  inject: ['slots'],
  apply: apply,
  SplitProofView: SplitProofView,
}
    return module.exports;
  },
});
