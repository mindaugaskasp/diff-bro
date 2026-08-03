// Image export: the screenshot pipeline, its failure paths and the grid it
// photographs. Split out of diffStore.test.js — every feature was appending to
// the end of one 2700-line file, which made three merge conflicts that carried
// no information.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useDiffStore } from '../../../src/renderer/src/stores/diffStore'
import { useVaultStore } from '../../../src/renderer/src/stores/vaultStore'
import { useSettingsStore } from '../../../src/renderer/src/stores/settingsStore'
import { useSnippetStore } from '../../../src/renderer/src/stores/snippetStore'
import {
  elementScroller,
  getDiffScroller,
  setDiffScroller
} from '../../../src/renderer/src/utils/diffScroller'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  window.api = {}
})

const FILE = (name) => ({ path: `/tmp/${name}`, name, content: `content of ${name}` })

describe('exportImage (saved diffs only)', () => {
  // A .content box for captureRectOf to measure, plus a synchronous rAF so the
  // "wait for Monaco" frames resolve without a real compositor.
  function stageViewer() {
    const el = document.createElement('div')
    el.className = 'content'
    el.getBoundingClientRect = () => ({ left: 260, top: 88, width: 900, height: 640 })
    document.body.append(el)
    window.requestAnimationFrame = (cb) => setTimeout(cb, 0)
    return () => el.remove()
  }

  async function savedDiff(payload, name = 'Nightly config') {
    const vault = useVaultStore()
    window.api.vaultEncrypt = async (plaintext) => ({ iv: 'iv', data: plaintext })
    window.api.vaultDecrypt = async (box) => box.data
    return vault.save(name, null, payload)
  }

  const CAPTURE = { dataUrl: 'data:image/png;base64,SHOT', width: 1800, height: 1280 }

  it('opens the saved diff, shoots the diff column, and previews the result', async () => {
    const cleanup = stageViewer()
    const store = useDiffStore()
    const id = await savedDiff({ mode: 'files', left: FILE('a.txt'), right: FILE('b.txt') })
    let rect = null
    let shot = null
    window.api.captureDiffImage = async (r) => {
      rect = r
      // What is on screen AT THE SHOT is the saved diff; afterwards it is not.
      shot = [store.left?.name, store.right?.name]
      return CAPTURE
    }

    await store.exportImage(id)

    expect(shot).toEqual(['a.txt', 'b.txt'])
    expect(rect).toEqual({ x: 260, y: 88, width: 900, height: 640 })
    expect(store.imageEntry).toMatchObject({ id, name: 'Nightly config', ...CAPTURE })
    expect(store.imageCapturing).toBe(false)
    cleanup()
  })

  it('keeps the app out of its own screenshot while the shutter is open', async () => {
    const cleanup = stageViewer()
    const store = useDiffStore()
    const id = await savedDiff({ mode: 'files', left: FILE('a.txt'), right: FILE('b.txt') })
    let capturingDuringShot = null
    window.api.captureDiffImage = async () => {
      capturingDuringShot = store.imageCapturing
      return CAPTURE
    }
    await store.exportImage(id)
    // App.vue hides the toast and the shortcut bar off this flag — they float
    // inside the captured region, so they must be gone when the shot is taken.
    expect(capturingDuringShot).toBe(true)
    expect(store.imageCapturing).toBe(false)
    cleanup()
  })

  it('waits for frames to pass before capturing, so Monaco has repainted', async () => {
    const cleanup = stageViewer()
    const store = useDiffStore()
    const id = await savedDiff({ mode: 'files', left: FILE('a.txt'), right: FILE('b.txt') })
    let framesBeforeShot = 0
    let frames = 0
    window.requestAnimationFrame = (cb) => {
      frames++
      setTimeout(cb, 0)
    }
    window.api.captureDiffImage = async () => ((framesBeforeShot = frames), CAPTURE)
    await store.exportImage(id)
    expect(framesBeforeShot).toBeGreaterThan(1)
    cleanup()
  })

  // The reported bug: the picture showed the two files with no highlights at
  // all, so a real difference looked like no difference. Monaco computes the
  // diff in a worker and paints its decorations only when that returns, which
  // is long after the handful of frames the shutter used to count.
  it('waits for Monaco to finish diffing before shooting, not just for frames', async () => {
    const cleanup = stageViewer()
    const store = useDiffStore()
    const id = await savedDiff({ mode: 'files', left: FILE('a.txt'), right: FILE('b.txt') })
    let frames = 0
    window.requestAnimationFrame = (cb) => {
      frames++
      // DiffViewer bumps this from onDidUpdateDiff; here the worker is slow.
      if (frames === 20) store.diffRevision++
      setTimeout(cb, 0)
    }
    let revisionAtShot = null
    window.api.captureDiffImage = async () => ((revisionAtShot = store.diffRevision), CAPTURE)

    await store.exportImage(id)

    expect(revisionAtShot).toBe(1)
    cleanup()
  })

  // A diff taller than its pane cannot be photographed in one shot, so the
  // export scrolls Monaco and main joins the strips. Without this the picture
  // stopped at the bottom of the visible pane.
  describe('a diff taller than the pane', () => {
    // .content at y=88 h=640, with Monaco starting at y=140 — so 588px of pane
    // under a 52px header.
    function stageTallViewer({ contentHeight }) {
      const pane = document.createElement('div')
      pane.className = 'diff-container'
      pane.getBoundingClientRect = () => ({ top: 140, height: 588 })
      const el = document.createElement('div')
      el.className = 'content'
      el.getBoundingClientRect = () => ({ left: 260, top: 88, width: 900, height: 640 })
      el.append(pane)
      document.body.append(el)
      window.requestAnimationFrame = (cb) => setTimeout(cb, 0)
      let scrollTop = 0
      setDiffScroller({
        contentHeight: () => contentHeight,
        viewportHeight: () => 588,
        scrollTop: () => scrollTop,
        scrollTo: (top) => (scrollTop = top)
      })
      return () => {
        el.remove()
        setDiffScroller(null)
      }
    }

    it('scrolls through the diff and stitches the strips into one picture', async () => {
      const cleanup = stageTallViewer({ contentHeight: 1400 })
      const store = useDiffStore()
      const id = await savedDiff({ mode: 'files', left: FILE('a.txt'), right: FILE('b.txt') })
      const appended = []
      window.api.captureDiffImage = async () => {
        throw new Error('a tall diff must not be shot in one frame')
      }
      window.api.appendDiffImageSlice = async (rect, reset) => {
        appended.push({ rect, reset, scrolledTo: getDiffScroller().scrollTop() })
        return { ok: true }
      }
      window.api.stitchDiffImage = async () => CAPTURE

      await store.exportImage(id)

      // 1400px of diff over a 588px pane: two full viewports, then a 224px tail
      // shot at the scroll clamp (1400 - 588 = 812) and cropped to its bottom.
      expect(appended.map((a) => a.scrolledTo)).toEqual([0, 588, 812])
      expect(appended.map((a) => a.reset)).toEqual([true, false, false])
      // The header rides on the first strip only, never repeated.
      expect(appended[0].rect).toEqual({ x: 260, y: 88, width: 900, height: 52 + 588 })
      expect(appended[1].rect).toEqual({ x: 260, y: 140, width: 900, height: 588 })
      expect(appended[2].rect).toEqual({ x: 260, y: 140 + 364, width: 900, height: 224 })
      expect(store.imageEntry).toMatchObject({ id, ...CAPTURE, truncated: false })
      cleanup()
    })

    it('puts the reader back where they were when the shutter closes', async () => {
      const cleanup = stageTallViewer({ contentHeight: 1400 })
      const store = useDiffStore()
      const id = await savedDiff({ mode: 'files', left: FILE('a.txt'), right: FILE('b.txt') })
      getDiffScroller().scrollTo(300)
      window.api.appendDiffImageSlice = async () => ({ ok: true })
      window.api.stitchDiffImage = async () => CAPTURE
      await store.exportImage(id)
      expect(getDiffScroller().scrollTop()).toBe(300)
      cleanup()
    })

    it('stops slicing at the configured ceiling and admits the picture is cut short', async () => {
      const cleanup = stageTallViewer({ contentHeight: 200_000 })
      const store = useDiffStore()
      const settings = useSettingsStore()
      settings.setMaxExportHeightPx(2940) // five 588px viewports
      const id = await savedDiff({ mode: 'files', left: FILE('a.txt'), right: FILE('b.txt') })
      let covered = 0
      window.api.appendDiffImageSlice = async (rect, reset) => {
        covered += reset ? rect.height - 52 : rect.height // the header rides slice one
        return { ok: true }
      }
      window.api.stitchDiffImage = async () => CAPTURE
      await store.exportImage(id)
      expect(covered).toBe(2940)
      expect(store.imageEntry.truncated).toBe(true)
      cleanup()
    })

    // The ceiling is in screen pixels, so the same diff exports the same amount
    // whatever the display scale — expressing it in device pixels made a Retina
    // machine capture half as much as a 1× one from identical settings.
    it('covers the same amount of diff whatever the display scale', async () => {
      const covered = async (dpr) => {
        setActivePinia(createPinia())
        const cleanup = stageTallViewer({ contentHeight: 200_000 })
        window.devicePixelRatio = dpr
        const store = useDiffStore()
        useSettingsStore().setMaxExportHeightPx(2940)
        window.api.vaultEncrypt = async (plaintext) => ({ iv: 'iv', data: plaintext })
        window.api.vaultDecrypt = async (box) => box.data
        const id = await useVaultStore().save('t', null, {
          mode: 'files',
          left: FILE('a.txt'),
          right: FILE('b.txt')
        })
        let total = 0
        window.api.appendDiffImageSlice = async (rect, reset) => {
          total += reset ? rect.height - 52 : rect.height
          return { ok: true }
        }
        window.api.stitchDiffImage = async () => CAPTURE
        await store.exportImage(id)
        cleanup()
        return total
      }
      expect(await covered(1)).toBe(await covered(2))
    })

    it('gives up on a refused strip instead of stitching a partial picture', async () => {
      const cleanup = stageTallViewer({ contentHeight: 1400 })
      const store = useDiffStore()
      const id = await savedDiff({ mode: 'files', left: FILE('a.txt'), right: FILE('b.txt') })
      let stitched = false
      window.api.appendDiffImageSlice = async (_r, reset) =>
        reset ? { ok: true } : { error: 'bad-rect' }
      window.api.stitchDiffImage = async () => ((stitched = true), CAPTURE)
      await store.exportImage(id)
      expect(stitched).toBe(false)
      expect(store.imageEntry).toBeNull()
      expect(store.notice).toContain('Could not take a picture')
      cleanup()
    })
  })

  // Exporting what's on screen, with lines selected in either pane narrowing the
  // picture to just those.
  describe('exportCurrentImage', () => {
    function stageSelectable({ contentHeight, selection }) {
      const pane = document.createElement('div')
      pane.className = 'diff-container'
      pane.getBoundingClientRect = () => ({ top: 140, height: 588 })
      const el = document.createElement('div')
      el.className = 'content'
      el.getBoundingClientRect = () => ({ left: 260, top: 88, width: 900, height: 640 })
      el.append(pane)
      document.body.append(el)
      window.requestAnimationFrame = (cb) => setTimeout(cb, 0)
      let scrollTop = 0
      setDiffScroller({
        contentHeight: () => contentHeight,
        viewportHeight: () => 588,
        scrollTop: () => scrollTop,
        scrollTo: (top) => (scrollTop = top),
        selection: () => selection
      })
      return () => {
        el.remove()
        setDiffScroller(null)
      }
    }

    const loaded = (store) => {
      store.left = FILE('a.txt')
      store.right = FILE('b.txt')
      store.mode = 'files'
    }

    it('captures only the selected band, not the whole diff', async () => {
      const cleanup = stageSelectable({
        contentHeight: 4000,
        selection: { top: 1000, bottom: 1300 }
      })
      const store = useDiffStore()
      loaded(store)
      const rects = []
      window.api.appendDiffImageSlice = async (rect, reset) => (
        rects.push({ rect, reset }),
        { ok: true }
      )
      window.api.stitchDiffImage = async () => CAPTURE
      window.api.captureDiffImage = async () => {
        throw new Error('a selection must not fall back to the whole-column shot')
      }

      await store.exportCurrentImage()

      expect(rects).toHaveLength(1)
      // Scrolled to the top of the selection; the header rides above it.
      expect(rects[0]).toEqual({
        rect: { x: 260, y: 88, width: 900, height: 52 + 300 },
        reset: true
      })
      expect(store.imageEntry).toMatchObject({ id: null, name: 'a.txt ↔ b.txt' })
      cleanup()
    })

    it('reaches a selection at the very end through Monaco’s scroll clamp', async () => {
      const cleanup = stageSelectable({
        contentHeight: 4000,
        selection: { top: 3800, bottom: 4000 }
      })
      const store = useDiffStore()
      loaded(store)
      const rects = []
      window.api.appendDiffImageSlice = async (rect) => (rects.push(rect), { ok: true })
      window.api.stitchDiffImage = async () => CAPTURE
      await store.exportCurrentImage()
      // 4000 - 588 = 3412 is as far as it scrolls, so the band sits 388px down.
      expect(getDiffScroller().scrollTop()).toBe(0) // and it is put back after
      expect(rects[0].height).toBe(52 + 200)
      cleanup()
    })

    it('captures the whole diff when no lines are selected', async () => {
      const cleanup = stageSelectable({ contentHeight: 300, selection: null })
      const store = useDiffStore()
      loaded(store)
      let rect = null
      window.api.captureDiffImage = async (r) => ((rect = r), CAPTURE)
      await store.exportCurrentImage()
      expect(rect).toEqual({ x: 260, y: 88, width: 900, height: 640 })
      expect(store.imageEntry).toMatchObject({ id: null })
      cleanup()
    })

    it('refuses when there is no comparison on screen', async () => {
      const cleanup = stageSelectable({ contentHeight: 300, selection: null })
      const store = useDiffStore()
      store.mode = 'paste'
      let called = false
      window.api.captureDiffImage = async () => ((called = true), CAPTURE)
      await store.exportCurrentImage()
      expect(called).toBe(false)
      expect(store.imageEntry).toBeNull()
      expect(store.notice).toContain('Nothing to export')
      cleanup()
    })
  })

  it('exports nothing for an id that is not a saved diff', async () => {
    const cleanup = stageViewer()
    const store = useDiffStore()
    // The live comparison is deliberately NOT a source: saved diffs only.
    store.left = FILE('onscreen.txt')
    store.right = FILE('other.txt')
    let called = false
    window.api.captureDiffImage = async () => ((called = true), CAPTURE)
    await store.exportImage('no-such-id')
    expect(store.imageEntry).toBeNull()
    expect(called).toBe(false)
    cleanup()
  })

  it('shoots the SAVED entry, never whatever was already on screen', async () => {
    const cleanup = stageViewer()
    const store = useDiffStore()
    const id = await savedDiff({
      mode: 'files',
      left: FILE('saved-l.txt'),
      right: FILE('saved-r.txt')
    })
    store.left = FILE('onscreen-l.txt')
    store.right = FILE('onscreen-r.txt')
    store.diffSaved = false
    let shot = null
    window.api.captureDiffImage = async () => {
      shot = [store.left?.name, store.right?.name]
      return CAPTURE
    }
    await store.exportImage(id)
    expect(shot).toEqual(['saved-l.txt', 'saved-r.txt'])
    // ...and the comparison the user was working on is handed straight back.
    expect(store.left).toMatchObject({ name: 'onscreen-l.txt' })
    expect(store.right).toMatchObject({ name: 'onscreen-r.txt' })
    expect(store.diffSaved).toBe(false)
    cleanup()
  })

  it('reports an entry that no longer decrypts and photographs nothing', async () => {
    const cleanup = stageViewer()
    const store = useDiffStore()
    const id = await savedDiff({ mode: 'files', left: FILE('a.txt'), right: FILE('b.txt') })
    window.api.vaultDecrypt = async () => null
    let called = false
    window.api.captureDiffImage = async () => ((called = true), CAPTURE)
    await store.exportImage(id)
    expect(called).toBe(false)
    expect(store.imageEntry).toBeNull()
    expect(store.notice).toContain('expired or could not be decrypted')
    cleanup()
  })

  it('reports a refused capture instead of opening an empty preview', async () => {
    const cleanup = stageViewer()
    const store = useDiffStore()
    const id = await savedDiff({ mode: 'files', left: FILE('a.txt'), right: FILE('b.txt') })
    window.api.captureDiffImage = async () => ({ error: 'bad-rect' })
    await store.exportImage(id)
    expect(store.imageEntry).toBeNull()
    expect(store.imageCapturing).toBe(false)
    expect(store.notice).toContain('Could not take a picture')
    cleanup()
  })

  it('does not call main when there is no diff column to measure', async () => {
    const store = useDiffStore()
    window.requestAnimationFrame = (cb) => setTimeout(cb, 0)
    const id = await savedDiff({ mode: 'files', left: FILE('a.txt'), right: FILE('b.txt') })
    let called = false
    window.api.captureDiffImage = async () => ((called = true), CAPTURE)
    await store.exportImage(id) // no .content element staged
    expect(called).toBe(false)
    expect(store.imageEntry).toBeNull()
    expect(store.notice).toContain('Could not take a picture')
  })

  it('copyImage asks main for the capture it is holding, and acknowledges', async () => {
    const store = useDiffStore()
    let called = 0
    window.api.copyDiffImage = async (...args) => {
      called++
      // No image bytes travel back to main — it still has the bitmap.
      expect(args).toHaveLength(0)
      return { ok: true }
    }
    expect(await store.copyImage()).toBe(true)
    expect(called).toBe(1)
    expect(store.notice).toContain('copied to clipboard')
  })

  it('copyImage reports a refusal rather than claiming success', async () => {
    const store = useDiffStore()
    window.api.copyDiffImage = async () => ({ ok: false, error: 'nothing-captured' })
    expect(await store.copyImage()).toBe(false)
    expect(store.notice).toContain('Could not copy')
  })

  it('saveImage names the file after the saved diff and says where it landed', async () => {
    const store = useDiffStore()
    store.imageEntry = { id: 'x', name: 'Nightly config' }
    let sentName = null
    window.api.saveDiffImage = async (name) => {
      sentName = name
      return { ok: true, path: '/tmp/Nightly config.png' }
    }
    await store.saveImage()
    expect(sentName).toBe('Nightly config')
    expect(store.notice).toContain('/tmp/Nightly config.png')
  })

  it('saveImage stays quiet when the save dialog was cancelled', async () => {
    const store = useDiffStore()
    window.api.saveDiffImage = async () => ({ canceled: true })
    await store.saveImage()
    expect(store.notice).toBeNull()
  })

  it('saveImage surfaces a failed write', async () => {
    const store = useDiffStore()
    window.api.saveDiffImage = async () => ({ ok: false, error: 'nothing-captured' })
    await store.saveImage()
    expect(store.notice).toContain('Could not save')
  })

  it('closing the preview tells main to drop the bitmap it was holding', async () => {
    const store = useDiffStore()
    let forgotten = false
    window.api.forgetDiffImage = async () => ((forgotten = true), { ok: true })
    store.imageEntry = { id: 'x', name: 'n', dataUrl: 'data:image/png;base64,SHOT' }
    store.closeImageExport()
    expect(store.imageEntry).toBeNull()
    expect(forgotten).toBe(true)
  })
})

describe('exportImage failure handling', () => {
  it('never leaves the app chrome hidden when the capture throws', async () => {
    const store = useDiffStore()
    const vault = useVaultStore()
    window.api.vaultEncrypt = async (plaintext) => ({ iv: 'iv', data: plaintext })
    window.api.vaultDecrypt = async (box) => box.data
    window.requestAnimationFrame = (cb) => setTimeout(cb, 0)
    const el = document.createElement('div')
    el.className = 'content'
    el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 900, height: 640 })
    document.body.append(el)
    const id = await vault.save('boom', null, {
      mode: 'files',
      left: FILE('a.txt'),
      right: FILE('b.txt')
    })
    window.api.captureDiffImage = async () => {
      throw new Error('IPC exploded')
    }

    await store.exportImage(id)

    // A stuck flag would hide the shortcut bar for the rest of the session.
    expect(store.imageCapturing).toBe(false)
    expect(store.imageEntry).toBeNull()
    expect(store.notice).toContain('Could not take a picture')
    el.remove()
  })
})

// A snippet is photographed by putting it on a stage over the diff column and
// firing the SAME shutter. The stage is a component, so these tests drive its
// "I'm painted" signal by hand — what they pin is the store's half: the subject
// staged, the wait before the shot, and the stage always coming down.
describe('exportSnippetImage', () => {
  const CAPTURE = { dataUrl: 'data:image/png;base64,SHOT', width: 1200, height: 700 }

  function stageColumn() {
    const el = document.createElement('div')
    el.className = 'content'
    el.getBoundingClientRect = () => ({ left: 260, top: 88, width: 900, height: 640 })
    document.body.append(el)
    return () => el.remove()
  }

  // Paint the stage a few frames in, the way the real component does once its
  // highlighting settles or Mermaid returns.
  function paintAfter(store, frames, mark = 'ready') {
    let seen = 0
    window.requestAnimationFrame = (cb) => {
      seen++
      if (seen === frames && store.snippetShot) store.snippetShot[mark] = true
      setTimeout(cb, 0)
    }
    return () => seen
  }

  async function addSnippet(over = {}) {
    const snippets = useSnippetStore()
    window.api.vaultEncrypt = async (plaintext) => ({ iv: 'iv', data: plaintext })
    window.api.vaultDecrypt = async (box) => box.data
    return snippets.add({
      name: 'Deploy steps',
      content: '{ "a": 1 }',
      language: 'json',
      ...over
    })
  }

  it('stages the snippet, shoots it, and previews it', async () => {
    const cleanup = stageColumn()
    const store = useDiffStore()
    const id = await addSnippet()
    paintAfter(store, 2)
    let staged = null
    window.api.captureDiffImage = async () => {
      staged = store.snippetShot && { ...store.snippetShot }
      return CAPTURE
    }

    await store.exportSnippetImage(id)

    // The snippet really was on screen when the shutter opened...
    expect(staged).toMatchObject({ name: 'Deploy steps', lang: 'json', code: '{ "a": 1 }' })
    expect(store.imageEntry).toMatchObject({ id, name: 'Deploy steps', subject: 'snippet' })
    // ...and the column is the user's again afterwards.
    expect(store.snippetShot).toBeNull()
    expect(store.imageCapturing).toBe(false)
    cleanup()
  })

  it('names a diagram as a diagram, since that is what was photographed', async () => {
    const cleanup = stageColumn()
    const store = useDiffStore()
    const id = await addSnippet({
      name: 'Flow',
      content: 'flowchart TD\n A-->B',
      language: 'mermaid'
    })
    paintAfter(store, 2)
    window.api.captureDiffImage = async () => CAPTURE

    await store.exportSnippetImage(id)

    expect(store.imageEntry).toMatchObject({ name: 'Flow', subject: 'diagram' })
    cleanup()
  })

  // Counting frames is what once photographed a diff with no highlights at all.
  // Mermaid renders behind a 2.8 MB dynamic import and a cold grammar tokenizes
  // untyped, so the stage says when it is painted and the shutter waits.
  it('does not shoot until the stage says it is painted', async () => {
    const cleanup = stageColumn()
    const store = useDiffStore()
    const id = await addSnippet()
    const frames = paintAfter(store, 30)
    let framesAtShot = null
    window.api.captureDiffImage = async () => ((framesAtShot = frames()), CAPTURE)

    await store.exportSnippetImage(id)

    expect(framesAtShot).toBeGreaterThanOrEqual(30)
    expect(store.imageEntry).toMatchObject({ subject: 'snippet' })
    cleanup()
  })

  it('takes no picture of a diagram that would not render', async () => {
    const cleanup = stageColumn()
    const store = useDiffStore()
    const id = await addSnippet({ name: 'Broken', content: 'flowchart ???', language: 'mermaid' })
    paintAfter(store, 2, 'failed')
    let shots = 0
    window.api.captureDiffImage = async () => (shots++, CAPTURE)

    await store.exportSnippetImage(id)

    expect(shots).toBe(0)
    expect(store.imageEntry).toBeNull()
    expect(store.notice).toContain('could not be rendered')
    expect(store.snippetShot).toBeNull()
    cleanup()
  })

  // A photograph of a masked secret is either useless or a leak, so it is
  // refused before anything decrypts it.
  it('refuses a secret snippet without decrypting it', async () => {
    const cleanup = stageColumn()
    const store = useDiffStore()
    const id = await addSnippet({ name: 'API key', content: 'sk-live-xyz', secret: true })
    let decrypts = 0
    const decrypt = window.api.vaultDecrypt
    window.api.vaultDecrypt = async (box) => (decrypts++, decrypt(box))
    let shots = 0
    window.api.captureDiffImage = async () => (shots++, CAPTURE)

    await store.exportSnippetImage(id)

    expect(decrypts).toBe(0)
    expect(shots).toBe(0)
    expect(store.imageEntry).toBeNull()
    expect(store.snippetShot).toBeNull()
    expect(store.notice).toContain('Hidden')
    cleanup()
  })

  it('takes the stage down even when the capture fails', async () => {
    const cleanup = stageColumn()
    const store = useDiffStore()
    const id = await addSnippet()
    paintAfter(store, 2)
    window.api.captureDiffImage = async () => {
      throw new Error('IPC exploded')
    }

    await store.exportSnippetImage(id)

    expect(store.snippetShot).toBeNull()
    expect(store.imageCapturing).toBe(false)
    expect(store.imageEntry).toBeNull()
    expect(store.notice).toContain('Could not take a picture')
    cleanup()
  })
})

// The grid scrolls inside itself with no scroller to drive, so the shutter could
// only ever catch the visible slice. Refused outright rather than truncated.
describe('image export and the spreadsheet grid', () => {
  const SHOT = { dataUrl: 'data:image/png;base64,GRID', width: 900, height: 1800 }
  // jsdom's scroll metrics are read-only getters that always answer 0.
  const sizeOf = (el, dims) => {
    for (const [k, value] of Object.entries(dims)) Object.defineProperty(el, k, { value })
  }
  const grid = (name) => ({
    path: `/tmp/${name}`,
    name,
    kind: 'spreadsheet',
    sheets: [{ name: 'S1', rows: [['a', 1]] }]
  })

  // The grid scrolls inside itself with no Monaco behind it. It registers its
  // own scroller, which is all the export needs — scroll a viewport at a time
  // and stitch, exactly as for a tall diff.
  it('is offered for a spreadsheet comparison', () => {
    const store = useDiffStore()
    store.left = grid('a.xlsx')
    store.right = grid('b.xlsx')
    expect(store.isSpreadsheet).toBe(true)
    expect(store.canExportImage).toBe(true)
  })

  it('is still offered for a text comparison', () => {
    const store = useDiffStore()
    store.left = FILE('a.txt')
    store.right = FILE('b.txt')
    expect(store.isSpreadsheet).toBe(false)
    expect(store.canExportImage).toBe(true)
  })

  it('scrolls and stitches the grid the way it does a tall diff', async () => {
    const store = useDiffStore()
    store.left = grid('a.xlsx')
    store.right = grid('b.xlsx')

    const grids = document.createElement('div')
    grids.getBoundingClientRect = () => ({ top: 140, height: 600 })
    sizeOf(grids, { scrollHeight: 1800, clientHeight: 600, scrollWidth: 900, clientWidth: 900 })
    const column = document.createElement('div')
    column.className = 'content'
    column.getBoundingClientRect = () => ({ left: 260, top: 88, width: 900, height: 700 })
    column.append(grids)
    document.body.append(column)
    window.requestAnimationFrame = (cb) => setTimeout(cb, 0)
    setDiffScroller(elementScroller(() => grids))

    const tops = []
    window.api.appendDiffImageSlice = async (rect) => {
      tops.push(rect.y)
      return { ok: true }
    }
    window.api.stitchDiffImage = async () => SHOT

    await store.exportCurrentImage()

    expect(tops).toHaveLength(3)
    expect(store.imageEntry).toMatchObject({ ...SHOT, hiddenColumns: 0 })
    column.remove()
    setDiffScroller(null)
  })

  // A grid wider than the window loses its right-hand columns to a picture that
  // only scrolls down. The dialog is told, rather than handing over a crop that
  // looks complete.
  it('reports the columns a picture cannot reach', async () => {
    const store = useDiffStore()
    store.left = grid('a.xlsx')
    store.right = grid('b.xlsx')

    const grids = document.createElement('div')
    grids.getBoundingClientRect = () => ({ top: 140, height: 600 })
    sizeOf(grids, { scrollHeight: 600, clientHeight: 600, scrollWidth: 2700, clientWidth: 900 })
    const column = document.createElement('div')
    column.className = 'content'
    column.getBoundingClientRect = () => ({ left: 260, top: 88, width: 900, height: 700 })
    column.append(grids)
    document.body.append(column)
    window.requestAnimationFrame = (cb) => setTimeout(cb, 0)
    setDiffScroller(elementScroller(() => grids))
    window.api.captureDiffImage = async () => SHOT

    await store.exportCurrentImage()

    expect(store.imageEntry?.hiddenColumns).toBe(2)
    column.remove()
    setDiffScroller(null)
  })
})

// Exporting a picture of a SAVED diff must not take the live document hostage:
// it used to replace it, mark it saved (so no discard prompt could fire), and
// leave the tab claiming to hold a comparison it no longer had.
describe('exportImage', () => {
  const seedEntry = async (store) => {
    const vault = useVaultStore()
    vault.entries = [{ id: 'e1', name: 'saved one' }]
    vault.load = async () => ({
      mode: 'files',
      left: FILE('old-left.txt'),
      right: FILE('old-right.txt')
    })
    store._shoot = async () => ({ dataUrl: 'data:image/png;base64,zzz' })
    return vault
  }

  it('leaves unsaved work on screen exactly as it was', async () => {
    const store = useDiffStore()
    await seedEntry(store)
    store.mode = 'paste'
    store.pasteLeft = 'work in progress'
    store.pasteRight = 'other side'
    store.diffSaved = false

    await store.exportImage('e1')

    expect(store.mode).toBe('paste')
    expect(store.pasteLeft).toBe('work in progress')
    expect(store.pasteRight).toBe('other side')
    expect(store.diffSaved).toBe(false)
    expect(store.imageEntry).toMatchObject({ id: 'e1', name: 'saved one' })
  })

  it('restores a loaded file comparison, not just paste text', async () => {
    const store = useDiffStore()
    await seedEntry(store)
    store.left = FILE('live-left.txt')
    store.right = FILE('live-right.txt')
    store.diffSaved = false

    await store.exportImage('e1')

    expect(store.left.name).toBe('live-left.txt')
    expect(store.right.name).toBe('live-right.txt')
    expect(store.diffSaved).toBe(false)
  })

  it('puts the live document back even when the shot fails', async () => {
    const store = useDiffStore()
    await seedEntry(store)
    store._shoot = async () => ({ error: 'capture-failed' })
    store.mode = 'paste'
    store.pasteLeft = 'work in progress'
    store.diffSaved = false

    await store.exportImage('e1')

    expect(store.pasteLeft).toBe('work in progress')
    expect(store.diffSaved).toBe(false)
    expect(store.imageEntry).toBeNull()
    expect(store.notice).toBeTruthy()
  })
})
