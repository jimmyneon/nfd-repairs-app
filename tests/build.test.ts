import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('next.config.js security headers', () => {
  it('should have security headers configured', () => {
    const config = fs.readFileSync(
      path.join(process.cwd(), 'next.config.js'),
      'utf-8'
    )
    expect(config).toContain('X-Frame-Options')
    expect(config).toContain('X-Content-Type-Options')
    expect(config).toContain('Referrer-Policy')
    expect(config).toContain('Strict-Transport-Security')
    expect(config).toContain('Permissions-Policy')
  })

  it('should not ignore TypeScript build errors', () => {
    const config = fs.readFileSync(
      path.join(process.cwd(), 'next.config.js'),
      'utf-8'
    )
    expect(config).not.toContain('ignoreBuildErrors: true')
  })

  it('should not ignore ESLint during builds', () => {
    const config = fs.readFileSync(
      path.join(process.cwd(), 'next.config.js'),
      'utf-8'
    )
    expect(config).not.toContain('ignoreDuringBuilds: true')
  })
})

describe('Error boundaries', () => {
  it('should have app-level error boundary', () => {
    expect(fs.existsSync(path.join(process.cwd(), 'app/error.tsx'))).toBe(true)
  })

  it('should have global error boundary', () => {
    expect(fs.existsSync(path.join(process.cwd(), 'app/global-error.tsx'))).toBe(true)
  })
})

describe('Signup disabled', () => {
  it('should not call supabase.auth.signUp in signup page', () => {
    const signupContent = fs.readFileSync(
      path.join(process.cwd(), 'app/signup/page.tsx'),
      'utf-8'
    )
    expect(signupContent).not.toContain('signUp')
    expect(signupContent).not.toContain('sign_up')
  })
})
