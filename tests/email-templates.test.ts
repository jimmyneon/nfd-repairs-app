import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('email_templates schema consistency', () => {
  it('notification-config-schema.sql should use status_key not key', () => {
    const content = fs.readFileSync(
      path.join(process.cwd(), 'supabase/notification-config-schema.sql'),
      'utf-8'
    )
    expect(content).toContain('status_key')
    // Should not have the old "key VARCHAR" column definition (not status_key)
    expect(content).not.toMatch(/^\s+key\s+VARCHAR.*UNIQUE/m)
  })

  it('initialize-notification-system.sql should use status_key', () => {
    const content = fs.readFileSync(
      path.join(process.cwd(), 'supabase/initialize-notification-system.sql'),
      'utf-8'
    )
    expect(content).toContain('status_key')
  })
})

describe('Type safety', () => {
  it('Job type should have diagnostic fields', () => {
    const content = fs.readFileSync(
      path.join(process.cwd(), 'lib/types-v3.ts'),
      'utf-8'
    )
    expect(content).toContain('repair_agreed_at')
    expect(content).toContain('diagnosis_notes')
    expect(content).toContain('diagnosis_sent_at')
    expect(content).toContain('repair_declined_at')
  })

  it('JobStatus should include DROPPED_OFF and QUOTE_REQUESTED', () => {
    const content = fs.readFileSync(
      path.join(process.cwd(), 'lib/types-v3.ts'),
      'utf-8'
    )
    expect(content).toContain('DROPPED_OFF')
    expect(content).toContain('QUOTE_REQUESTED')
  })
})

describe('Supabase client safety', () => {
  it('supabase-browser.ts should handle missing env vars at build time', () => {
    const content = fs.readFileSync(
      path.join(process.cwd(), 'lib/supabase-browser.ts'),
      'utf-8'
    )
    // Should check for url and key existence before creating client
    expect(content).toMatch(/if\s*\(!url\s*\|\|\s*!key\)/)
  })

  it('supabase.ts should handle missing env vars at build time', () => {
    const content = fs.readFileSync(
      path.join(process.cwd(), 'lib/supabase.ts'),
      'utf-8'
    )
    // Should check for url and key existence
    expect(content).toMatch(/if\s*\(!url\s*\|\|\s*!key\)/)
  })
})
