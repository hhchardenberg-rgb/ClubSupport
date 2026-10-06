/**
 * Invoervelden voor verificatiecodes (tweestapsverificatie, herstelcodes) mogen NIET automatisch worden ingevuld of
 * voorgesteld door de browser, wachtwoordmanager of toetsenbord. De gebruiker typt de code zelf.
 * - autoComplete="off" + een neutrale veldnaam (geen "code"/"otp"/"token" die browsers herkennen);
 * - uitschakelen van autocorrectie/hoofdletters/spellingcontrole;
 * - data-attributen die LastPass, 1Password, Bitwarden en Dashlane negeren.
 */
export const NO_AUTOFILL = {
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "off",
  spellCheck: false,
  "data-lpignore": "true",
  "data-1p-ignore": "true",
  "data-bwignore": "true",
  "data-form-type": "other",
} as const;
