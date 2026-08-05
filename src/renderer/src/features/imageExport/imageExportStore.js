// Pictures of the app's OWN rendering — a saved diff, what is on screen now, or
// a snippet — taken by photographing the real view rather than redrawing it, so
// the theme and Monaco's highlighting come free and cannot drift.

import { defineStore } from 'pinia'
import { useDiffStore } from '../../stores/diffStore'
import { useVaultStore } from '../../stores/vaultStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { languageOf, useSnippetStore } from '../../stores/snippetStore'
import { isSecret } from '../../utils/secretSnippet'
import { getDiffScroller } from '../../utils/diffScroller'
import { playShutter } from '../../utils/shutter'
import { t } from '../../i18n'
import {
  afterFrames,
  captureRectOf,
  captureRegionOf,
  planSlices,
  untilChanged,
  untilTrue
} from '../../utils/captureTarget'

const withHiddenColumns = (res) =>
  res?.error ? res : { ...res, hiddenColumns: getDiffScroller()?.hiddenColumns?.() ?? 0 }

// The two compared sides as { name, content }, whether in files or paste mode.
const comparedSides = (s) =>
  s.mode === 'paste'
    ? [
        s.pasteLeftFile ?? { name: 'Left', content: s.pasteLeft },
        s.pasteRightFile ?? { name: 'Right', content: s.pasteRight }
      ]
    : [s.left ?? { name: 'Left', content: '' }, s.right ?? { name: 'Right', content: '' }]

// Frames to let Monaco lay out and tokenize a restored diff before the shot.
const CAPTURE_FRAMES = 4
// Frames for a scrolled viewport to render its new lines between slices.
const SCROLL_FRAMES = 3
// A streamed viewer fetches a scrolled-to window from disk, so its new rows
// arrive on an IPC round-trip rather than the next frame. Counting frames alone
// photographs empty rows; this waits for the viewer to say it filled them.
const STREAM_SETTLE_FRAMES = 90
// Mermaid renders behind a 2.8 MB import and a cold grammar retries for ~700 ms.
// Generous because it resolves the moment the stage paints — this only bounds a
// render that never arrives.
const SHOT_READY_FRAMES = 600

export const useImageExportStore = defineStore('imageExport', {
  state: () => ({
    // A finished picture while its preview is open, null when closed: { id,
    // name, subject: 'diff' | 'snippet' | 'diagram', dataUrl, width, height }.
    imageEntry: null,
    /** @type {import('../../types').SnippetShot | null} */
    snippetShot: null,
    // True between opening the saved diff and taking its picture, so the app can
    // stay out of the shot (no dialog, no toast) while the shutter is open.
    imageCapturing: false
  }),
  getters: {
    // A streamed comparison IS photographable: its viewer registers a real
    // scroller, so the export scrolls and stitches it like any other.
    canExportImage() {
      const diff = useDiffStore()
      return diff.mode !== 'paste' && !!diff.left && !!diff.right
    }
  },
  actions: {
    // Export a SAVED diff as a picture of the app's own diff view: the entry is
    // opened first, so the screenshot shows the real thing, with this theme's
    // colours and Monaco's highlighting, rather than a redrawn approximation
    // that would drift from the app.
    async exportImage(id) {
      const diff = useDiffStore()
      const vault = useVaultStore()
      const entry = vault.entries.find((e) => e.id === id)
      if (!entry) return
      const payload = await vault.load(id)
      if (!payload) {
        return diff.showNotice(t('imageExportNotices.thisSavedDiffHasExpired'))
      }
      // The saved diff is only ON SCREEN long enough to be photographed. Leaving
      // it there replaced the user's live comparison, marked it saved (so no
      // discard prompt could ever fire) and left the tab claiming a document it
      // no longer held.
      const live = diff.snapshot()
      const liveSaved = diff.diffSaved
      diff.restore(payload)
      try {
        // Restoring replaces the models, so there is never a selection to honour.
        const res = await this._shoot({ awaitRediff: true })
        if (res?.error) return diff.showNotice(t('imageExportNotices.couldNotTakeAPicture'))
        this.imageEntry = { id, name: entry.name, subject: 'diff', ...res }
      } finally {
        diff.restore(live)
        diff.diffSaved = liveSaved
      }
    },
    // A picture of the app's own rendering — a diagram for Mermaid, coloured code
    // otherwise. The stage covers the diff column for one shot, then comes down.
    async exportSnippetImage(id) {
      const diff = useDiffStore()
      const snippets = useSnippetStore()
      const entry = snippets.entries.find((e) => e.id === id)
      if (!entry) return
      // Refused before anything decrypts it: a picture of a mask is useless, and
      // a picture of the plaintext is the leak the mask exists to prevent.
      if (isSecret(entry)) {
        return diff.showNotice(t('imageExportNotices.hiddenSnippetsCanTBe'))
      }
      const code = await snippets.load(id)
      if (code == null) return diff.showNotice(t('imageExportNotices.thatSnippetCouldNotBe'))
      const lang = languageOf(entry)
      const diagram = lang === 'mermaid'
      this.snippetShot = { name: entry.name, lang, code, ready: false, failed: false }
      try {
        const shot = this.snippetShot
        await untilTrue(() => shot.ready || shot.failed, { frames: SHOT_READY_FRAMES })
        if (shot.failed) return diff.showNotice(t('imageExportNotices.thatDiagramCouldNotBe'))
        const res = await this._shoot()
        if (res?.error) return diff.showNotice(t('imageExportNotices.couldNotTakeAPicture2'))
        this.imageEntry = {
          id,
          name: entry.name,
          subject: diagram ? 'diagram' : 'snippet',
          ...res
        }
      } finally {
        this.snippetShot = null
      }
    },
    snippetShotPainted() {
      if (this.snippetShot) this.snippetShot.ready = true
    },
    snippetShotFailed() {
      if (this.snippetShot) this.snippetShot.failed = true
    },
    // Export what is on screen right now, saved or not. Lines selected in either
    // pane narrow the picture to just those; with none it covers the whole diff.
    async exportCurrentImage() {
      const diff = useDiffStore()
      if (!this.canExportImage) return diff.showNotice(t('imageExportNotices.nothingToExportYet'))
      const res = await this._shoot({ band: getDiffScroller()?.selection() ?? null })
      if (res?.error) return diff.showNotice(t('imageExportNotices.couldNotTakeAPicture'))
      const [l, r] = comparedSides(diff)
      this.imageEntry = { id: null, name: `${l.name} ↔ ${r.name}`, subject: 'diff', ...res }
    },
    // The shutter. `finally` matters: a stuck imageCapturing would leave the
    // shortcut bar hidden for the rest of the session.
    async _shoot({ band = null, awaitRediff = false } = {}) {
      const diff = useDiffStore()
      this.imageCapturing = true
      playShutter({ enabled: useSettingsStore().shutterSound })
      try {
        // Only a restore re-diffs, and that must land and paint before the shot
        // — counting frames alone photographed the previous diff, or this one
        // with no highlights. Waiting for a re-diff that isn't coming would just
        // burn the timeout, so exporting what's already on screen skips it.
        if (awaitRediff) await untilChanged(() => diff.diffRevision)
        await afterFrames(CAPTURE_FRAMES)
        return withHiddenColumns(await this._shootRegion(band))
      } catch {
        return { error: 'capture-failed' }
      } finally {
        this.imageCapturing = false
      }
    },
    // One shot when the whole diff fits its pane, scroll-and-stitch otherwise.
    // A band always takes the sliced path: the single-shot rect starts at the
    // top of the column, which is exactly what a chosen range is not.
    async _shootRegion(band) {
      const scroller = getDiffScroller()
      const region = scroller && captureRegionOf({ viewport: scroller.viewportEl?.() ?? null })
      const plan = region ? this._planShots(scroller, band) : { slices: [], truncated: false }
      if (plan.slices.length > 1 || (band && plan.slices.length)) {
        return this._shootTall(plan, region, scroller)
      }
      if (band) return { error: 'no-view' }
      // Short diff, or a viewer with no Monaco behind it (the spreadsheet grid):
      // captureRectOf already crops the empty pane away.
      const rect = captureRectOf()
      return rect ? window.api.captureDiffImage(rect) : { error: 'no-view' }
    },
    _planShots(scroller, band) {
      return planSlices({
        contentHeight: scroller.contentHeight(),
        viewportHeight: scroller.viewportHeight(),
        maxHeight: useSettingsStore().maxExportHeightPx,
        from: band?.top ?? 0,
        to: band?.bottom
      })
    },
    async _shootTall(plan, region, scroller) {
      const diff = useDiffStore()
      const was = scroller.scrollTop()
      const { x, width, y: top } = region.content
      const headerHeight = region.editorY - top
      try {
        for (const [i, s] of plan.slices.entries()) {
          scroller.scrollTo(s.scrollTop)
          if (i > 0 && diff.isStreamed) {
            await untilChanged(() => diff.diffRevision, { frames: STREAM_SETTLE_FRAMES })
          }
          await afterFrames(SCROLL_FRAMES)
          const rect =
            i === 0
              ? { x, y: top, width, height: headerHeight + s.height }
              : { x, y: region.editorY + s.offsetY, width, height: s.height }
          const added = await window.api.appendDiffImageSlice(rect, i === 0)
          if (added?.error) return added
        }
      } finally {
        scroller.scrollTo(was)
      }
      const shot = await window.api.stitchDiffImage()
      return shot?.error ? shot : { ...shot, truncated: plan.truncated }
    },
    closeImageExport() {
      this.imageEntry = null
      window.api.forgetDiffImage()
    },
    // Both act on the capture main is still holding — no image bytes are sent
    // back across the boundary to be re-decoded.
    async copyImage() {
      const res = await window.api.copyDiffImage()
      useDiffStore().showNotice(
        res?.ok
          ? t('imageExportNotices.diffImageCopiedToClipboard')
          : t('imageExportNotices.couldNotCopyTheImage')
      )
      return !!res?.ok
    },
    async saveImage() {
      const diff = useDiffStore()
      const res = await window.api.saveDiffImage(this.imageEntry?.name ?? 'diff')
      if (res?.ok) diff.showNotice(`Saved diff image to ${res.path}`)
      else if (!res?.canceled) diff.showNotice(t('imageExportNotices.couldNotSaveTheImage'))
    }
  }
})
