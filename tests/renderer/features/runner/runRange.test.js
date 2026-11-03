import { describe, expect, it } from 'vitest'
import { codeThrough, runnableLines } from '../../../../src/renderer/src/features/runner/runRange'

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

describe('codeThrough — python', () => {
  it('runs lines 1 to N', () => {
    expect(codeThrough('python', ORDERS, 5)).toEqual({
      code: ORDERS.split('\n').slice(0, 5).join('\n'),
      last: 5
    })
  })

  it('runs a block to its end from the line that opens it', () => {
    expect(codeThrough('python', ORDERS, 6).last).toBe(7)
  })

  it('runs a block line to the end of what sits deeper under it', () => {
    const text = py(
      'for x in xs:',
      '    if x:',
      '        print(x)',
      '    print("-")',
      'print("end")'
    )
    expect(codeThrough('python', text, 2).last).toBe(3)
    expect(codeThrough('python', text, 4).last).toBe(4)
  })

  it('crosses blank lines inside a block but stops before trailing ones', () => {
    const text = py('for x in xs:', '    a = x', '', '    print(a)', '', 'print("end")')
    expect(codeThrough('python', text, 1).last).toBe(4)
  })

  it('carries an open bracket through to its close', () => {
    const text = py('total = sum(', '    x for x in nums', ')', 'print(total)')
    expect(codeThrough('python', text, 1).last).toBe(3)
    expect(codeThrough('python', text, 2).last).toBe(3)
  })

  it('carries a decorator through the definition under it', () => {
    const text = py('@dataclass', 'class Order:', '    id: str', 'print(Order)')
    expect(codeThrough('python', text, 1).last).toBe(3)
  })

  it('carries a triple-quoted string to its close', () => {
    const text = py('note = """', 'not code', '"""', 'print(note)')
    expect(codeThrough('python', text, 1).last).toBe(3)
  })

  it('answers null for a line with no code', () => {
    expect(codeThrough('python', ORDERS, 2)).toBeNull()
    expect(codeThrough('python', ORDERS, 8)).toBeNull()
    expect(codeThrough('python', ORDERS, 99)).toBeNull()
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

describe('codeThrough — php', () => {
  it('runs a braced block to its close, from inside it too', () => {
    expect(codeThrough('php', PHP, 4).last).toBe(6)
    expect(codeThrough('php', PHP, 5).last).toBe(6)
  })

  it('ignores braces inside a string', () => {
    expect(codeThrough('php', PHP, 9).last).toBe(9)
  })

  it('carries a statement with no braces until its semicolon', () => {
    const text = py('<?php', 'if ($x)', '    echo 1;', 'echo 2;')
    expect(codeThrough('php', text, 2).last).toBe(3)
  })

  it('stops at the last line when a block never closes', () => {
    const text = py('<?php', 'foreach ($a as $b) {', '    echo $b;')
    expect(codeThrough('php', text, 2).last).toBe(3)
  })
})

describe('other languages', () => {
  it('offer no lines', () => {
    expect([...runnableLines('javascript', 'console.log(1)')]).toEqual([])
    expect(codeThrough('javascript', 'console.log(1)', 1)).toBeNull()
  })
})
