import { redirect } from 'next/navigation'
import { SHOP_INFO } from '@/lib/constants'

export default function HoursRedirect() {
  redirect(SHOP_INFO.google_maps_link)
}
