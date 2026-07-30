import { NextResponse } from 'next/server'
import { getStaffFromRequest, STAFF_MODULES } from '@/lib/local/staff'

// Who am I, and what may I use (A3/A4).
//   GET /api/local/staff/me → { staff: {...} | null, modules: [catalog] }
//
// Always 200 with `staff: null` when signed out, matching the guest /api/auth/me
// contract, so a client can poll it to detect an expired/revoked session without
// treating a 401 as a network error. The console uses this to notice that its
// permissions changed under it.
export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'no-store' }

export async function GET(req: Request) {
  try {
    const staff = await getStaffFromRequest(req)
    return NextResponse.json(
      {
        staff: staff
          ? {
              id: staff.staffId,
              email: staff.email,
              full_name: staff.fullName,
              role: staff.role,
              modules: staff.modules,
              legacy: Boolean(staff.legacy),
            }
          : null,
        modules: STAFF_MODULES,
      },
      { headers: NO_STORE }
    )
  } catch (err) {
    console.error('staff me:', err)
    return NextResponse.json({ staff: null, modules: STAFF_MODULES }, { headers: NO_STORE })
  }
}
