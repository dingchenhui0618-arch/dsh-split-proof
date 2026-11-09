// A small, dependency-free YAML subset parser.
//
// Scope, deliberately: the shapes a Clash / Mihomo profile and a rule-provider
// file actually use — nested block maps and sequences, flow `[a, b]` and
// `{a: b}`, quoted scalars, comments, and `|` / `>` block text. Anchors,
// aliases, tags, multi-document streams and merge keys are NOT interpreted;
// they surface as their literal text so a caller can say "this file uses a
// feature the verifier does not read" instead of silently misreading the rules.
//
// Everything else (rules, providers, matching) is built on top of this file and
// never on a third-party parser: the package has no runtime dependencies.

export class YamlError extends Error {
  constructor(message, line) {
    super(message)
    this.name = 'YamlError'
    this.line = line
  }
}

export function parseYaml(text) {
  const source = String(text === undefined || text === null ? '' : text).replace(/^\uFEFF/, '')
  const lines = source.split(/\r?\n/)
  let pos = 0

  function fail(index, message) {
    throw new YamlError('第 ' + String(index + 1) + ' 行：' + message, index + 1)
  }

  // Comments start at `#` when it is at the start of the line or preceded by
  // whitespace, and never inside quotes. `https://x#y` therefore stays intact.
  function stripComment(raw) {
    let quote = ''
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i]
      if (quote === "'") {
        if (ch === "'") {
          if (raw[i + 1] === "'") {
            i++
            continue
          }
          quote = ''
        }
        continue
      }
      if (quote === '"') {
        if (ch === '\\') {
          i++
          continue
        }
        if (ch === '"') quote = ''
        continue
      }
      if (ch === '"' || ch === "'") {
        quote = ch
        continue
      }
      if (ch === '#' && (i === 0 || /\s/.test(raw[i - 1]))) return raw.slice(0, i)
    }
    return raw
  }

  function significant() {
    while (pos < lines.length) {
      const stripped = stripComment(lines[pos])
      if (stripped.trim() === '') {
        pos++
        continue
      }
      if (/^---\s*$/.test(stripped) || /^\.\.\.\s*$/.test(stripped)) {
        pos++
        continue
      }
      if (/^\t/.test(stripped)) fail(pos, '缩进不能用 Tab')
      const indent = stripped.length - stripped.replace(/^ +/, '').length
      return { indent: indent, content: stripped.slice(indent).replace(/\s+$/, ''), line: pos }
    }
    return null
  }

  function isSeqLine(content) {
    return content === '-' || content.slice(0, 2) === '- '
  }

  function parseNode(minIndent) {
    const line = significant()
    if (line === null || line.indent < minIndent) return null
    if (isSeqLine(line.content)) return parseSeq(line.indent)
    if (splitKey(line.content) !== null) return parseMap(line.indent, null)
    pos = line.line + 1
    return parseValue(line.content, line.line)
  }

  function parseSeq(indent) {
    const out = []
    for (;;) {
      const line = significant()
      if (line === null || line.indent !== indent || !isSeqLine(line.content)) break
      const afterDash = line.content.slice(1)
      const spaces = afterDash.length - afterDash.replace(/^ +/, '').length
      const rest = afterDash.slice(spaces)
      const childIndent = indent + 1 + spaces
      pos = line.line + 1
      if (rest === '') {
        out.push(parseNode(indent + 1))
      } else if (rest[0] === '|' || rest[0] === '>') {
        out.push(parseBlockScalar(indent, rest))
      } else if (splitKey(rest) !== null) {
        out.push(parseMap(childIndent, { content: rest, line: line.line, indent: childIndent }))
      } else {
        out.push(parseValue(rest, line.line))
      }
    }
    return out
  }

  function parseMap(indent, seed) {
    const out = {}
    if (seed !== null && seed !== undefined) assignPair(out, seed.content, seed.indent, seed.line)
    for (;;) {
      const line = significant()
      if (line === null || line.indent < indent) break
      if (line.indent > indent) fail(line.line, '缩进意外加深')
      if (isSeqLine(line.content)) break
      pos = line.line + 1
      assignPair(out, line.content, indent, line.line)
    }
    return out
  }

  function assignPair(out, text, indent, lineNo) {
    const split = splitKey(text)
    if (split === null) fail(lineNo, '这里应该是「键: 值」，实际是「' + text + '」')
    const key = split.key
    const rest = split.rest
    // `key: &anchor` followed by an indented block: the anchor name is dropped
    // (this parser does not resolve aliases), but the block structure is kept.
    if (rest === '' || /^&\S*$/.test(rest)) {
      const next = significant()
      if (next !== null && next.indent > indent) {
        out[key] = parseNode(indent + 1)
      } else {
        out[key] = null
      }
      return
    }
    if (rest[0] === '|' || rest[0] === '>') {
      out[key] = parseBlockScalar(indent, rest)
      return
    }
    out[key] = parseValue(rest, lineNo)
  }

  function parseBlockScalar(indent, header) {
    const folded = header[0] === '>'
    const hint = header.slice(1)
    const chomp = hint.indexOf('-') >= 0 ? 'strip' : (hint.indexOf('+') >= 0 ? 'keep' : 'clip')
    const collected = []
    let blockIndent = -1
    while (pos < lines.length) {
      const raw = lines[pos]
      if (raw.trim() === '') {
        collected.push('')
        pos++
        continue
      }
      const thisIndent = raw.length - raw.replace(/^ +/, '').length
      if (thisIndent <= indent) break
      if (blockIndent < 0) blockIndent = thisIndent
      if (thisIndent < blockIndent) fail(pos, '块文本缩进比它的第一行还浅')
      collected.push(raw.slice(blockIndent))
      pos++
    }
    while (collected.length > 0 && collected[collected.length - 1] === '' && chomp !== 'keep') collected.pop()
    let body
    if (!folded) {
      body = collected.join('\n')
    } else {
      body = ''
      for (const part of collected) {
        if (part === '') body += '\n'
        else if (body === '' || body.endsWith('\n')) body += part
        else body += ' ' + part
      }
    }
    if (chomp === 'strip') return body.replace(/\n+$/, '')
    if (chomp === 'keep') return body.length > 0 ? body + '\n' : ''
    return body.length > 0 ? body + '\n' : ''
  }

  function parseValue(text, lineNo) {
    const trimmed = text.trim()
    if (trimmed === '') return null
    if (trimmed[0] === '[' || trimmed[0] === '{') return parseFlow(trimmed, lineNo)
    if (trimmed[0] === '"' || trimmed[0] === "'") {
      const quote = parseQuoted(trimmed, lineNo)
      if (quote === null) fail(lineNo, '引号没有闭合')
      if (quote.rest.trim() !== '') fail(lineNo, '引号后面还有多余内容')
      return quote.value
    }
    return parseScalar(trimmed)
  }

  function parseScalar(text) {
    if (text === '' || text === '~' || text === 'null' || text === 'Null' || text === 'NULL') return null
    if (text === 'true' || text === 'True' || text === 'TRUE') return true
    if (text === 'false' || text === 'False' || text === 'FALSE') return false
    if (/^[-+]?\d+$/.test(text)) {
      const n = Number(text)
      if (Number.isSafeInteger(n)) return n
      return text
    }
    if (/^[-+]?(\d+\.\d*|\.\d+)$/.test(text) || /^[-+]?(\d+\.\d*|\.\d+)[eE][-+]?\d+$/.test(text)) {
      const n = Number(text)
      if (Number.isFinite(n)) return n
    }
    return text
  }

  function parseQuoted(text, lineNo) {
    const quote = text[0]
    let out = ''
    let i = 1
    if (quote === "'") {
      for (; i < text.length; i++) {
        if (text[i] === "'") {
          if (text[i + 1] === "'") {
            out += "'"
            i++
            continue
          }
          return { value: out, rest: text.slice(i + 1) }
        }
        out += text[i]
      }
      fail(lineNo, '单引号没有闭合')
    }
    for (; i < text.length; i++) {
      const ch = text[i]
      if (ch === '"') return { value: out, rest: text.slice(i + 1) }
      if (ch !== '\\') {
        out += ch
        continue
      }
      i++
      if (i >= text.length) fail(lineNo, '双引号字符串以反斜杠结尾')
      const esc = text[i]
      if (esc === 'n') out += '\n'
      else if (esc === 't') out += '\t'
      else if (esc === 'r') out += '\r'
      else if (esc === 'b') out += '\b'
      else if (esc === 'f') out += '\f'
      else if (esc === '0') out += '\0'
      else if (esc === 'x') {
        const hex = text.slice(i + 1, i + 3)
        if (!/^[0-9a-fA-F]{2}$/.test(hex)) fail(lineNo, '\\x 后面要跟两位十六进制')
        out += String.fromCharCode(parseInt(hex, 16))
        i += 2
      } else if (esc === 'u') {
        const hex = text.slice(i + 1, i + 5)
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail(lineNo, '\\u 后面要跟四位十六进制')
        out += String.fromCharCode(parseInt(hex, 16))
        i += 4
      } else {
        out += esc
      }
    }
    fail(lineNo, '双引号没有闭合')
  }

  function parseFlow(text, lineNo) {
    let i = 0
    function ws() {
      while (i < text.length && /\s/.test(text[i])) i++
    }
    function scalarToken() {
      const start = i
      while (i < text.length && !/[,\]}:]/.test(text[i])) {
        if (text[i] === '"' || text[i] === "'") break
        i++
      }
      return text.slice(start, i).trim()
    }
    function quoted() {
      const quotedValue = parseQuoted(text.slice(i), lineNo)
      if (quotedValue === null) fail(lineNo, '内联集合里的引号没有闭合')
      i += text.length - i - quotedValue.rest.length
      return quotedValue.value
    }
    function value() {
      ws()
      if (text[i] === '[') return list()
      if (text[i] === '{') return map()
      if (text[i] === '"' || text[i] === "'") return quoted()
      const token = scalarToken()
      return parseScalar(token)
    }
    function list() {
      i++
      const out = []
      ws()
      if (text[i] === ']') {
        i++
        return out
      }
      for (;;) {
        out.push(value())
        ws()
        if (text[i] === ',') {
          i++
          ws()
          if (text[i] === ']') {
            i++
            return out
          }
          continue
        }
        if (text[i] === ']') {
          i++
          return out
        }
        fail(lineNo, '内联列表没有闭合')
      }
    }
    function map() {
      i++
      const out = {}
      ws()
      if (text[i] === '}') {
        i++
        return out
      }
      for (;;) {
        ws()
        let key
        if (text[i] === '"' || text[i] === "'") key = String(quoted())
        else {
          const start = i
          while (i < text.length && text[i] !== ':' && text[i] !== ',' && text[i] !== '}') i++
          key = text.slice(start, i).trim()
        }
        ws()
        if (text[i] !== ':') fail(lineNo, '内联映射缺少 ":"')
        i++
        out[key] = value()
        ws()
        if (text[i] === ',') {
          i++
          ws()
          if (text[i] === '}') {
            i++
            return out
          }
          continue
        }
        if (text[i] === '}') {
          i++
          return out
        }
        fail(lineNo, '内联映射没有闭合')
      }
    }
    const out = value()
    ws()
    if (i < text.length) fail(lineNo, '内联集合后面还有多余内容：' + text.slice(i))
    return out
  }

  function splitKey(text) {
    if (text.length === 0) return null
    if (text[0] === '"' || text[0] === "'") {
      const quote = parseQuoted(text, 0)
      if (quote === null) return null
      let i = text.length - quote.rest.length
      while (i < text.length && text[i] === ' ') i++
      if (text[i] !== ':') return null
      if (i + 1 < text.length && text[i + 1] !== ' ') return null
      return { key: String(quote.value), rest: text.slice(i + 1).trim() }
    }
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      if (ch === '[' || ch === '{') return null
      if (ch === ':' && (i + 1 === text.length || text[i + 1] === ' ')) {
        return { key: text.slice(0, i).trim(), rest: text.slice(i + 1).trim() }
      }
    }
    return null
  }

  const value = parseNode(0)
  if (value === null && significant() !== null) fail(pos, '无法解析的内容')
  return value
}

/** Parse a value that must be a map; returns {} for an empty document. */
export function parseYamlMap(text) {
  const value = parseYaml(text)
  if (value === null || value === undefined) return {}
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new YamlError('期望一个映射（键: 值），实际不是', 0)
  }
  return value
}
