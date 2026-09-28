import { notFound, redirect } from 'next/navigation'

const VALID_TOKEN = /^[a-zA-Z0-9-]{10,64}$/

export default function FastDropoffShortLink({ params }: { params: { token: string } }) {
  if (!VALID_TOKEN.test(params.token)) notFound()

  redirect(`/walk-in/complete/${encodeURIComponent(params.token)}?mode=agreement`)
}
