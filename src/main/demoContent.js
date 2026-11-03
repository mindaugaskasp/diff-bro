// The core tour's sample pair, shipped as content: main writes nothing and the
// renderer never names a file.
const SAMPLE_FILES = [
  {
    name: 'config-v1.json',
    body: `{
  "name": "diffbro-demo",
  "version": "1.0.0",
  "settings": {
    "fontSize": 13,
    "autoSave": false,
    "telemetry": true
  },
  "plugins": ["linter"]
}
`
  },
  {
    name: 'config-v2.json',
    body: `{
  "name": "diffbro-demo",
  "version": "2.0.0",
  "settings": {
    "fontSize": 14,
    "autoSave": true
  },
  "plugins": ["linter", "spellcheck"],
  "experimental": {
    "fastDiff": true
  }
}
`
  }
]

/** @returns {{ name: string, path: null, content: string }[]} */
export const demoPayloads = () =>
  SAMPLE_FILES.map(({ name, body }) => ({ name, path: null, content: body }))
