// Which privacy notice this build shows.
//
// Sent with every registration, so the account records what was agreed to and
// not merely when. The API keeps the same value in Services/PrivacyNotice.cs and
// refuses a registration carrying any other, which is what stops a tab left open
// across a wording change from recording agreement to a notice nobody read.
// src/__tests__/privacyVersion.test.ts fails the build if the two drift apart.
export const PRIVACY_VERSION = '2026-10-16'

// The address on the notice. A role address rather than a personal one, so it
// can be redirected without reissuing the notice.
export const PRIVACY_CONTACT = 'privacy@nogoibay.org'

export const CONTROLLER = 'Atai Nogoibaev'
