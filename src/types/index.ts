/**
 * Hollis - Insurance Agency Management Platform
 * TypeScript types for core domain entities
 */

export interface Agency {
  id: string;
  name: string;
  slug?: string;
  email: string;
  phone?: string;
  address?: string;
  website?: string;
  logoUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Client {
  id: string;
  agencyId: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  industry?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Policy {
  id: string;
  clientId: string;
  agencyId: string;
  type: string; // e.g. "general_liability", "professional_liability", "workers_comp"
  carrier: string;
  policyNumber: string;
  effectiveDate: string;
  expirationDate: string;
  premium?: number;
  status: "active" | "expired" | "cancelled" | "pending";
  createdAt: string;
  updatedAt: string;
}

export interface Document {
  id: string;
  policyId?: string;
  clientId: string;
  agencyId: string;
  name: string;
  type: string; // e.g. "policy_doc", "coi", "application"
  url: string;
  mimeType?: string;
  size?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Renewal {
  id: string;
  policyId: string;
  clientId: string;
  agencyId: string;
  dueDate: string;
  status: "pending" | "in_progress" | "completed" | "overdue";
  notes?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface COIRequest {
  id: string;
  clientId: string;
  policyId: string;
  agencyId: string;
  requestedBy?: string;
  requestedEmail?: string;
  status: "pending" | "fulfilled" | "expired" | "cancelled";
  certificateUrl?: string;
  expiresAt?: string;
  fulfilledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  agencyId: string;
  title: string;
  description?: string;
  status: "todo" | "in_progress" | "done" | "cancelled";
  priority?: "low" | "medium" | "high";
  dueDate?: string;
  clientId?: string;
  policyId?: string;
  renewalId?: string;
  assignedTo?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}
