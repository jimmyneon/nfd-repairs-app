'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { Menu, Home, Plus, QrCode, Smartphone, Archive, Shield, Bell, Settings, Mail, Package, Clock, Wrench, ChevronDown, X } from 'lucide-react'

interface NavLink {
  href: string
  label: string
  icon: typeof Home
  badge?: number
  primary?: boolean
}

interface NavDropdownProps {
  unreadCount?: number
  warrantyCount?: number
  sendInCount?: number
  enquiryCount?: number
}

export default function NavDropdown({ unreadCount = 0, warrantyCount = 0, sendInCount = 0, enquiryCount = 0 }: NavDropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const mainLinks: NavLink[] = [
    { href: '/app/jobs', label: 'Repair Jobs', icon: Home, primary: true },
    { href: '/app/jobs/create', label: 'New Job', icon: Plus, primary: true },
  ]

  const secondaryLinks: NavLink[] = [
    { href: '/app/send-in-requests', label: 'Send-In Requests', icon: Package, badge: sendInCount },
    { href: '/app/enquiries', label: 'Enquiries', icon: Mail, badge: enquiryCount },
    { href: '/app/warranty', label: 'Warranty', icon: Shield, badge: warrantyCount },
    { href: '/app/notifications', label: 'Notifications', icon: Bell, badge: unreadCount },
    { href: '/app/history', label: 'Job History', icon: Clock },
    { href: '/app/email-templates', label: 'Email Templates', icon: Mail },
    { href: '/app/qr-display', label: 'Walk-In QR', icon: Smartphone },
    { href: '/app/settings', label: 'Settings', icon: Settings },
  ]

  return (
    <div ref={ref} className="relative">
      {/* Primary actions always visible */}
      <div className="flex items-center gap-2">
        <Link href="/app/jobs/create" className="w-14 h-14 flex items-center justify-center rounded-xl bg-primary text-white hover:bg-primary-dark transition-colors active:scale-90" title="Create New Job">
          <Plus className="h-6 w-6" />
        </Link>
        <Link href="/app/qr-display" className="w-14 h-14 flex items-center justify-center rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-colors active:scale-90" title="Walk-In QR Code">
          <Smartphone className="h-6 w-6" />
        </Link>

        {/* Dropdown trigger */}
        <button
          onClick={() => setOpen(!open)}
          className="w-14 h-14 flex items-center justify-center rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors active:scale-90"
          title="More"
          aria-label="More menu"
          aria-expanded={open}
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-16 w-72 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden z-50">
          {/* Quick links grid */}
          <div className="p-3">
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide px-2 pb-2">Navigate</p>
            <div className="grid grid-cols-2 gap-2">
              {secondaryLinks.map((link) => {
                const Icon = link.icon
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="flex flex-col items-center justify-center gap-1 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors relative"
                  >
                    <Icon className="h-5 w-5 text-gray-600 dark:text-gray-300" />
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300 text-center leading-tight">{link.label}</span>
                    {link.badge !== undefined && link.badge > 0 && (
                      <span className="absolute top-1 right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-bold">
                        {link.badge}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
