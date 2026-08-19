// Minimum passphrase length enforced when CREATING a passphrase-protected file
// (Tools encrypt, snippet export, config backup). Not enforced on the
// open/import side — there you must supply whatever the file was made with.
// The heavy scrypt cost (see src/main/kdf.js) does the real work; this just
// stops trivially short passphrases at the UI.
const MIN_PASSPHRASE = 8
export const PASSPHRASE_HINT = `Passphrase must be at least ${MIN_PASSPHRASE} characters.`

export const passphraseTooShort = (p) => (p ?? '').length < MIN_PASSPHRASE
