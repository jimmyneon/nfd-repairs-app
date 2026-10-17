import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/resilience'
import RepairDashboard from '@/components/RepairDashboard'

export default async function RepairPage({ params }: { params: { id: string } }) {
  const db = createServiceClient()
  const cookieStore = cookies()
  const token = cookieStore.get('repair_token')?.value

  if (!token) {
    redirect('/auth/login')
  }

  const { data: magicLink } = await db
    .from('magic_links')
    .select('repair_id,expires_at')
    .eq('token', token)
    .eq('used', true)
    .single()

  if (!magicLink || magicLink.repair_id !== params.id || (magicLink.expires_at && new Date(magicLink.expires_at).getTime() < Date.now())) {
    redirect('/auth/login')
  }

  const { data: repair, error } = await db
    .from('repairs')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !repair) {
    redirect('/auth/login')
  }

  const { data: updates } = await db
    .from('repair_updates')
    .select('*')
    .eq('repair_id', params.id)
    .eq('is_customer_visible', true)
    .order('created_at', { ascending: false })

  const { data: issues } = await db
    .from('issues')
    .select('*')
    .eq('repair_id', params.id)
    .order('created_at', { ascending: false })

  return <RepairDashboard repair={repair} updates={updates || []} issues={issues || []} />
}
