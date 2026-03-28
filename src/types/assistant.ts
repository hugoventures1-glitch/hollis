export type AssistantPage =
  | 'overview'
  | 'renewals'
  | 'certificates'
  | 'clients'
  | 'documents'
  | 'policies'
  | 'outbox'
  | 'other'

export interface AssistantMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  actions?: AssistantAction[]
}

export interface AssistantAction {
  label: string
  href?: string
  onClick?: string // serialised action type: 'refresh' | 'search' | 'navigate'
}

export interface AssistantContext {
  page: AssistantPage
  // Contextual data passed in from the current page — whatever is most relevant
  data?: Record<string, unknown>
}

// ── Client AI Panel — structured artifact responses ────────────────────────

export type ArtifactType = 'table' | 'card' | 'text' | 'timeline'

export interface ArtifactTimelineItem {
  id: string
  source: 'renewal' | 'doc_chase' | 'coi'
  channel: 'email' | 'sms' | 'phone_script' | 'coi'
  status: string
  timestamp: string
  subject?: string
  description: string
  link?: string
}

export interface ArtifactResponse {
  type: ArtifactType
  title?: string
  // table
  columns?: string[]
  rows?: Record<string, string>[]
  // card
  fields?: { label: string; value: string }[]
  // text
  content?: string
  // timeline
  items?: ArtifactTimelineItem[]
}

export interface ClientAskResponse {
  reply: string
  artifact: ArtifactResponse | null
}
