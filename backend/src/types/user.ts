export const CAPABILITY_FLAGS = {
  agency_admin: "is_agency_admin",
  operations_manager: "is_operations_manager",
  team_leader: "is_team_leader",
  telecaller: "is_telecaller",
  field_agent: "is_field_agent",
} as const;

export type Capability = keyof typeof CAPABILITY_FLAGS;

export interface UserRow {
  id: string;
  agency_id: string;
  branch_id: string | null;
  team_id: string | null;
  manager_id: string | null;
  full_name: string;
  phone: string;
  email: string | null;
  password_hash: string;
  is_agency_admin: boolean;
  is_operations_manager: boolean;
  is_team_leader: boolean;
  is_telecaller: boolean;
  is_field_agent: boolean;
  active_device_id: string | null;
  is_active: boolean;
  failed_login_attempts: number;
  locked_until: Date | null;
  created_at: Date;
}

export function capabilitiesOf(user: UserRow): Capability[] {
  return (Object.keys(CAPABILITY_FLAGS) as Capability[]).filter(
    (cap) => user[CAPABILITY_FLAGS[cap]],
  );
}

/** Shape returned to clients — never includes password_hash. */
export function publicUser(user: UserRow) {
  return {
    id: user.id,
    agency_id: user.agency_id,
    branch_id: user.branch_id,
    team_id: user.team_id,
    manager_id: user.manager_id,
    full_name: user.full_name,
    phone: user.phone,
    email: user.email,
    capabilities: capabilitiesOf(user),
  };
}
