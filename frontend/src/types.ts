export type Capability =
  | "agency_admin"
  | "operations_manager"
  | "team_leader"
  | "telecaller"
  | "field_agent";

export interface User {
  id: string;
  agency_id: string;
  branch_id: string | null;
  team_id: string | null;
  full_name: string;
  phone: string;
  email: string | null;
  capabilities: Capability[];
}

export interface Employee extends User {
  is_active: boolean;
}

export interface Branch {
  id: string;
  name: string;
  created_at: string;
}

export interface Team {
  id: string;
  name: string;
  branch_id: string;
  branch_name?: string;
  created_at: string;
}

export interface Company {
  id: string;
  name: string;
  created_at: string;
}

export const CAPABILITY_LABELS: Record<Capability, string> = {
  agency_admin: "Agency Admin",
  operations_manager: "Operations Manager",
  team_leader: "Team Leader",
  telecaller: "Telecaller",
  field_agent: "Field Agent",
};
