// Updated types to match aligned schema with quote_requests

export type JobStatus =
  | 'QUOTE_APPROVED'
  | 'RECEIVED'
  | 'AWAITING_DEPOSIT'
  | 'PARTS_ORDERED'
  | 'PARTS_ARRIVED'
  | 'IN_REPAIR'
  | 'DELAYED'
  | 'READY_TO_COLLECT'
  | 'COLLECTED'
  | 'COMPLETED'
  | 'CANCELLED'

export type JobType = 'repair' | 'sell'

export interface AdditionalIssue {
  issue: string
  description?: string
}

export interface Job {
  id: string
  job_ref: string
  
  // Customer details
  customer_name: string
  customer_phone: string
  customer_email?: string | null
  
  // Device details
  device_make: string
  device_model: string
  issue: string
  description?: string | null
  additional_issues: AdditionalIssue[]
  device_password?: string | null
  password_not_applicable?: boolean
  
  // Type & source
  type: JobType
  source?: string | null
  page?: string | null
  
  // Status & pricing
  status: JobStatus
  quoted_price?: number | null
  price_total: number
  quoted_at?: string | null
  
  // Status reasons
  delay_reason?: string | null
  delay_notes?: string | null
  cancellation_reason?: string | null
  cancellation_notes?: string | null
  customer_notes?: string | null
  
  // Parts & deposit
  requires_parts_order: boolean
  parts_required: boolean
  deposit_required: boolean
  deposit_amount?: number | null
  deposit_received: boolean
  
  // Device possession tracking
  device_in_shop: boolean
  
  // Tracking
  tracking_token: string
  
  // Onboarding
  onboarding_completed?: boolean
  customer_signature?: string | null
  terms_accepted?: boolean
  passcode_deletion_scheduled_at?: string | null
  
  // Priority & Customer Management
  collected_at?: string | null
  closed_at?: string | null
  priority_score?: number
  customer_flag?: 'sensitive' | 'awkward' | 'vip' | 'normal' | null
  customer_flag_notes?: string | null
  skip_review_request?: boolean
  repair_type?: string | null
  device_type?: string | null
  
  // Action-oriented enhancements
  status_changed_at?: string | null
  tracking_link_expires_at?: string | null
  parts_ordered_at?: string | null
  parts_expected_at?: string | null
  customer_arrived_at?: string | null
  
  // Post-collection SMS tracking
  post_collection_sms_scheduled_at?: string | null
  post_collection_sms_sent_at?: string | null
  post_collection_sms_delivery_status?: string | null
  post_collection_sms_body?: string | null
  
  // Relationships
  conversation_id?: string | null
  customer_id?: string | null
  quote_request_id?: string | null
  
  // Timestamps
  created_at: string
  updated_at: string
}

export interface JobEvent {
  id: string
  job_id: string
  type: 'STATUS_CHANGE' | 'NOTE' | 'SYSTEM'
  message: string
  created_at: string
  created_by?: string | null
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
  template_key?: string | null
  body_rendered: string
  status: 'PENDING' | 'SENT' | 'FAILED'
  sent_at?: string | null
  error_message?: string | null
  created_at: string
}

export interface EmailLog {
  id: string
  job_id: string
  template_key?: string | null
  subject: string
  body_html: string
  body_text?: string | null
  recipient_email: string
  status: 'PENDING' | 'SENT' | 'FAILED'
  sent_at?: string | null
  error_message?: string | null
  resend_id?: string | null
  created_at: string
}

export interface Notification {
  id: string
  type: string
  title: string
  body: string
  job_id?: string | null
  is_read: boolean
  created_at: string
}

export interface PushSubscription {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  created_at: string
  updated_at: string
}

export interface Database {
  public: {
    Tables: {
      jobs: {
        Row: Job
        Insert: Omit<Job, 'id' | 'job_ref' | 'tracking_token' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Job, 'id' | 'job_ref' | 'tracking_token' | 'created_at'>>
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
        Insert: Omit<SMSLog, 'id' | 'created_at'>
        Update: Partial<Omit<SMSLog, 'id' | 'created_at'>>
      }
      notifications: {
        Row: Notification
        Insert: Omit<Notification, 'id' | 'created_at'>
        Update: Partial<Omit<Notification, 'id' | 'created_at'>>
      }
      push_subscriptions: {
        Row: PushSubscription
        Insert: Omit<PushSubscription, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<PushSubscription, 'id' | 'created_at'>>
      }
    }
  }
}
