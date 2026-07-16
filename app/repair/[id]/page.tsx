import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import RepairDashboard from '@/components/RepairDashboard'

export default async function RepairPage({ params }: { params: { id: string } }) {
  const cookieStore = cookies()
  const token = cookieStore.get('repair_token')?.value

  if (!token) {
    redirect('/auth/login')
  }

  const { data: magicLink } = await supabase
    .from('magic_links')
    .select('repair_id')
    .eq('token', token)
    .eq('used', true)
    .single()

  if (!magicLink || magicLink.repair_id !== params.id) {
    redirect('/auth/login')
  }

  const { data: repair, error } = await supabase
    .from('repairs')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !repair) {
    redirect('/auth/login')
  }

  const { data: updates } = await supabase
    .from('repair_updates')
    .select('*')
    .eq('repair_id', params.id)
    .eq('is_customer_visible', true)
    .order('created_at', { ascending: false })

  const { data: issues } = await supabase
    .from('issues')
    .select('*')
    .eq('repair_id', params.id)
    .order('created_at', { ascending: false })

  return <RepairDashboard repair={repair} updates={updates || []} issues={issues || []} />
}
