export type JobStatus = 
  | 'RECEIVED'
  | 'AWAITING_DEPOSIT'
  | 'PARTS_ORDERED'
  | 'READY_TO_BOOK_IN'
  | 'IN_REPAIR'
  | 'READY_TO_COLLECT'
  | 'COMPLETED'
  | 'CANCELLED'

export type EventType = 'STATUS_CHANGE' | 'NOTE' | 'SYSTEM'

export type NotificationType = 'NEW_JOB' | 'STATUS_UPDATE' | 'ACTION_REQUIRED'

export type SMSStatus = 'PENDING' | 'SENT' | 'FAILED'

export interface Job {
  id: string
  job_ref: string
  status: JobStatus
  device_summary: string
  repair_summary: string
  price_total: number
  parts_required: boolean
  deposit_required: boolean
  deposit_amount: number | null
  deposit_received: boolean
  customer_name: string
  customer_phone: string
  tracking_token: string
  created_at: string
  updated_at: string
}

export interface JobEvent {
  id: string
  job_id: string
  type: EventType
  message: string
  created_at: string
  created_by: string | null
}

export interface SMSTemplate {
  id: string
  key: string
  body: string
  is_active: boolean
  updated_at: string
}

export interface SMSLog {
  id: string
  job_id: string
  template_key: string | null
  body_rendered: string
  status: SMSStatus
  created_at: string
  sent_at: string | null
  error_message: string | null
}

export interface Notification {
  id: string
  type: NotificationType
  title: string
  body: string
  job_id: string | null
  is_read: boolean
  created_at: string
}

export interface Database {
  public: {
    Tables: {
      jobs: {
        Row: Job
        Insert: Omit<Job, 'id' | 'created_at' | 'updated_at' | 'job_ref' | 'tracking_token'>
        Update: Partial<Omit<Job, 'id' | 'created_at' | 'job_ref' | 'tracking_token'>>
      }
      job_events: {
        Row: JobEvent
        Insert: Omit<JobEvent, 'id' | 'created_at'>
        Update: Partial<Omit<JobEvent, 'id' | 'created_at'>>
      }
      sms_templates: {
        Row: SMSTemplate
        Insert: Omit<SMSTemplate, 'id' | 'updated_at'>
        Update: Partial<Omit<SMSTemplate, 'id'>>
      }
      sms_logs: {
        Row: SMSLog
        Insert: Omit<SMSLog, 'id' | 'created_at' | 'sent_at'>
        Update: Partial<Omit<SMSLog, 'id' | 'created_at'>>
      }
      notifications: {
        Row: Notification
        Insert: Omit<Notification, 'id' | 'created_at'>
        Update: Partial<Omit<Notification, 'id' | 'created_at'>>
      }
    }
  }
}
