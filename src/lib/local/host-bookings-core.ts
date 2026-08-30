// The one place that decides what a host's reservation list is, given whatever
// GET /api/local/host/bookings returned.
//
// Why this exists: quickin-backend answers that route with a BARE ARRAY — the
// contract iOS (`[HostBooking].self`) and Android (`JSONArray(text)`) have always
// decoded. This app used to own a route of its own that wrapped the same rows as
// `{ bookings }`, and when the two backends were merged (a4f3020) that route was
// deleted while the client kept reading `data.bookings`. The key was then always
// undefined, so every host saw the "no requests yet" empty state no matter how
// many guests had asked to book.
//
// Both shapes are accepted rather than just the array: /ops reads the admin
// route, which really does wrap in `{ bookings }`, and a reader that handles
// either cannot break again on which side of the wire the rows come from.

/** Anything the endpoint may hand back. */
export type HostBookingsPayload = unknown

/**
 * The booking rows in `payload`, in the order the server sent them.
 *
 * Returns `[]` for a body that carries no list at all (null, an error object, a
 * string) — an empty inbox and an unreadable one look the same to the caller,
 * and the fetch layer above has already separated "the request failed" from
 * "the request succeeded" by status code.
 */
export function hostBookingsFrom<T = Record<string, unknown>>(payload: HostBookingsPayload): T[] {
  if (Array.isArray(payload)) return payload as T[]
  if (payload && typeof payload === 'object') {
    const wrapped = (payload as { bookings?: unknown }).bookings
    if (Array.isArray(wrapped)) return wrapped as T[]
  }
  return []
}
