// Client half of dsh-split-proof: the 分流验收 tab in the conversation view.
//
// Must stay CommonJS — the build wraps this in window.__ModuleLoader__.load() and
// React is supplied by the harness. The host is the single source of truth; this
// side polls /dsh-split-proof/state and renders whatever it says.

const React = require('react')
const h = React.createElement
const CSS = require('./client-css.cjs')

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
