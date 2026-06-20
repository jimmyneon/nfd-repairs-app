/**
 * Device-specific issue presets and dynamic issue learning.
 * Issues are tailored to the device type selected in the create job form.
 * Custom issues entered under "Other" are saved to localStorage and
 * suggested as options in future sessions.
 */

export interface IssuePreset {
  label: string
  value: string
  icon?: string
}

// Common issues shared across all device types
const commonIssuesAll: string[] = [
  'Diagnostics',
  'Other',
]

// Device-specific issue lists, ordered by frequency
export const issuesByDeviceType: Record<string, string[]> = {
  phone: [
    'Screen Replacement',
    'Battery Replacement',
    'Charging Port Replacement',
    'Not Charging',
    'Water Damage',
    'No Power',
    'Black Screen',
    'Screen Repair',
    'Front Camera Fault',
    'Rear Camera Fault',
    'Speaker Fault',
    'Microphone Fault',
    'Home Button Fault',
    'Power Button Fault',
    'Volume Button Fault',
    'Face ID Fault',
    'Touch ID Fault',
    'Overheating',
    'Software Issues',
    'Data Recovery',
    'Network / Signal Fault',
    'Wi-Fi Fault',
    'Bluetooth Fault',
    ...commonIssuesAll,
  ],
  tablet: [
    'Screen Replacement',
    'Battery Replacement',
    'Charging Port Replacement',
    'Not Charging',
    'Water Damage',
    'No Power',
    'Black Screen',
    'Screen Repair',
    'Touch Screen Fault',
    'Speaker Fault',
    'Camera Fault',
    'Home Button Fault',
    'Power Button Fault',
    'Volume Button Fault',
    'Overheating',
    'Software Issues',
    'Data Recovery',
    'Wi-Fi Fault',
    ...commonIssuesAll,
  ],
  laptop: [
    'Screen Replacement',
    'Screen Repair',
    'Battery Replacement',
    'Not Charging',
    'Charging Port Replacement',
    'No Power',
    'Black Screen',
    'Keyboard Fault',
    'Trackpad Fault',
    'Hinge Repair',
    'Water Damage',
    'Overheating',
    'Fan Noise',
    'Not Loading',
    'Blue Screen of Death',
    'Software Malfunction',
    'Virus Removal',
    'Data Recovery',
    'SSD Upgrade',
    'Hard Drive Replacement',
    'RAM Upgrade',
    'Windows 10 Installation',
    'Windows 11 Installation',
    'HDMI Port Repair',
    'USB Port Repair',
    'Wi-Fi Fault',
    ...commonIssuesAll,
  ],
  desktop: [
    'No Power',
    'Not Loading',
    'Blue Screen of Death',
    'Overheating',
    'Fan Noise',
    'Software Malfunction',
    'Virus Removal',
    'Data Recovery',
    'SSD Upgrade',
    'Hard Drive Replacement',
    'RAM Upgrade',
    'GPU Replacement',
    'PSU Replacement',
    'Windows 10 Installation',
    'Windows 11 Installation',
    'HDMI Port Repair',
    'USB Port Repair',
    'Wi-Fi Fault',
    'Network / Signal Fault',
    ...commonIssuesAll,
  ],
  console: [
    'HDMI Port Repair',
    'No Power',
    'Not Reading Discs',
    'Overheating',
    'Fan Noise',
    'Blue Light of Death',
    'Red Ring of Death',
    'Controller Connectivity',
    'USB Port Repair',
    'Software Issues',
    'Disc Drive Replacement',
    'Fan Replacement',
    'Power Supply Replacement',
    'Water Damage',
    ...commonIssuesAll,
  ],
  watch: [
    'Screen Replacement',
    'Battery Replacement',
    'Water Damage',
    'No Power',
    'Screen Repair',
    'Touch Screen Fault',
    'Button Fault',
    'Software Issues',
    ...commonIssuesAll,
  ],
  other: [
    'Screen Replacement',
    'Battery Replacement',
    'Not Charging',
    'No Power',
    'Water Damage',
    'Overheating',
    'Software Issues',
    'Data Recovery',
    'Virus Removal',
    'Diagnostics',
    'Other',
  ],
}

// Fallback list when no device type is selected (all common issues)
export const defaultIssues: string[] = [
  'Screen Replacement',
  'Battery Replacement',
  'Charging Port Replacement',
  'Not Charging',
  'Water Damage',
  'No Power',
  'Black Screen',
  'Data Recovery',
  'Software Issues',
  'Overheating',
  'Not Loading',
  'Blue Screen of Death',
  'Windows 10 Installation',
  'Windows 11 Installation',
  'SSD Upgrade',
  'Hard Drive Replacement',
  'RAM Upgrade',
  'HDMI Port Repair',
  'Software Malfunction',
  'Virus Removal',
  'Diagnostics',
  'Other',
]

/**
 * Get issues for a specific device type, merged with any custom
 * issues the user has previously entered.
 */
export function getIssuesForDeviceType(deviceType: string): string[] {
  const baseIssues = issuesByDeviceType[deviceType] || defaultIssues
  const customIssues = getCustomIssues(deviceType)
  
  // Merge custom issues into the list (before "Other"), deduplicated
  const merged = [...baseIssues]
  for (const custom of customIssues) {
    if (!merged.some(issue => issue.toLowerCase() === custom.toLowerCase())) {
      // Insert before "Other"
      const otherIndex = merged.lastIndexOf('Other')
      if (otherIndex >= 0) {
        merged.splice(otherIndex, 0, custom)
      } else {
        merged.push(custom)
      }
    }
  }
  
  return merged
}

/**
 * Save a custom issue to localStorage for future suggestions.
 * Issues are stored per device type so they appear when that type is selected.
 */
export function saveCustomIssue(deviceType: string, issue: string): void {
  if (typeof window === 'undefined') return
  const trimmed = issue.trim()
  if (!trimmed || trimmed === 'Other') return
  
  const key = `custom_issues_${deviceType || 'other'}`
  const existing = getCustomIssues(deviceType)
  
  // Don't save duplicates (case-insensitive)
  if (existing.some(item => item.toLowerCase() === trimmed.toLowerCase())) return
  
  existing.push(trimmed)
  localStorage.setItem(key, JSON.stringify(existing))
}

/**
 * Get custom issues saved for a device type.
 */
export function getCustomIssues(deviceType: string): string[] {
  if (typeof window === 'undefined') return []
  const key = `custom_issues_${deviceType || 'other'}`
  try {
    const stored = localStorage.getItem(key)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

/**
 * Get all custom issues across all device types (for global suggestions).
 */
export function getAllCustomIssues(): string[] {
  if (typeof window === 'undefined') return []
  const allIssues: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith('custom_issues_')) {
      try {
        const issues = JSON.parse(localStorage.getItem(key) || '[]')
        allIssues.push(...issues)
      } catch {
        // skip invalid entries
      }
    }
  }
  return [...new Set(allIssues)]
}
