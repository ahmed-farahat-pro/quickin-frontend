// Pay for a stay — the QR to transfer to, beside the screenshot upload.
//
// Replaces a Supabase-era page that owned this URL and was unreachable from any
// World-1 flow. Before this, the website had no way to complete a payment at all: the
// only "Pay now" button POSTed to a mock endpoint that marked the booking paid without
// taking any money, and the screenshot upload existed on mobile alone.
import type { Metadata } from 'next'
import type { Booking } from '@/lib/types'
import { viewer, backendFetch } from '@/lib/backend'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { canPay, paymentStageFor } from '@/lib/local/payment-flow-core'
import { PayClient } from './pay-client'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Pay for your stay — QuickIn',
  robots: { index: false, follow: false },
}

export default async function PayPage(ctx: { params: Promise<{ id: string }> }) {
  const me = await viewer()
  if (!me) redirect('/login?next=/reservations')

  const { id } = await ctx.params
  const booking = await backendFetch<Booking | null>(`/api/local/bookings/${id}`, { allow404: true }).catch(() => null)
  // Not theirs, or gone. Don't leak which — both send you back to your list.
  if (!booking) redirect('/reservations')

  // A payment page for a booking you can't pay is a dead end: it either isn't
  // confirmed yet, is already paid, or is sitting under review. Send them where the
  // real state is shown.
  if (!canPay(booking)) redirect('/reservations')

  return (
    <PayClient
      bookingId={id}
      title={booking.title ?? 'Your stay'}
      total={Number(booking.total_price) || 0}
      currency={booking.currency ?? 'EGP'}
      checkIn={booking.check_in ?? ''}
      checkOut={booking.check_out ?? ''}
      // A previously-rejected transfer lands here again — tell them why, so they
      // don't upload the same unreadable photo twice.
      rejectedReason={paymentStageFor(booking) === 'rejected' ? (booking.payment_reject_reason ?? null) : null}
    />
  )
}
