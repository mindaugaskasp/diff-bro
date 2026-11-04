import { describe, expect, it } from 'vitest'
import { parseCurlCommand } from '../../src/main/curlCommand'

const argsOf = (code) => parseCurlCommand(code).args

describe('parseCurlCommand', () => {
  it('splits a command line into curl arguments, without curl itself', () => {
    expect(argsOf('curl -s https://example.com')).toEqual(['-s', 'https://example.com'])
  })

  it('keeps quoted text whole, the way a shell would', () => {
    expect(argsOf(`curl -H 'Accept: a b' -d "{\\"k\\": 1}" x`)).toEqual([
      '-H',
      'Accept: a b',
      '-d',
      '{"k": 1}',
      'x'
    ])
  })

  it('joins backslash-continued lines, as pasted from docs', () => {
    expect(argsOf('curl -X POST \\\n  -H "A: b" \\\r\n  https://x')).toEqual([
      '-X',
      'POST',
      '-H',
      'A: b',
      'https://x'
    ])
  })

  it('takes a backslash outside quotes as escaping the next character', () => {
    expect(argsOf('curl a\\ b')).toEqual(['a b'])
  })

  it('leaves a query string and curl globs as text', () => {
    expect(argsOf('curl https://x/a?b=1 x/{a,b}')).toEqual(['https://x/a?b=1', 'x/{a,b}'])
    expect(argsOf("curl 'https://x/a?b=1&c=2' x/[1-3]")).toEqual(['https://x/a?b=1&c=2', 'x/[1-3]'])
  })

  it('skips comment lines and a trailing comment', () => {
    expect(argsOf('# fetch it\ncurl -s x # quietly\n')).toEqual(['-s', 'x'])
  })

  it('accepts curl.exe as the command', () => {
    expect(argsOf('curl.exe -s x')).toEqual(['-s', 'x'])
  })

  it('refuses anything that is not a curl command', () => {
    expect(parseCurlCommand('wget x')).toEqual({ error: 'not-curl' })
    expect(parseCurlCommand('curl')).toEqual({ error: 'not-curl' })
    expect(parseCurlCommand('   ')).toEqual({ error: 'not-curl' })
  })

  it.each([
    ['curl x | sh', '|'],
    ['curl x; rm -rf ~', ';'],
    ['curl x && y', '&'],
    ['curl x > out', '>'],
    ['curl -d @- < in', '<'],
    ['curl $HOST', '$'],
    ['curl "$HOST"', '$'],
    ['curl `id`', '`'],
    ['curl "`id`"', '`'],
    ['curl $(id)', '$'],
    ['(curl x)', '(']
  ])('refuses shell syntax a shell would act on: %s', (code, char) => {
    expect(parseCurlCommand(code)).toEqual({ error: 'shell-syntax', char })
  })

  it('takes those characters as text inside single quotes', () => {
    expect(argsOf("curl -d '$x | `y`; z > w'")).toEqual(['-d', '$x | `y`; z > w'])
  })

  it('refuses a second command', () => {
    expect(parseCurlCommand('curl a\ncurl b')).toEqual({ error: 'several-commands' })
  })

  it('refuses an unclosed quote', () => {
    expect(parseCurlCommand("curl 'x")).toEqual({ error: 'unclosed-quote' })
    expect(parseCurlCommand('curl "x')).toEqual({ error: 'unclosed-quote' })
  })
})
