// Shared "country you're from" list, reused by the signup form and the account
// profile editor (and read back by the admin users table).
//
// The stored value is always a STABLE ENGLISH country name (these strings) so it
// stays consistent across locales and round-trips cleanly through the backend's
// `country` field. The UI shows these English names in both en + ar — only the
// field LABEL / placeholder are localised (see messages.ts). The market-relevant
// countries (Egypt + the Gulf + the Levant) are ordered first, then a few common
// Western markets, then a fuller alphabetical list, then "Other".

// Egypt is the natural default for this market, so it leads the list.
export const PRIORITY_COUNTRIES = [
  'Egypt',
  'Saudi Arabia',
  'United Arab Emirates',
  'Kuwait',
  'Qatar',
  'Bahrain',
  'Oman',
  'Jordan',
  'Lebanon',
  'United Kingdom',
  'United States',
  'Germany',
  'France',
  'Italy',
  'Canada',
] as const

// A broader alphabetical fill so travellers from elsewhere can still pick their
// country. Kept free of the priority entries above to avoid duplicates.
const MORE_COUNTRIES = [
  'Australia',
  'Austria',
  'Belgium',
  'Brazil',
  'China',
  'Denmark',
  'Finland',
  'Greece',
  'India',
  'Indonesia',
  'Ireland',
  'Japan',
  'Malaysia',
  'Morocco',
  'Netherlands',
  'New Zealand',
  'Nigeria',
  'Norway',
  'Pakistan',
  'Poland',
  'Portugal',
  'Russia',
  'Singapore',
  'South Africa',
  'South Korea',
  'Spain',
  'Sweden',
  'Switzerland',
  'Tunisia',
  'Turkey',
] as const

// The full ordered option list rendered in the selectors. "Other" is a stable
// catch-all kept last for anyone whose country isn't listed.
export const COUNTRIES: readonly string[] = [
  ...PRIORITY_COUNTRIES,
  ...MORE_COUNTRIES,
  'Other',
]
