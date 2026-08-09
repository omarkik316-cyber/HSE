export type UserRole = "safety_officer" | "consultant" | "contractor" | "admin";
export type ObservationStatus = "open" | "in_progress" | "closed";
export type ObservationPriority = "low" | "medium" | "high" | "critical";

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  company: string | null;
  phone: string | null;
  created_at: string;
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
  created_at: string;
  updated_at: string;
  observation_photos?: ObservationPhoto[];
  profiles?: Profile;
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
  closed: "Closed",
};

// Display labels for roles — the underlying value stored in the database
// is still "contractor" (renaming the enum would require a migration),
// but everywhere in the UI it's shown as "Safety Officer / Contractor".
export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  consultant: "Consultant",
  safety_officer: "Safety Officer",
  contractor: "Safety Officer / Contractor",
};
