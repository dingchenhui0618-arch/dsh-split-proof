import { strict as assert } from 'node:assert'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { apply } from '../src/host.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const FIXTURES = join(root, 'fixtures')

function setup(options) {
  const settings = options || {}
  const routes = []
  const tools = []
  const disposers = []

  const ctx = {
    tools: {
      register(tool) {
        if (settings.toolsThrow === true) throw new Error('tools service unavailable')
        tools.push(tool)
        return function () {
          const index = tools.indexOf(tool)
          if (index >= 0) tools.splice(index, 1)
        }
      },
    },
    webServer: {
      register(route) {
        if (settings.routeThrows === true) throw new Error('webServer unavailable')
        routes.push(route)
        return function () {
          const index = routes.indexOf(route)
          if (index >= 0) routes.splice(index, 1)
        }
      },
    },
    effect(fn) {
      const disposer = fn()
      disposers.push(typeof disposer === 'function' ? disposer : function () {})
    },
  }

  apply(ctx, { cwd: root })
  return {
    routes: routes,
    tools: tools,
    tool() {
      return tools.find(function (item) { return item.name === 'split_proof' })
    },
    dispose() {
      const pending = disposers.splice(0)
      for (const dispose of pending) dispose()
    },
  }
}

async function request(host, method, url, body) {
  const route = host.routes[0]
  assert.ok(route, 'route is registered')
  const handlers = {}
  let payload = ''
  const res = {
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[name] = value },
    end(text) { payload = String(text) },
  }
  const req = {
    method: method,
    url: url,
    on(event, fn) { handlers[event] = fn },
    destroy() {},
  }
  const pending = Promise.resolve(route.handler(req, res))
  if (handlers.data !== undefined) {
    handlers.data(body === undefined ? '{}' : JSON.stringify(body))
  }
  if (handlers.end !== undefined) handlers.end()
  await pending
  return { status: res.statusCode, text: payload, json: payload !== '' ? safeJson(payload) : undefined }
}

function safeJson(text) {
  try {
    return JSON.parse(text)
  } catch (error) {
    return undefined
  }
}

test('GET state starts empty and points at the bundled sample', async () => {
  const host = setup()
  const response = await request(host, 'GET', '/dsh-split-proof')
  assert.equal(response.status, 200)
  assert.equal(response.json.latest, null)
  assert.ok(response.json.defaults.configPath.endsWith('home-wifi.yaml'))
  assert.ok(response.json.demo.suitePath.endsWith('domestic-foreign.json'))
})

test('POST demo runs the bundled sample and stores the report in memory', async () => {
  const host = setup()
  const demo = await request(host, 'POST', '/dsh-split-proof/demo', {})
  assert.equal(demo.status, 200)
  assert.equal(demo.json.summary.fail, 3)
  assert.equal(demo.json.summary.pass, 17)

  const state = await request(host, 'GET', '/dsh-split-proof/state')
  assert.equal(state.json.latest.summary.total, 23)
  assert.equal(state.json.history.length, 1)
  assert.equal(state.json.latest.baseline.regressions.length, 2)
})

test('GET report serves a self-contained HTML page', async () => {
  const host = setup()
  await request(host, 'POST', '/dsh-split-proof/demo', {})
  const page = await request(host, 'GET', '/dsh-split-proof/report')
  assert.equal(page.status, 200)
  assert.match(page.text, /<!doctype html>/)
  assert.match(page.text, /分流验收/)
  assert.match(page.text, /www\.baidu\.com/)
  assert.match(page.text, /无法离线判定/)
  assert.doesNotMatch(page.text, /<script/)
})

test('GET report before any run is a 404, not an empty page', async () => {
  const host = setup()
  const page = await request(host, 'GET', '/dsh-split-proof/report')
  assert.equal(page.status, 404)
})

test('POST run with no body falls back to the configured defaults', async () => {
  const host = setup()
  const response = await request(host, 'POST', '/dsh-split-proof/run', {})
  assert.equal(response.status, 200)
  assert.equal(response.json.summary.total, 23)
})

test('POST run with a bad path is a 400 with the reason', async () => {
  const host = setup()
  const response = await request(host, 'POST', '/dsh-split-proof/run', { configPath: join(FIXTURES, 'nope.yaml') })
  assert.equal(response.status, 400)
  assert.match(response.json.error, /不存在/)
})

test('a path that only shares the prefix is not the state route', async () => {
  const host = setup()
  const response = await request(host, 'GET', '/dsh-split-proofX')
  assert.equal(response.status, 404)
})

test('the split_proof tool runs inline cases and updates the panel state', async () => {
  const host = setup()
  const tool = host.tool()
  assert.ok(tool, 'split_proof tool registered')
  const report = await tool.execute({
    config: join(FIXTURES, 'home-wifi.yaml'),
    cases: [
      { domain: 'www.taobao.com', expect: 'direct' },
      { domain: 'www.youtube.com', expect: 'proxy' },
      { domain: 'www.baidu.com', expect: 'direct' },
    ],
  })
  assert.equal(report.summary.pass, 2)
  assert.equal(report.summary.fail, 1)

  const state = await request(host, 'GET', '/dsh-split-proof/state')
  assert.equal(state.json.latest.summary.total, 3)

  const rendered = tool.output.render({}, report)
  assert.equal(rendered[0].type, 'text')
  assert.match(rendered[0].text, /分流验收/)
  assert.match(rendered[0].text, /www\.baidu\.com/)
})

test('the tool rejects a missing suite and a missing config clearly', async () => {
  const host = setup()
  const tool = host.tool()
  await assert.rejects(async function () {
    await tool.execute({ config: join(FIXTURES, 'home-wifi.yaml') })
  }, /没有给用例路径/)
  await assert.rejects(async function () {
    await tool.execute({ config: join(FIXTURES, 'nope.yaml'), cases: [{ domain: 'a.com', expect: 'direct' }] })
  }, /配置文件不存在/)
})

test('unloading removes both the route and the tool', () => {
  const host = setup()
  assert.equal(host.routes.length, 1)
  assert.equal(host.tools.length, 1)
  host.dispose()
  assert.equal(host.routes.length, 0)
  assert.equal(host.tools.length, 0)
})

test('a webServer that refuses to register does not take the tool down', async () => {
  const host = setup({ routeThrows: true })
  assert.equal(host.routes.length, 0)
  const report = await host.tool().execute({
    config: join(FIXTURES, 'home-wifi.yaml'),
    cases: [{ domain: 'router.lan', expect: 'direct', ip: '192.168.1.1' }],
  })
  assert.equal(report.summary.pass, 1)
})

test('a tools service that refuses to register fails the plugin loudly', () => {
  assert.throws(function () { setup({ toolsThrow: true }) }, /tools service unavailable/)
})
