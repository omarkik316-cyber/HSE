export type UserRole = "safety_officer" | "consultant" | "contractor" | "manager" | "admin";
export type ObservationStatus = "open" | "in_progress" | "pending_review" | "closed";
export type ObservationPriority = "low" | "medium" | "high" | "critical";

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  company: string | null;
  phone: string | null;
  created_at: string;
  // Set to true by an admin's "reset password" action. The signed-in user
  // is forced to /change-password until they set their own new password,
  // which clears this back to false.
  force_password_change?: boolean;
}

export interface ObservationPhoto {
  id: string;
  observation_id: string;
  photo_url: string;
  photo_type: "before" | "after";
  uploaded_by: string | null;
  created_at: string;
}

export interface ObservationComment {
  id: string;
  observation_id: string;
  author_id: string;
  comment: string;
  status_change_to: ObservationStatus | null;
  created_at: string;
  profiles?: Profile;
}

export interface Observation {
  id: string;
  ticket_no: number;
  title: string;
  description: string | null;
  category: string;
  priority: ObservationPriority;
  status: ObservationStatus;
  latitude: number;
  longitude: number;
  zone_name: string | null;
  reported_by: string;
  assigned_contractor: string | null;
  due_date: string | null;
  closed_at: string | null;
  closed_by: string | null;
  // Whoever taps "Mark In Progress" claims the observation — once set,
  // nobody else can also start working it (see ObservationDetail).
  claimed_by: string | null;
  claimed_at: string | null;
  created_at: string;
  updated_at: string;
  observation_photos?: ObservationPhoto[];
  profiles?: Profile;
  claimed_by_profile?: Profile;
  closed_by_profile?: Profile;
}

export interface NotificationRecord {
  id: string;
  type: "observation_created" | "status_changed" | "admin_broadcast";
  title: string;
  message: string;
  zone_name: string | null;
  observation_id: string | null;
  created_by: string | null;
  created_at: string;
  profiles?: Profile;
  read?: boolean;
}

export interface NotificationTemplate {
  id: string;
  title: string;
  message: string;
  created_by: string | null;
  created_at: string;
}

export const CATEGORIES = [
  "PPE",
  "Fall Protection",
  "Housekeeping",
  "Electrical",
  "Scaffolding",
  "Excavation",
  "Fire Safety",
  "Lifting Operations",
  "Traffic / Vehicles",
  "Environmental",
  "Other",
] as const;

export const PRIORITY_COLORS: Record<ObservationPriority, string> = {
  low: "#65a30d",
  medium: "#d97706",
  high: "#ea580c",
  critical: "#dc2626",
};

export const STATUS_LABELS: Record<ObservationStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  pending_review: "Pending Review",
  closed: "Closed",
};

// A distinct color per zone/phase prefix (2, 3, 4, 5, 6, 7, 8...), parsed
// from the zone name (e.g. "3I", "Phase 4 Boundary", "2A-B"). Falls back to
// slate for anything that doesn't match a known phase number.
export const ZONE_PHASE_COLORS: Record<string, string> = {
  "2": "#3b82f6", // blue
  "3": "#10b981", // green
  "4": "#f59e0b", // amber
  "5": "#8b5cf6", // purple
  "6": "#ec4899", // pink
  "7": "#14b8a6", // teal
  "8": "#ef4444", // red
};
export const DEFAULT_ZONE_COLOR = "#64748b"; // slate, for unrecognized zones

export function getZoneColor(zoneName: string | null | undefined): string {
  if (!zoneName) return DEFAULT_ZONE_COLOR;
  const match = zoneName.match(/\d/);
  if (match && ZONE_PHASE_COLORS[match[0]]) return ZONE_PHASE_COLORS[match[0]];
  return DEFAULT_ZONE_COLOR;
}

// Display labels for roles — the underlying value stored in the database
// is still "contractor" (renaming the enum would require a migration),
// but everywhere in the UI it's shown as "Safety Officer / Contractor".
export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  manager: "Manager",
  consultant: "Consultant",
  safety_officer: "Safety Officer",
  contractor: "Safety Officer / Contractor",
};
