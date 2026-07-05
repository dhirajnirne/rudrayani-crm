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

export interface ImportTemplate {
  id: string;
  company_id: string;
  name: string;
  column_mapping: Record<string, string>;
  version: number;
  is_active: boolean;
  created_at: string;
}

export interface ImportRun {
  id: string;
  company_id: string;
  template_id: string | null;
  template_name: string | null;
  file_name: string | null;
  uploaded_by_name: string | null;
  inserted_rows: number;
  duplicate_rows: number;
  error_rows: number;
  created_at: string;
}

export interface DispositionCode {
  id: string;
  action_code: string;
  category: string | null;
  result_code: string | null;
  description: string;
  remark_template: string | null;
  needs_amount: boolean;
  needs_date: boolean;
  needs_time: boolean;
  needs_mode: boolean;
  needs_reason: boolean;
  needs_name_relation: boolean;
  is_active: boolean;
}

export interface Customer {
  id: string;
  loan_number: string;
  customer_name: string;
  mobile_number: string | null;
  product: string | null;
  bucket: string | null;
  due_amount: string | null;
  emi: string | null;
  custom_fields: Record<string, unknown>;
  created_at: string;
  company_name: string;
  company_id: string;
}

export const CAPABILITY_LABELS: Record<Capability, string> = {
  agency_admin: "Agency Admin",
  operations_manager: "Operations Manager",
  team_leader: "Team Leader",
  telecaller: "Telecaller",
  field_agent: "Field Agent",
};

export const SYSTEM_FIELD_LABELS: Record<string, string> = {
  loan_number: "Loan Number (required)",
  customer_name: "Customer Name (required)",
  mobile_number: "Mobile Number",
  product: "Product",
  bucket: "Bucket",
  due_amount: "Due Amount",
  emi: "EMI Amount",
};
