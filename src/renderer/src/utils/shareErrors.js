// What each sealed-share failure means to a person. Kept out of the store so the
// wording is reviewable on its own and the slice stays inside its size cap —
// these are copy, not logic.
export const SHARE_ERRORS = {
  'not-a-share-file': 'That file is not a Diff Bro shared diff.',
  'not-for-you':
    'This shared diff is sealed for a different machine — it can only be opened by its addressed recipient.',
  tampered: 'Rejected: the file was modified in transit (or is corrupted) — decryption failed.',
  'unknown-signer':
    'Sealed correctly, but signed by an unknown sender — add their public key first (File → Add Trusted Key).',
  'bad-signature': 'Signature check failed — the file was modified or corrupted.',
  'bad-trusted-key':
    'The stored public key for this sender is unreadable — remove it and add their key file again.',
  expired: 'This shared diff has already expired.',
  'invalid-ttl': 'Rejected: shared diffs cannot live longer than a week.',
  'unknown-recipient': 'Recipient not found among trusted keys.',
  renamed:
    'This shared diff was renamed — its integrity is tied to its original hashed filename, so it was refused. Ask the sender to re-send it unchanged.',
  'identity-unavailable':
    'Your identity key couldn’t be unlocked (the OS keychain may be locked). Nothing was changed — unlock it and try again.',
  'vault-key-unavailable':
    'The saved-diff key couldn’t be unlocked (the OS keychain may be locked). Your saved diffs and snippets are intact — unlock it and try again.'
}
