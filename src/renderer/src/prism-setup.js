// Prism, configured once for the launcher's preview highlighting. Isolated here
// beside monaco-setup.js for the same reason: the library import belongs at the
// app's edge, not inside the pure utils/ core.
//
// The CORE and named grammars only, never the `prismjs` barrel and never the
// plugins — `prism.js` and `plugins/file-highlight` are the only files in the
// package that touch the network, and neither is reachable from here.
import Prism from 'prismjs/components/prism-core'
import 'prismjs/components/prism-clike'
import 'prismjs/components/prism-markup'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-yaml'
import 'prismjs/components/prism-sql'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-css'
import 'prismjs/components/prism-go'
import 'prismjs/components/prism-rust'
import 'prismjs/components/prism-java'
import 'prismjs/components/prism-php'
import 'prismjs/components/prism-docker'
import 'prismjs/components/prism-markdown'

export default Prism
