import { describe, expect, it } from 'vitest'
import {
  codeForLine,
  lineRangeFor,
  lineScanFor,
  runnableLines
} from '../../../../src/renderer/src/features/runner/runRange'

const py = (...lines) => lines.join('\n')

const ORDERS = py(
  '#!/usr/bin/env python3',
  "# Orders from today's export",
  'orders = [("A-104", 3, 12.50), ("B-221", 1, 89.00)]',
  'total = sum(qty * price for _, qty, price in orders)',
  'print(f"Total: {total:.2f}")',
  'for oid, qty, price in orders:',
  '    print(f"{oid}: {qty}")',
  '',
  'print("Sent")'
)

describe('runnableLines — python', () => {
  it('offers lines with code, not the shebang, a comment or a blank', () => {
    expect([...runnableLines('python', ORDERS)]).toEqual([3, 4, 5, 6, 7, 9])
  })

  it('reads a # inside a string as code', () => {
    expect([...runnableLines('python', 'print("#1")')]).toEqual([1])
  })

  it('offers no line that starts inside a triple-quoted string', () => {
    const text = py('note = """', 'not code', '"""', 'print(note)')
    expect([...runnableLines('python', text)]).toEqual([1, 4])
  })
})

describe('codeForLine — python', () => {
  it('runs lines 1 to N', () => {
    expect(codeForLine('python', ORDERS, 5)).toEqual({
      code: ORDERS.split('\n').slice(0, 5).join('\n'),
      firstLine: 1,
      lastLine: 5
    })
  })

  it('runs a block to its end from the line that opens it', () => {
    expect(codeForLine('python', ORDERS, 6).lastLine).toBe(7)
  })

  it('runs a block line to the end of what sits deeper under it', () => {
    const text = py(
      'for x in xs:',
      '    if x:',
      '        print(x)',
      '    print("-")',
      'print("end")'
    )
    expect(codeForLine('python', text, 2).lastLine).toBe(3)
    expect(codeForLine('python', text, 4).lastLine).toBe(4)
  })

  it('crosses blank lines inside a block but stops before trailing ones', () => {
    const text = py('for x in xs:', '    a = x', '', '    print(a)', '', 'print("end")')
    expect(codeForLine('python', text, 1).lastLine).toBe(4)
  })

  it('carries an open bracket through to its close', () => {
    const text = py('total = sum(', '    x for x in nums', ')', 'print(total)')
    expect(codeForLine('python', text, 1).lastLine).toBe(3)
    expect(codeForLine('python', text, 2).lastLine).toBe(3)
  })

  it('carries a decorator through the definition under it', () => {
    const text = py('@dataclass', 'class Order:', '    id: str', 'print(Order)')
    expect(codeForLine('python', text, 1).lastLine).toBe(3)
  })

  it('carries a triple-quoted string to its close', () => {
    const text = py('note = """', 'not code', '"""', 'print(note)')
    expect(codeForLine('python', text, 1).lastLine).toBe(3)
  })

  it('answers null for a line with no code', () => {
    expect(codeForLine('python', ORDERS, 2)).toBeNull()
    expect(codeForLine('python', ORDERS, 8)).toBeNull()
    expect(codeForLine('python', ORDERS, 99)).toBeNull()
  })
})

const PHP = py(
  '<?php',
  '// Orders',
  '$orders = [3, 1, 2];',
  'foreach ($orders as $o) {',
  '    echo $o, "\\n";',
  '}',
  '/* a note',
  '   over two lines */',
  'echo "done {braces}\\n";'
)

describe('runnableLines — php', () => {
  it('offers lines with code, not the open tag or a comment', () => {
    expect([...runnableLines('php', PHP)]).toEqual([3, 4, 5, 6, 9])
  })

  it('treats # as a comment', () => {
    expect([...runnableLines('php', py('<?php', '# note', 'echo 1;'))]).toEqual([3])
  })
})

describe('codeForLine — php', () => {
  it('runs a braced block to its close, from inside it too', () => {
    expect(codeForLine('php', PHP, 4).lastLine).toBe(6)
    expect(codeForLine('php', PHP, 5).lastLine).toBe(6)
  })

  it('ignores braces inside a string', () => {
    expect(codeForLine('php', PHP, 9).lastLine).toBe(9)
  })

  it('carries a statement with no braces until its semicolon', () => {
    const text = py('<?php', 'if ($x)', '    echo 1;', 'echo 2;')
    expect(codeForLine('php', text, 2).lastLine).toBe(3)
  })

  it('stops at the last line when a block never closes', () => {
    const text = py('<?php', 'foreach ($a as $b) {', '    echo $b;')
    expect(codeForLine('php', text, 2).lastLine).toBe(3)
  })
})

const CURLS = py(
  '# health checks',
  'curl -fsS https://example.com/health',
  '',
  'curl -X POST https://example.com/api \\',
  "  -H 'Content-Type: application/json' \\",
  '  -d \'{"a": 1}\'',
  "curl -d 'two",
  "lines' https://example.com",
  '-H oops'
)

describe('runnableLines — curl', () => {
  it('offers each line that starts a curl command, not its continuations', () => {
    expect([...runnableLines('curl', CURLS)]).toEqual([2, 4, 7])
  })

  it('offers curl.exe too', () => {
    expect([...runnableLines('curl', 'curl.exe https://example.com')]).toEqual([1])
  })
})

describe('codeForLine — curl', () => {
  it('runs that one command, not the ones above it', () => {
    expect(codeForLine('curl', CURLS, 2)).toEqual({
      code: 'curl -fsS https://example.com/health',
      firstLine: 2,
      lastLine: 2
    })
  })

  it('carries a command through its backslash continuations', () => {
    expect(codeForLine('curl', CURLS, 4)).toEqual({
      code: CURLS.split('\n').slice(3, 6).join('\n'),
      firstLine: 4,
      lastLine: 6
    })
  })

  it('carries a quote open across lines to its close', () => {
    expect(lineRangeFor('curl', CURLS, 7)).toEqual({ firstLine: 7, lastLine: 8 })
  })

  it('answers null for a continuation, a comment or a line that is not curl', () => {
    expect(codeForLine('curl', CURLS, 1)).toBeNull()
    expect(codeForLine('curl', CURLS, 5)).toBeNull()
    expect(codeForLine('curl', CURLS, 9)).toBeNull()
  })
})

describe('other languages', () => {
  it('offer no lines', () => {
    expect([...runnableLines('javascript', 'console.log(1)')]).toEqual([])
    expect(codeForLine('javascript', 'console.log(1)', 1)).toBeNull()
  })
})

// Hovering asks on every mouse move; one scan per text keeps that cheap.
describe('scanning', () => {
  it('scans a text once, however often it is asked about', () => {
    const text = 'print(1)\nprint(2)'
    expect(lineScanFor('python', text)).toBe(lineScanFor('python', text))
  })

  it('scans again once the text changes', () => {
    expect(lineScanFor('python', 'print(1)')).not.toBe(lineScanFor('python', 'print(2)'))
  })
})

describe('lineRangeFor', () => {
  it('answers the last line a press runs, or null for a line with no button', () => {
    expect(lineRangeFor('python', ORDERS, 6)).toEqual({ firstLine: 1, lastLine: 7 })
    expect(lineRangeFor('python', ORDERS, 2)).toBeNull()
  })
})
