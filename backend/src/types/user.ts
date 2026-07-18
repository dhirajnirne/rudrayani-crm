export const CAPABILITY_FLAGS = {
  agency_admin: "is_agency_admin",
  operations_manager: "is_operations_manager",
  team_leader: "is_team_leader",
  telecaller: "is_telecaller",
  field_agent: "is_field_agent",
} as const;

// branch_manager has no legacy boolean column of its own -- it's derived
// straight from `designation` in capabilitiesOf() below, not from
// CAPABILITY_FLAGS, to avoid reintroducing boolean sprawl for a rank that
// only ever needs one source of truth.
export type Capability = keyof typeof CAPABILITY_FLAGS | "branch_manager";

export type AgentType = "telecaller" | "field_agent";

export interface UserRow {
  id: string;
  agency_id: string;
  branch_id: string | null;
  team_id: string | null;
  manager_id: string | null;
  designation: Capability;
  agent_type: AgentType | null;
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
  const fromBooleans = (Object.keys(CAPABILITY_FLAGS) as (keyof typeof CAPABILITY_FLAGS)[]).filter(
    (cap) => user[CAPABILITY_FLAGS[cap]],
  );
  return user.designation === "branch_manager" ? [...fromBooleans, "branch_manager"] : fromBooleans;
}

/**
 * Convert a designation (+ optional agent_type) to the corresponding boolean
 * flags. `agentType` only has an effect for branch_manager/team_leader ranks
 * (a branch_manager/team_leader can ALSO carry collections work); for plain
 * telecaller/field_agent designations the flag was already true from
 * `designation` alone, and agentType is expected to mirror it exactly.
 */
export function booleansForDesignation(
  designation: Capability,
  agentType: AgentType | null = null,
): {
  is_agency_admin: boolean;
  is_operations_manager: boolean;
  is_team_leader: boolean;
  is_telecaller: boolean;
  is_field_agent: boolean;
} {
  return {
    is_agency_admin: designation === "agency_admin",
    is_operations_manager: designation === "operations_manager",
    is_team_leader: designation === "team_leader",
    is_telecaller: designation === "telecaller" || agentType === "telecaller",
    is_field_agent: designation === "field_agent" || agentType === "field_agent",
  };
}

/** Shape returned to clients — never includes password_hash. */
export function publicUser(user: UserRow) {
  return {
    id: user.id,
    agency_id: user.agency_id,
    branch_id: user.branch_id,
    team_id: user.team_id,
    manager_id: user.manager_id,
    designation: user.designation,
    agent_type: user.agent_type,
    full_name: user.full_name,
    phone: user.phone,
    email: user.email,
    capabilities: capabilitiesOf(user),
  };
}
