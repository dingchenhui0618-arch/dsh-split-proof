// Host half of dsh-split-proof.
//
// One tool, `split_proof`, and one route serving what it produced. The tool reads
// a Clash / Mihomo profile plus a suite of expectations and answers, per domain,
// "what rule actually catches this, and does that match what you expected?".
//
// Nothing in this file (or anything it imports) opens a socket to a router,
// fetches a subscription, or writes a configuration: the whole package is a
// reader. The report is kept in memory only; closing the harness discards it.

import { readFileSync, statSync } from 'node:fs'
import { isAbsolute, join, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runFromFiles, normalizeSuite, VerificationError, SuiteError } from './verify.js'
import { summarise, summariseDiff } from './summary.js'
import { renderReportHtml } from './report-html.js'

export const name = 'dsh-split-proof'
export const inject = ['webServer', 'tools']

const ROUTE = '/dsh-split-proof'
const HISTORY_KEEP = 12
const MAX_BODY = 1024 * 1024

function packageInfo() {
  try {
    const parsed = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    return { name: parsed.name || name, version: parsed.version || '0.0.0' }
  } catch (error) {
    return { name: name, version: '0.0.0' }
  }
}

function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

function sendHtml(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(body)
}

function readBody(req) {
  return new Promise(function (resolve) {
    let raw = ''
    req.on('data', function (chunk) {
      raw += chunk
      if (raw.length > MAX_BODY) req.destroy()
    })
    req.on('end', function () {
      try {
        resolve(raw.length > 0 ? JSON.parse(raw) : {})
      } catch (error) {
        resolve({})
      }
    })
    req.on('error', function () {
      resolve({})
    })
  })
}

function segmentsOf(url) {
  const path = String(url || '').split('?')[0]
  if (path === ROUTE || path === ROUTE + '/') return []
  if (path.indexOf(ROUTE + '/') !== 0) return null
  return path.slice(ROUTE.length + 1).split('/').filter(function (part) { return part.length > 0 })
}

function fixturePaths() {
  const root = fileURLToPath(new URL('../fixtures/', import.meta.url))
  return {
    configPath: join(root, 'home-wifi.yaml'),
    suitePath: join(root, 'domestic-foreign.json'),
    baselinePath: join(root, 'baseline.json'),
  }
}

function fileExists(path) {
  try {
    return statSync(path).isFile()
  } catch (error) {
    return false
  }
}

function summaryEntry(report) {
  return {
    createdAt: report.createdAt,
    suiteName: report.suite ? report.suite.name : '',
    configPath: report.config ? report.config.path : '',
    pass: report.summary.pass,
    fail: report.summary.fail,
    indeterminate: report.summary.indeterminate,
    invalid: report.summary.invalid,
    total: report.summary.total,
    passRate: report.summary.passRate,
  }
}

export function apply(ctx, config) {
  const settings = config !== null && typeof config === 'object' ? config : {}
  const info = packageInfo()
  const cwd = typeof settings.cwd === 'string' && settings.cwd !== '' ? settings.cwd : process.cwd()
  const allowOutsideProviders = settings.allowOutsideProviders === true
  const demo = fixturePaths()
  const defaults = {
    configPath: typeof settings.configPath === 'string' && settings.configPath !== '' ? settings.configPath : demo.configPath,
    suitePath: typeof settings.suitePath === 'string' && settings.suitePath !== '' ? settings.suitePath : demo.suitePath,
    baselinePath: typeof settings.baselinePath === 'string' && settings.baselinePath !== '' ? settings.baselinePath : '',
  }

  const stats = { runs: 0, failed: 0, lastMs: 0 }
  const history = []
  let latest = null

  function store(report) {
    latest = report
    history.push(summaryEntry(report))
    while (history.length > HISTORY_KEEP) history.shift()
  }

  function state() {
    const demoBaseline = fileExists(demo.baselinePath) ? demo.baselinePath : ''
    return {
      version: info.version,
      stats: stats,
      defaults: defaults,
      demo: { configPath: demo.configPath, suitePath: demo.suitePath, baselinePath: demoBaseline },
      latest: latest,
      history: history.slice().reverse(),
    }
  }

  function resolveUserPath(value) {
    if (typeof value !== 'string' || value.trim() === '') return undefined
    const text = value.trim()
    return isAbsolute(text) ? text : resolvePath(cwd, text)
  }

  function runWithPaths(input) {
    const options = input !== null && typeof input === 'object' ? input : {}
    const configPath = resolveUserPath(options.configPath) || defaults.configPath
    const suitePath = resolveUserPath(options.suitePath) || defaults.suitePath
    const baselinePath = resolveUserPath(options.baselinePath)
    const started = Date.now()
    try {
      const report = runFromFiles({
        configPath: configPath,
        suitePath: suitePath,
        baselinePath: baselinePath,
        cwd: cwd,
        allowOutsideProviders: allowOutsideProviders,
      })
      stats.runs += 1
      stats.lastMs = Date.now() - started
      store(report)
      return report
    } catch (error) {
      stats.failed += 1
      throw error
    }
  }

  function runInline(input) {
    const options = input !== null && typeof input === 'object' ? input : {}
    const base = typeof options.cwd === 'string' && options.cwd !== '' ? options.cwd : cwd
    const rawPath = typeof options.configPath === 'string' ? options.configPath : ''
    const configPath = rawPath === '' ? defaults.configPath : (isAbsolute(rawPath) ? rawPath : resolvePath(base, rawPath))
    if (!fileExists(configPath)) throw new VerificationError('配置文件不存在：' + configPath)
    const suite = normalizeSuite({ name: '内联用例', cases: options.cases }, undefined)
    const rawBaseline = typeof options.baselinePath === 'string' ? options.baselinePath : ''
    const baselinePath = rawBaseline === '' ? undefined : (isAbsolute(rawBaseline) ? rawBaseline : resolvePath(base, rawBaseline))
    const started = Date.now()
    try {
      const report = runFromFiles({
        configPath: configPath,
        suite: suite,
        baselinePath: baselinePath,
        cwd: base,
        allowOutsideProviders: allowOutsideProviders,
      })
      stats.runs += 1
      stats.lastMs = Date.now() - started
      store(report)
      return report
    } catch (error) {
      stats.failed += 1
      throw error
    }
  }

  // The tool is the plugin. A failure to register it is visible: there would be
  // nothing left to use.
  ctx.effect(function () {
    return ctx.tools.register({
      name: 'split_proof',
      description: [
        '分流验收：读一份 Clash / Mihomo 配置（或订阅导出的 YAML）和一份域名用例，按配置里规则的真实顺序逐条求值，',
        '回答每个域名「期望走哪条路」和「实际命中哪条规则、落到哪个策略」。返回机器可读报告：通过 / 失败 / 无法离线判定，',
        '每条都带命中的规则序号与原文。',
        '期望来自用例文件（direct / proxy / block，或一个具体策略名），**插件不替你猜国内域名应该走哪**。',
        '只读：不连接路由器、不拉取订阅、不写任何设备配置；不联网。',
        '需要 DNS、IP 地理位置库或手机运行时状态才能决定的规则（GEOIP、IP-CIDR 无 IP、远程规则集等）会明确标为无法判定，',
        '而不是猜一个通过。给它 `cases` 里的 ip 可以让 IP 规则变成可判定。',
        '配合 `baseline`（上一次的报告）可以检查「国内规则没变」：回退、修复、新增、删除都会列出来。',
      ].join(''),
      parameters: {
        type: 'object',
        properties: {
          config: { type: 'string', description: '配置文件路径（Clash / Mihomo YAML）。相对路径按 cwd 解析。' },
          suite: { type: 'string', description: '用例 JSON 路径，格式 { "name": "...", "cases": [ {"domain": "...", "expect": "direct"} ] }。与 cases 二选一。' },
          cases: {
            type: 'array',
            description: '内联用例，省掉写文件。每项 {domain, expect, group?, ip?, note?}。与 suite 二选一。',
            items: {
              type: 'object',
              properties: {
                domain: { type: 'string' },
                expect: { type: 'string', description: 'direct / proxy / block，或一个具体策略名（如「节点选择」）。' },
                group: { type: 'string', description: '报告里的分组名，例如「国内」「国外」。' },
                ip: { type: 'string', description: '该域名解析出的 IP，用于判定 IP-CIDR / GEOIP,LAN。' },
                sourceIp: { type: 'string', description: '手机源地址，用于判定 SRC-IP-CIDR。' },
                port: { type: 'integer', description: '目标端口，用于判定 DST-PORT。' },
                network: { type: 'string', description: 'tcp / udp，用于判定 NETWORK。' },
                note: { type: 'string' },
              },
              required: ['domain', 'expect'],
            },
          },
          baseline: { type: 'string', description: '基线报告 JSON 路径（上一次 split_proof 的完整输出）。' },
          cwd: { type: 'string', description: '解析相对路径用的目录。不填则用插件配置的工作目录。' },
          allowOutsideProviders: { type: 'boolean', description: '允许规则集引用配置目录之外的文件，默认 false。' },
        },
        required: ['config'],
        additionalProperties: false,
      },
      output: {
        schema: { type: 'object', description: '分流验收报告：summary、每条用例的期望/实际/命中规则、无法判定的原因与基线对比。' },
        render: function (args, value) {
          const report = value !== undefined && value !== null && value.report !== undefined ? value.report : value
          let text = summarise(report, { maxEach: 12 })
          if (report !== null && report !== undefined && report.baseline !== null && report.baseline !== undefined) {
            text += '\n基线：' + summariseDiff(report.baseline)
          }
          return [{ type: 'text', text: text }]
        },
      },
      isConcurrencySafe: function () { return true },
      presentCall: function (args) {
        const config = args !== undefined && args !== null ? args.config : undefined
        return {
          card: 'generic',
          title: 'split_proof',
          kind: 'read',
          rawInput: args,
          locations: typeof config === 'string' ? [{ path: config }] : undefined,
        }
      },
      execute: async function (args) {
        const safe = args !== null && typeof args === 'object' ? args : {}
        const runCwd = typeof safe.cwd === 'string' && safe.cwd !== '' ? safe.cwd : cwd
        try {
          if (Array.isArray(safe.cases) && safe.cases.length > 0) {
            return runInline({
              configPath: safe.config,
              cases: safe.cases,
              baselinePath: safe.baseline,
              cwd: runCwd,
            })
          }
          const report = runFromFiles({
            configPath: resolveUserPath(safe.config),
            suitePath: resolveUserPath(safe.suite),
            baselinePath: resolveUserPath(safe.baseline),
            cwd: runCwd,
            allowOutsideProviders: safe.allowOutsideProviders === true,
          })
          stats.runs += 1
          store(report)
          return report
        } catch (error) {
          throw new Error('[dsh-split-proof] ' + String((error && error.message) || error))
        }
      },
    })
  })

  // The panel is the disposable half: a route that cannot register must not take
  // the tool down with it.
  ctx.effect(function () {
    let disposeRoute
    try {
      disposeRoute = ctx.webServer.register({
        kind: 'prefix',
        path: ROUTE,
        handler: async function (req, res) {
          try {
            const parts = segmentsOf(req.url)
            if (parts === null) {
              sendJson(res, 404, { error: 'not found' })
              return
            }
            if (req.method === 'GET' && (parts.length === 0 || (parts.length === 1 && parts[0] === 'state'))) {
              sendJson(res, 200, state())
              return
            }
            if (req.method === 'GET' && parts.length === 1 && parts[0] === 'report') {
              if (latest === null) {
                sendHtml(res, 404, '<!doctype html><meta charset="utf-8"><body>还没有验收报告。</body>')
                return
              }
              sendHtml(res, 200, renderReportHtml(latest, { version: info.version }))
              return
            }
            if (req.method === 'GET' && parts.length === 1 && parts[0] === 'report.json') {
              if (latest === null) {
                sendJson(res, 404, { error: 'no report yet' })
                return
              }
              sendJson(res, 200, latest)
              return
            }
            if (req.method !== 'POST') {
              sendJson(res, 405, { error: 'method not allowed' })
              return
            }
            const body = await readBody(req)
            if (parts.length === 1 && parts[0] === 'run') {
              const report = runWithPaths(body)
              sendJson(res, 200, { ok: true, summary: report.summary })
              return
            }
            if (parts.length === 1 && parts[0] === 'demo') {
              const report = runWithPaths({
                configPath: demo.configPath,
                suitePath: demo.suitePath,
                baselinePath: fileExists(demo.baselinePath) ? demo.baselinePath : undefined,
              })
              sendJson(res, 200, { ok: true, summary: report.summary, state: state() })
              return
            }
            if (parts.length === 1 && parts[0] === 'clear') {
              latest = null
              history.length = 0
              sendJson(res, 200, { ok: true })
              return
            }
            sendJson(res, 404, { error: 'unknown method' })
          } catch (error) {
            const status = error instanceof VerificationError || error instanceof SuiteError ? 400 : 500
            sendJson(res, status, { error: String((error && error.message) || error) })
          }
        },
      })
    } catch (error) {
      disposeRoute = undefined
    }
    return function () {
      if (typeof disposeRoute === 'function') disposeRoute()
    }
  })
}

/** Exposed for tests: the route shape is part of the contract. */
export const internals = {
  ROUTE: ROUTE,
  segmentsOf: segmentsOf,
  fixturePaths: fixturePaths,
  summaryEntry: summaryEntry,
}
