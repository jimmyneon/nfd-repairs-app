'use client'

import { ThemeProvider } from 'next-themes'
import { useEffect } from 'react'

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    console.log('🎨 Providers mounted')
    console.log('Current theme from localStorage:', localStorage.getItem('theme'))
  }, [])

  return (
    <ThemeProvider 
      attribute="class" 
      defaultTheme="light" 
      enableSystem={false}
      storageKey="theme"
    >
      {children}
    </ThemeProvider>
  )
}
