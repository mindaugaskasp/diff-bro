// Building the mailto: URL. Pure, so the encoding is unit-tested without a
// window — links.js/mail.js are the glue that hands the result to the OS.
//
// Everything variable goes through URLSearchParams, so a note containing "&" or
// "?" becomes text in the body rather than a new parameter. There is no code
// path that can add `attach` (see linkPolicy.isSafeMailtoUrl, which refuses one
// on the way out too): the parameter is not standardised, is not honoured, and
// was historically a local-file exfiltration vector.
import { bodyText, headerText, isValidEmail } from './mailAddress'

export const MAX_MAILTO_LENGTH = 4000

/**
 * `allowEmptyTo` is the key hand-off's explicit opt-in: that draft goes to
 * someone not yet in the trust store, so the user addresses it themselves.
 * @param {{ to: string[], subject?: string, body?: string, allowEmptyTo?: boolean }} message
 * @returns {{ ok: true, url: string } | { error: string }}
 */
const cleanRecipients = (to, allowEmptyTo) =>
  (Array.isArray(to) ? to : [to])
    .map((a) => String(a ?? '').trim())
    .filter((a) => a || !allowEmptyTo)

export function buildMailto({ to, subject, body, allowEmptyTo = false } = {}) {
  const recipients = cleanRecipients(to, allowEmptyTo)
  if ((!recipients.length && !allowEmptyTo) || !recipients.every(isValidEmail)) {
    return { error: 'bad-address' }
  }

  // The recipient list is path, not query: encodeURIComponent each address so a
  // comma can only ever be our separator. `@` is put back — RFC 6068 allows it
  // unencoded in the addr-spec, it is what every client expects to see, and
  // leaving it as %40 makes the URL unrecognisable to isSafeMailtoUrl.
  const path = recipients.map((a) => encodeURIComponent(a).replaceAll('%40', '@')).join(',')
  const params = new URLSearchParams()
  const cleanSubject = headerText(subject)
  const cleanBody = bodyText(body)
  if (cleanSubject) params.set('subject', cleanSubject)
  if (cleanBody) params.set('body', cleanBody)

  // URLSearchParams encodes a space as `+`, which RFC 6068 reads as a LITERAL
  // plus — strict clients render "Sealed+diff". %20 is unambiguous in both.
  const query = params.toString().replaceAll('+', '%20')
  const url = `mailto:${path}${query ? `?${query}` : ''}`
  if (url.length > MAX_MAILTO_LENGTH) return { error: 'too-long' }
  return { ok: true, url }
}

/**
 * The message wrapped around an emailed public key. The fingerprint in the
 * body IS the point: it gives the recipient the out-of-band check before they
 * trust anything. Built here so the label passes headerText like any subject.
 * @param {{ label?: string, fingerprint?: string }} parts
 * @returns {{ subject: string, body: string }}
 */
export function keyMessage({ label, fingerprint } = {}) {
  const clean = headerText(label)
  return {
    subject: clean ? `My Diff Bro key — ${clean}` : 'My Diff Bro key',
    body: bodyText(
      `My Diff Bro public key is attached — paste it from the clipboard if it is not.\n\n` +
        `Import it in Diff Bro via Security → Add Trusted Key.\n\n` +
        `Verify the fingerprint with me before trusting it: ${String(fingerprint ?? '')}`
    )
  }
}

/**
 * The default message for a sealed diff. Placeholders resolve here rather than
 * in the renderer so the same text is produced whoever asks.
 * @param {{ template?: string, name?: string, expires?: string }} parts
 * @returns {string}
 */
export function fillTemplate({ template, name, expires } = {}) {
  return headerText(
    String(template ?? '')
      .replaceAll('{name}', String(name ?? ''))
      .replaceAll('{expires}', String(expires ?? ''))
  )
}
