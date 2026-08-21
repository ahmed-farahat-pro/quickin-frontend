// The /ops module catalog — the list of things an operator can be granted.
//
// Split out of staff.ts so the UI can name a module without importing the staff session
// code, which talks to the database. Pure data: no imports, no side effects.
// quickin-backend holds the authoritative copy in its staff.ts, and its
// scripts/check-staff-parity.mjs fails if the two catalogs drift.

export const STAFF_MODULES = [
  { key: 'overview', label: 'Overview', description: 'Dashboard totals and revenue' },
  { key: 'users', label: 'Users', description: 'Guest and host accounts' },
  { key: 'listings', label: 'Listings', description: 'Properties, publish and delete' },
  { key: 'bookings', label: 'Bookings', description: 'Reservations and their status' },
  { key: 'applications', label: 'Host applications', description: 'Approve or reject new hosts' },
  { key: 'verifications', label: 'ID verifications', description: 'Review submitted ID documents' },
  // Separate from `verifications` so ID-number corrections can be delegated without
  // also handing over the decision that verifies an account and gates its listings.
  // Its surface lives on the /ops verifications screen, which is why that page admits
  // either module.
  { key: 'id_changes', label: 'ID change requests', description: 'Approve or reject changes to a user\'s ID number' },
  { key: 'documents', label: 'Documents', description: 'Open ID and ownership documents' },
  { key: 'payments', label: 'Payments & disputes', description: 'Instapay proofs, disputes, handle' },
  { key: 'promos', label: 'Promo codes', description: 'Discount codes and limits' },
  { key: 'reports', label: 'Reports', description: 'User-filed abuse reports' },
  { key: 'moderation', label: 'Moderation', description: 'Users caught sharing contact details, warnings and suspensions' },
  { key: 'disputes', label: 'Guest disputes', description: 'Issues guests raise about a stay — investigate and resolve' },
  { key: 'notify', label: 'Broadcasts', description: 'Send push and email to segments' },
  { key: 'analytics', label: 'Analytics', description: 'Booking, revenue and cancellation reports' },
  { key: 'resorts', label: 'Resorts', description: 'Compound catalog and pending submissions' },
  { key: 'pricing', label: 'Pricing & commission', description: 'The platform commission added to every listing price' },
  { key: 'audit', label: 'Audit log', description: 'Read the record of every staff action', superAdminOnly: true },
  { key: 'staff', label: 'Staff & permissions', description: 'Manage moderators', superAdminOnly: true },
] as const satisfies ReadonlyArray<{
  key: string
  label: string
  description: string
  superAdminOnly?: boolean
}>


export type StaffModule = (typeof STAFF_MODULES)[number]['key']
