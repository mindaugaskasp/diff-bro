import { describe, expect, it } from 'vitest'
import { detectSnippetLanguage } from '../../../src/renderer/src/utils/detectLanguage'

const detect = detectSnippetLanguage

describe('detectSnippetLanguage', () => {
  it('returns plaintext for empty content', () => {
    expect(detect('')).toBe('plaintext')
    expect(detect('   ')).toBe('plaintext')
  })

  it('detects valid JSON', () => {
    expect(detect('{"a": 1, "b": [1, 2]}')).toBe('json')
  })

  it('does not misdetect malformed JSON-shaped content as json', () => {
    expect(detect('{a: 1,}')).not.toBe('json')
  })

  it('detects SQL by its leading keyword', () => {
    expect(detect('SELECT * FROM users WHERE id = 1')).toBe('sql')
    expect(detect('insert into users (id) values (1)')).toBe('sql')
    expect(detect('CREATE TABLE users (id INT)')).toBe('sql')
    expect(detect('with recent as (select 1) select * from recent')).toBe('sql')
  })

  it('does not detect sql from a keyword appearing mid-sentence', () => {
    expect(detect('Please select the correct answer from the list below.')).not.toBe('sql')
  })
})

describe('detectSnippetLanguage — markdown', () => {
  it('detects a heading, a link, and combined weak signals', () => {
    expect(detect('# Title\n\nSome text.')).toBe('markdown')
    expect(detect('See the [docs](https://example.com) for more.')).toBe('markdown')
    expect(detect('- item one\n- item two\n1. first\n2. second')).toBe('markdown')
  })

  it('treats a fenced code block as markdown even when it wraps real code', () => {
    expect(detect('Some text\n```js\nconst x = 1\n```')).toBe('markdown')
    expect(detect('Notes:\n```python\ndef f():\n    pass\n```')).toBe('markdown')
  })

  it('does not detect markdown from a single weak signal', () => {
    expect(detect('- just one bullet in plain notes')).toBe('plaintext')
  })
})

describe('detectSnippetLanguage — shebangs', () => {
  it('reads the interpreter from a shebang line', () => {
    expect(detect('#!/usr/bin/env python3\nprint(1)')).toBe('python')
    expect(detect('#!/bin/bash\nls -la')).toBe('shell')
    expect(detect('#!/usr/bin/env node\nconsole.log(1)')).toBe('javascript')
    expect(detect('#!/usr/bin/php\n<?php echo 1;')).toBe('php')
    expect(detect('#!/usr/bin/env perl\nprint "hi"')).toBe('shell') // unknown ⇒ shell
  })
})

describe('detectSnippetLanguage — markup', () => {
  it('detects PHP by its open tag', () => {
    expect(detect('<?php\n$x = 1;\necho $x;')).toBe('php')
  })

  it('detects an XML declaration and generic markup', () => {
    expect(detect('<?xml version="1.0"?>\n<root/>')).toBe('xml')
    expect(detect('<config><item>a</item></config>')).toBe('xml')
    expect(detect('<link rel="stylesheet" href="x.css" />')).toBe('html') // HTML-only tag wins
  })

  it('detects HTML by doctype or html-only tags', () => {
    expect(detect('<!DOCTYPE html>\n<html><body>hi</body></html>')).toBe('html')
    expect(detect('<div class="card"><span>hi</span></div>')).toBe('html')
  })
})

describe('detectSnippetLanguage — config formats', () => {
  it('detects a Dockerfile from FROM plus an instruction', () => {
    expect(detect('FROM node:20\nWORKDIR /app\nRUN npm ci')).toBe('dockerfile')
  })

  it('does not call prose starting with "from" a Dockerfile', () => {
    expect(detect('From the top of the hill you can see the whole town.')).not.toBe('dockerfile')
  })

  it('detects CSS rules and at-rules', () => {
    expect(detect('.card { color: red; padding: 8px; }')).toBe('css')
    expect(detect('@media (max-width: 600px) { .card { display: none } }')).toBe('css')
    expect(detect(':root {\n  --accent: #4c8dff;\n}')).toBe('css')
  })

  it('detects YAML / Kubernetes but not brace-laden or single-key text', () => {
    expect(detect('name: web\nport: 8080\nreplicas: 3')).toBe('yaml')
    expect(detect('apiVersion: v1\nkind: Pod')).toBe('yaml')
    expect(detect('---\nfoo: bar')).toBe('yaml')
    expect(detect('Note: this is a single line of prose.')).toBe('plaintext')
  })
})

describe('detectSnippetLanguage — programming languages', () => {
  it('detects Python', () => {
    expect(detect('def add(a, b):\n    return a + b')).toBe('python')
    expect(detect('import os\n\nif __name__ == "__main__":\n    print(os.getcwd())')).toBe('python')
    expect(detect('class Animal:\n    pass')).toBe('python')
  })

  it('detects JavaScript', () => {
    expect(detect('const add = (a, b) => a + b\nconsole.log(add(1, 2))')).toBe('javascript')
    expect(detect("import { foo } from './foo'\nexport default foo")).toBe('javascript')
    expect(detect('function greet(name) { return `hi ${name}` }')).toBe('javascript')
  })

  it('detects TypeScript by its type-level syntax, before JavaScript', () => {
    expect(detect('interface User {\n  name: string\n  age: number\n}')).toBe('typescript')
    expect(detect('function id(x: number): number {\n  return x\n}')).toBe('typescript')
    expect(detect('type ID = string | number')).toBe('typescript')
    expect(detect('enum Color {\n  Red,\n  Green\n}')).toBe('typescript')
  })

  it('detects Go', () => {
    expect(detect('package main\n\nimport "fmt"\n\nfunc main() {\n  fmt.Println("hi")\n}')).toBe(
      'go'
    )
  })

  it('detects Rust', () => {
    expect(detect('fn main() {\n    let mut x = 1;\n    println!("{}", x);\n}')).toBe('rust')
  })

  it('detects Java', () => {
    expect(detect('public class Main {\n  public static void main(String[] a) {}\n}')).toBe('java')
    expect(detect('import java.util.List;')).toBe('java')
  })

  it('detects PHP without an open tag', () => {
    expect(
      detect(
        'namespace App\\Services;\n\nuse App\\Models\\User;\n\nclass SendbirdClient\n{\n' +
          '    private string $appId;\n\n    public function __construct(string $appId)\n' +
          '    {\n        $this->appId = $appId;\n    }\n}'
      )
    ).toBe('php')
    expect(
      detect(
        '$sendbird = new SendbirdClient($appId);\n' +
          '$channel = $sendbird->createGroupChannel($userIds);\n' +
          'echo $channel->url;'
      )
    ).toBe('php')
    expect(detect('$appId = "ABCD";\n$apiToken = "EFGH";')).toBe('php')
    expect(
      detect("$payload = [\n    'user_ids' => $userIds,\n    'is_distinct' => true,\n];")
    ).toBe('php')
    expect(detect("require_once __DIR__ . '/vendor/autoload.php';")).toBe('php')
  })

  // A `$` sigil and an arrow are not PHP on their own: `$name` is a shell
  // expansion, an f-string field and a jQuery identifier too, and ` -> ` with
  // spaces around it is prose. Every case here detected as PHP once.
  it('does not claim other languages for PHP', () => {
    expect(detect('use std::io;\n\nfn main() {\n    println!("hi");\n}')).toBe('rust')
    expect(detect('const $el = document.querySelector("#app")\nconsole.log($el)')).toBe(
      'javascript'
    )
    expect(detect('name=diffbro\necho "building $name"\nexport OUT=$name.zip')).toBe('shell')
    // PHP writes the type BEFORE the sigil (`private string $x;`); a `$name`
    // followed by a colon is a TypeScript annotation, not a PHP property.
    expect(detect('class Widget {\n  private $el: JQuery\n  show() {}\n}')).toBe('typescript')
    // A jQuery-flavoured parameter name does not make a function PHP.
    expect(detect("function bindTabs($root) {\n  $root.find('.tab').on('click', toggle)\n}")).toBe(
      'javascript'
    )
    expect(detect('export function render($el: HTMLElement): void {\n  $el.remove()\n}')).toBe(
      'javascript'
    )
    // ` -> ` spaced is prose or a shell string; PHP writes `$obj->prop`.
    expect(detect('for f in *.txt; do\n  echo "$f -> done"\ndone')).toBe('shell')
    expect(detect('def run(cmd):\n    print(f"$cmd -> ok")')).toBe('python')
    expect(detect('package main\n\n// $x -> y\nfunc main() {}')).toBe('go')
    // `.` is string concatenation in PHP, never member access — a dotted call
    // on a sigil variable is jQuery-era JavaScript.
    expect(detect("$el = document.querySelector('#app');\n$el.classList.add('ready');")).toBe(
      'plaintext'
    )
    expect(detect('public class Money {\n  private String $amount;\n}')).toBe('java')
    // An arrow inside a sentence is prose quoting code, not code.
    expect(detect('# Notes\n\nCall $client->send() to publish.')).toBe('markdown')
  })

  // Notes ABOUT PHP are the commonest thing a PHP developer stores, and every
  // case here was mislabelled php — which then stuck, because an auto snippet
  // records its verdict on save.
  it('does not claim prose and release notes that mention PHP', () => {
    expect(detect('# 2.1.0\n\n- Dropped the `require_once` bootstrap.\n- Bumped minimums.')).toBe(
      'markdown'
    )
    expect(detect('fix: drop the require_once shim\n\nCloses #12')).toBe('plaintext')
    expect(detect("# Config\n\nSet it:\n\n    $config['url'] = 'https://x';\n\nDone.")).toBe(
      'markdown'
    )
    expect(
      detect('# Autoloading\n\nEvery class declares one:\n\n    namespace App\\Models;\n\nPSR-4.')
    ).toBe('markdown')
    expect(detect('Spreadsheet notes\n\n$Total = SUM(A1:A9);')).toBe('plaintext')
    expect(detect("let $panel\n$panel = $('#panel');\n$panel.show();")).not.toBe('php')
    expect(detect('class A {\n  private $q = makeQ();\n  run(): void {}\n}')).not.toBe('php')
  })

  it('detects shell scripts without a shebang', () => {
    expect(detect('if [ -f x ]; then\n  echo "yes"\nfi')).toBe('shell')
    expect(detect('for f in *.txt; do\n  echo "$f"\ndone')).toBe('shell')
    expect(detect('export API_KEY=secret')).toBe('shell')
  })
})

// Detection runs on content nobody here wrote: restoreBundle feeds an imported
// .diffbro straight through add(), and the snippet cap is 8 MB. A quadratic
// detector is a renderer freeze a stranger can post you.
describe('detectSnippetLanguage — hostile input', () => {
  it('stays fast on a pathological run of whitespace', () => {
    const started = performance.now()
    detect(`public${' '.repeat(200_000)}x`)
    expect(performance.now() - started).toBeLessThan(250)
  })

  it('reads only the head of a very large snippet', () => {
    expect(detect(`${'\n'.repeat(60_000)}<?php echo 1;`)).toBe('plaintext')
  })

  it('is bounded whatever the body is made of', () => {
    for (const filler of [' ', '\n', '\t', 'a', '$', '-', '{']) {
      const started = performance.now()
      detect(filler.repeat(400_000))
      expect(performance.now() - started).toBeLessThan(250)
    }
  })
})

describe('detectSnippetLanguage — anti-false-positive', () => {
  it('leaves ordinary prose as plaintext', () => {
    expect(detect('just a normal paragraph of text with no special shape')).toBe('plaintext')
    expect(detect('Remember to buy milk, eggs, and bread on the way home.')).toBe('plaintext')
  })

  it('does not read a prose colon phrase as a typed annotation', () => {
    expect(detect('Total: number of files processed today was high.')).toBe('plaintext')
  })
})
