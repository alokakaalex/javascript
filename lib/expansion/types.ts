// Shapes passed from the server data layer to pages and components. These
// never carry secrets (password hashes, tokens).

import type { Role } from "./roles";
import type { Decision, PropertyStatus, Stage } from "./workflow";

export type UserStatus = "invited" | "active" | "disabled";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface MediaItem {
  id: string;
  kind: "image" | "video";
  mime: string;
  originalName: string;
  sizeBytes: number;
  createdAt: string;
}

export interface DecisionRecord {
  round: number;
  stage: Stage;
  decision: Decision;
  remarks: string;
  decidedBy: string;
  decidedByName: string;
  decidedAt: string;
}

/** All commercial fields. Reviewers get a copy with non-visible fields set to null. */
export interface PropertyDetails {
  title: string;
  address: string;
  mapUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  ownerName: string | null;
  areaSqft: number | null;
  rentPerMonth: number | null;
  securityDeposit: number | null;
  advanceRent: number | null;
  leaseTenureMonths: number | null;
  rentEscalationPct: number | null;
  rentFreeDays: number | null;
  handoverDate: string | null;
  lockInMonths: number | null;
  notes: string | null;
}

export interface PropertyView extends PropertyDetails {
  id: number;
  code: string;
  status: PropertyStatus;
  round: number;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  /** Empty when the viewer's role may not see media. */
  media: MediaItem[];
  mediaVisible: boolean;
  /** Decisions the viewer may see, oldest first, across all rounds. */
  decisions: DecisionRecord[];
}

export interface Notification {
  id: number;
  propertyId: number | null;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface AuditEntry {
  id: number;
  actorName: string | null;
  action: string;
  details: string | null;
  createdAt: string;
}
