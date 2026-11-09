// Command line: the same verification the plugin runs, without the harness.
//
//   node bin/split-proof.mjs --config fixtures/home-wifi.yaml \
//     --suite fixtures/domestic-foreign.json [--baseline fixtures/baseline.json] \
//     [--html report.html] [--json report.json]
//
// Exit codes are part of the interface, because CI is the second reader:
//   0  every case passed
//   1  at least one case failed
//   2  the config / suite could not be read or parsed (nothing was verified)
//   3  nothing failed, but some cases cannot be decided offline

import { readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, resolve as resolvePath } from 'node:path'
import { runFromFiles, VerificationError } from './verify.js'
import { summarise } from './summary.js'
import { renderReportHtml } from './report-html.js'

function packageInfo() {
  try {
    const text = readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    const parsed = JSON.parse(text)
    return { name: parsed.name || 'dsh-split-proof', version: parsed.version || '0.0.0' }
  } catch (error) {
    return { name: 'dsh-split-proof', version: '0.0.0' }
  }
}

const USAGE = [
  '用法：split-proof --config <配置文件> --suite <用例.json> [选项]',
  '',
  '选项：',
  '  --baseline <报告.json>        与上次的验收报告对比，检查国内规则有没有变',
  '  --html <输出.html>            另存一份自包含 HTML 报告',
  '  --json <输出.json>            另存一份机器可读报告（- 表示打印到 stdout）',
  '  --allow-outside-providers     允许规则集引用配置目录之外的文件（默认禁止）',
  '  --quiet                       只输出一行结论',
  '  --help                        显示这段帮助',
].join('\n')

function parseArgs(argv) {
  const args = { flags: new Set(), values: new Map() }
  const takesValue = new Set(['--config', '--suite', '--baseline', '--html', '--json'])
  for (let i = 0; i < argv.length; i++) {
    const token = String(argv[i])
    if (takesValue.has(token)) {
      const next = argv[i + 1]
      if (next === undefined) throw new VerificationError(token + ' 后面缺少值')
      args.values.set(token, String(next))
      i++
      continue
    }
    if (token === '--allow-outside-providers' || token === '--quiet' || token === '--help') {
      args.flags.add(token)
      continue
    }
    throw new VerificationError('不认识的参数：' + token)
  }
  return args
}

export async function main(argv, io) {
  const out = io !== null && io !== undefined && typeof io.out === 'function' ? io.out : function (text) { process.stdout.write(text + '\n') }
  const err = io !== null && io !== undefined && typeof io.err === 'function' ? io.err : function (text) { process.stderr.write(text + '\n') }
  const cwd = io !== null && io !== undefined && typeof io.cwd === 'string' ? io.cwd : process.cwd()
  const info = packageInfo()

  let args
  try {
    args = parseArgs(argv)
  } catch (error) {
    err('错误：' + error.message)
    err(USAGE)
    return 2
  }
  if (args.flags.has('--help')) {
    out(USAGE)
    return 0
  }
  const configPath = args.values.get('--config')
  const suitePath = args.values.get('--suite')
  if (configPath === undefined || suitePath === undefined) {
    err('错误：--config 和 --suite 都是必填的')
    err(USAGE)
    return 2
  }

  let report
  try {
    report = runFromFiles({
      configPath: configPath,
      suitePath: suitePath,
      baselinePath: args.values.get('--baseline'),
      cwd: cwd,
      allowOutsideProviders: args.flags.has('--allow-outside-providers'),
    })
  } catch (error) {
    err('验收没有跑起来：' + String((error && error.message) || error))
    return 2
  }

  const summary = report.summary
  if (args.flags.has('--quiet')) {
    out('通过 ' + String(summary.pass) + ' / 失败 ' + String(summary.fail) +
      ' / 无法判定 ' + String(summary.indeterminate) + ' / 无效 ' + String(summary.invalid))
  } else {
    out(summarise(report, { maxEach: 12 }))
  }

  const htmlPath = args.values.get('--html')
  if (htmlPath !== undefined) {
    const target = isAbsolute(htmlPath) ? htmlPath : resolvePath(cwd, htmlPath)
    try {
      writeFileSync(target, renderReportHtml(report, { version: info.version }), 'utf8')
      out('HTML 报告：' + target)
    } catch (error) {
      err('HTML 报告写入失败：' + String((error && error.message) || error))
      return 2
    }
  }

  const jsonPath = args.values.get('--json')
  if (jsonPath !== undefined) {
    const text = JSON.stringify(report, null, 2)
    if (jsonPath === '-') {
      out(text)
    } else {
      const target = isAbsolute(jsonPath) ? jsonPath : resolvePath(cwd, jsonPath)
      try {
        writeFileSync(target, text, 'utf8')
        out('JSON 报告：' + target)
      } catch (error) {
        err('JSON 报告写入失败：' + String((error && error.message) || error))
        return 2
      }
    }
  }

  if (summary.invalid > 0 || report.cases.length === 0) return 2
  if (summary.fail > 0) return 1
  if (summary.indeterminate > 0) return 3
  return 0
}

export { USAGE }
