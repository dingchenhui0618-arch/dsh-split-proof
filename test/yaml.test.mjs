import { strict as assert } from 'node:assert'
import test from 'node:test'
import { parseYaml, parseYamlMap, YamlError } from '../src/yaml.js'

test('parses the block map + list-of-maps shape a Clash profile uses', () => {
  const doc = parseYaml([
    'port: 7890',
    'mode: rule',
    'proxies:',
    '  - name: HK-01',
    '    type: ss',
    '    port: 8388',
    '  - name: JP-01',
    '    type: ss',
    'proxy-groups:',
    '  - name: 节点选择',
    '    type: select',
    '    proxies:',
    '      - 自动选择',
    '      - DIRECT',
  ].join('\n'))
  assert.equal(doc.port, 7890)
  assert.equal(doc.mode, 'rule')
  assert.equal(doc.proxies.length, 2)
  assert.equal(doc.proxies[0].name, 'HK-01')
  assert.equal(doc.proxies[0].port, 8388)
  assert.deepEqual(doc['proxy-groups'][0].proxies, ['自动选择', 'DIRECT'])
})

test('parses flow lists, flow maps and quoted scalars', () => {
  const doc = parseYaml([
    'a: [one, "two, three", 4, true, null]',
    'b: {x: 1, y: "z"}',
    'c: \'it\'\'s\'',
    'd: "line\\nbreak"',
  ].join('\n'))
  assert.deepEqual(doc.a, ['one', 'two, three', 4, true, null])
  assert.deepEqual(doc.b, { x: 1, y: 'z' })
  assert.equal(doc.c, "it's")
  assert.equal(doc.d, 'line\nbreak')
})

test('comments are stripped outside quotes only', () => {
  const doc = parseYaml([
    'url: https://example.com/#fragment # trailing comment',
    'name: "a # b"',
    'plain: value',
    '  # an indented comment line',
  ].join('\n'))
  assert.equal(doc.url, 'https://example.com/#fragment')
  assert.equal(doc.name, 'a # b')
  assert.equal(doc.plain, 'value')
})

test('scalars keep the type that matters: IPs and versions stay strings', () => {
  const doc = parseYaml([
    'ip: 192.168.1.1',
    'cidr: 10.0.0.0/8',
    'version: 0.1.2',
    'ratio: 0.5',
    'count: 42',
    'yes: true',
    'empty:',
  ].join('\n'))
  assert.equal(doc.ip, '192.168.1.1')
  assert.equal(doc.cidr, '10.0.0.0/8')
  assert.equal(doc.version, '0.1.2')
  assert.equal(doc.ratio, 0.5)
  assert.equal(doc.count, 42)
  assert.equal(doc.yes, true)
  assert.equal(doc.empty, null)
})

test('block literal, folded and strip chomping', () => {
  const doc = parseYaml([
    'literal: |',
    '  line one',
    '  line two',
    'folded: >',
    '  one',
    '  two',
    '',
    '  three',
    'stripped: |-',
    '  only',
    'after: 1',
  ].join('\n'))
  assert.equal(doc.literal, 'line one\nline two\n')
  assert.equal(doc.folded, 'one two\nthree\n')
  assert.equal(doc.stripped, 'only')
  assert.equal(doc.after, 1)
})

test('CRLF and a BOM are tolerated', () => {
  const doc = parseYaml('\uFEFFa: 1\r\nb:\r\n  - x\r\n')
  assert.deepEqual(doc, { a: 1, b: ['x'] })
})

test('empty and comment-only documents become null / {}', () => {
  assert.equal(parseYaml(''), null)
  assert.equal(parseYaml('# nothing here\n\n'), null)
  assert.deepEqual(parseYamlMap(''), {})
})

test('tab indentation is an error, not a silent misread', () => {
  assert.throws(() => parseYaml('a:\n\t- x\n'), YamlError)
})

test('an unclosed quote is an error', () => {
  assert.throws(() => parseYaml('a: "open\n'), YamlError)
})

test('a scalar at the root is returned as-is', () => {
  assert.equal(parseYaml('just a string'), 'just a string')
})

test('duplicate keys: the last one wins (and nothing explodes)', () => {
  assert.deepEqual(parseYaml('a: 1\na: 2\n'), { a: 2 })
})

test('anchors/aliases are not interpreted, but the nested block still parses', () => {
  const doc = parseYaml([
    'defaults: &base',
    '  name: x',
    'copy: *base',
  ].join('\n'))
  assert.deepEqual(doc.defaults, { name: 'x' })
  assert.equal(doc.copy, '*base')
})
