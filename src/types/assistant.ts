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
