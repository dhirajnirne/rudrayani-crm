import {
  Button,
  Checkbox,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import { KeyOutlined, PlusOutlined } from "@ant-design/icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { CAPABILITY_LABELS, type Branch, type Employee, type Team } from "../types";

interface EmployeeFormValues {
  full_name: string;
  phone: string;
  email?: string;
  password?: string;
  branch_id?: string | null;
  team_id?: string | null;
  manager_id?: string | null;
  is_operations_manager?: boolean;
  is_team_leader?: boolean;
  is_telecaller?: boolean;
  is_field_agent?: boolean;
  is_active?: boolean;
}

export default function EmployeesPage() {
  const { hasPermission } = useAuth();
  const canEditOps = hasPermission("ops_managers.create");

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterBranch, setFilterBranch] = useState<string | undefined>();
  const [filterTeam, setFilterTeam] = useState<string | undefined>();
  const [filterCapability, setFilterCapability] = useState<string | undefined>();
  const [filterStatus, setFilterStatus] = useState<"active" | "inactive" | undefined>();
  const [editing, setEditing] = useState<Employee | "new" | null>(null);
  const [resettingFor, setResettingFor] = useState<Employee | null>(null);
  const [form] = Form.useForm<EmployeeFormValues>();
  const [resetForm] = Form.useForm<{ new_password: string }>();

  const selectedBranch = Form.useWatch("branch_id", form);
  const selectedTeam = Form.useWatch("team_id", form);
  const teamOptions = useMemo(
    () =>
      teams
        .filter((t) => !selectedBranch || t.branch_id === selectedBranch)
        .map((t) => ({ value: t.id, label: `${t.name} (${t.branch_name ?? ""})` })),
    [teams, selectedBranch],
  );

  // "Reports to" candidates: plausible managers only -- same branch or team
  // as the employee being edited, active, and never the employee themself.
  // manager_id has no permission meaning (informational only), so this is
  // just a sane default list, not a hard server-side restriction.
  const managerOptions = useMemo(() => {
    const selfId = editing && editing !== "new" ? editing.id : undefined;
    return employees
      .filter((e) => e.is_active && e.id !== selfId)
      .filter((e) => {
        if (!selectedBranch && !selectedTeam) return true;
        return (
          (!!selectedBranch && e.branch_id === selectedBranch) ||
          (!!selectedTeam && e.team_id === selectedTeam)
        );
      })
      .map((e) => ({ value: e.id, label: e.full_name }));
  }, [employees, selectedBranch, selectedTeam, editing]);

  const filteredEmployees = useMemo(() => {
    return employees.filter((e) => {
      if (filterBranch && e.branch_id !== filterBranch) return false;
      if (filterTeam && e.team_id !== filterTeam) return false;
      if (filterCapability && !e.capabilities.includes(filterCapability as never)) return false;
      if (filterStatus === "active" && !e.is_active) return false;
      if (filterStatus === "inactive" && e.is_active) return false;
      return true;
    });
  }, [employees, filterBranch, filterTeam, filterCapability, filterStatus]);

  const load = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      const [emp, br, tm] = await Promise.all([
        api.get("/employees", { params: q ? { q } : {} }),
        api.get("/branches"),
        api.get("/teams"),
      ]);
      setEmployees(emp.data.employees);
      setBranches(br.data.branches);
      setTeams(tm.data.teams);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const branchName = (id: string | null) => branches.find((b) => b.id === id)?.name ?? "—";
  const teamName = (id: string | null) => teams.find((t) => t.id === id)?.name ?? "—";

  const openCreate = () => {
    form.resetFields();
    setEditing("new");
  };

  const openEdit = (e: Employee) => {
    form.setFieldsValue({
      full_name: e.full_name,
      phone: e.phone,
      email: e.email ?? undefined,
      branch_id: e.branch_id,
      team_id: e.team_id,
      manager_id: e.manager_id,
      is_operations_manager: e.capabilities.includes("operations_manager"),
      is_team_leader: e.capabilities.includes("team_leader"),
      is_telecaller: e.capabilities.includes("telecaller"),
      is_field_agent: e.capabilities.includes("field_agent"),
      is_active: e.is_active,
    });
    setEditing(e);
  };

  const save = async () => {
    const v = await form.validateFields();
    const capabilities = {
      is_operations_manager: v.is_operations_manager ?? false,
      is_team_leader: v.is_team_leader ?? false,
      is_telecaller: v.is_telecaller ?? false,
      is_field_agent: v.is_field_agent ?? false,
    };
    try {
      if (editing === "new") {
        await api.post("/employees", {
          full_name: v.full_name,
          phone: v.phone,
          email: v.email || null,
          password: v.password,
          branch_id: v.branch_id ?? null,
          team_id: v.team_id ?? null,
          manager_id: v.manager_id ?? null,
          capabilities,
        });
        message.success("Employee created");
      } else if (editing) {
        await api.patch(`/employees/${editing.id}`, {
          full_name: v.full_name,
          email: v.email || null,
          branch_id: v.branch_id ?? null,
          team_id: v.team_id ?? null,
          manager_id: v.manager_id ?? null,
          is_active: v.is_active,
          capabilities,
        });
        message.success("Employee updated");
      }
      setEditing(null);
      form.resetFields();
      load(search);
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const resetPassword = async () => {
    const v = await resetForm.validateFields();
    try {
      await api.post(`/employees/${resettingFor!.id}/reset-password`, v);
      message.success("Password reset — their existing sessions were logged out");
      setResettingFor(null);
      resetForm.resetFields();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const isAdminRow = (e: Employee) => e.capabilities.includes("agency_admin");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Employees
        </Typography.Title>
        <Space>
          <Input.Search
            placeholder="Search name or phone"
            allowClear
            onSearch={(q) => {
              setSearch(q);
              load(q);
            }}
            style={{ width: 260 }}
          />
          {hasPermission("employees.create") && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              Add employee
            </Button>
          )}
        </Space>
      </div>
      <Space wrap style={{ marginBottom: 16 }}>
        <Select
          style={{ width: 160 }}
          placeholder="All branches"
          allowClear
          value={filterBranch}
          onChange={(v) => { setFilterBranch(v ?? undefined); setFilterTeam(undefined); }}
          options={branches.map((b) => ({ value: b.id, label: b.name }))}
        />
        <Select
          style={{ width: 160 }}
          placeholder="All teams"
          allowClear
          value={filterTeam}
          onChange={(v) => setFilterTeam(v ?? undefined)}
          options={teams
            .filter((t) => !filterBranch || t.branch_id === filterBranch)
            .map((t) => ({ value: t.id, label: t.name }))}
        />
        <Select
          style={{ width: 160 }}
          placeholder="All capabilities"
          allowClear
          value={filterCapability}
          onChange={(v) => setFilterCapability(v ?? undefined)}
          options={[
            { value: "telecaller", label: "Telecaller" },
            { value: "field_agent", label: "Field Agent" },
            { value: "team_leader", label: "Team Leader" },
            { value: "operations_manager", label: "Ops Manager" },
          ]}
        />
        <Select
          style={{ width: 140 }}
          placeholder="All statuses"
          allowClear
          value={filterStatus}
          onChange={(v) => setFilterStatus(v ?? undefined)}
          options={[
            { value: "active", label: "Active" },
            { value: "inactive", label: "Deactivated" },
          ]}
        />
      </Space>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={filteredEmployees}
        scroll={{ x: 900 }}
        columns={[
          { title: "Name", dataIndex: "full_name" },
          { title: "Phone", dataIndex: "phone" },
          { title: "Branch", dataIndex: "branch_id", render: branchName },
          { title: "Team", dataIndex: "team_id", render: teamName },
          {
            title: "Capabilities",
            dataIndex: "capabilities",
            render: (caps: Employee["capabilities"]) => (
              <>
                {caps.map((c) => (
                  <Tag color={c === "agency_admin" ? "gold" : "blue"} key={c}>
                    {CAPABILITY_LABELS[c]}
                  </Tag>
                ))}
              </>
            ),
          },
          {
            title: "Status",
            dataIndex: "is_active",
            render: (active: boolean) =>
              active ? <Tag color="green">Active</Tag> : <Tag color="red">Deactivated</Tag>,
          },
          {
            title: "",
            width: 160,
            render: (_, e) =>
              isAdminRow(e) ? (
                <Tooltip title="The Agency Admin account is managed outside this screen">
                  <Typography.Text type="secondary">—</Typography.Text>
                </Tooltip>
              ) : (
                <Space>
                  {hasPermission("employees.update") && (
                    <>
                      <Button type="link" style={{ padding: 0 }} onClick={() => openEdit(e)}>
                        Edit
                      </Button>
                      <Button
                        type="link"
                        style={{ padding: 0 }}
                        icon={<KeyOutlined />}
                        onClick={() => setResettingFor(e)}
                      >
                        Reset password
                      </Button>
                    </>
                  )}
                </Space>
              ),
          },
        ]}
      />

      <Modal
        open={editing !== null}
        title={editing === "new" ? "Add employee" : "Edit employee"}
        onOk={save}
        onCancel={() => setEditing(null)}
        destroyOnClose
        width={520}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="full_name" label="Full name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="phone"
            label="Phone (login ID)"
            rules={[{ required: true, pattern: /^\d{10}$/, message: "Exactly 10 digits" }]}
          >
            <Input disabled={editing !== "new"} addonBefore="+91" maxLength={10} />
          </Form.Item>
          <Form.Item name="email" label="Email (optional)" rules={[{ type: "email" }]}>
            <Input />
          </Form.Item>
          {editing === "new" && (
            <Form.Item
              name="password"
              label="Initial password"
              rules={[{ required: true, min: 8, message: "At least 8 characters" }]}
            >
              <Input.Password />
            </Form.Item>
          )}
          <Form.Item name="branch_id" label="Branch">
            <Select
              allowClear
              options={branches.map((b) => ({ value: b.id, label: b.name }))}
              onChange={() => form.setFieldValue("team_id", undefined)}
            />
          </Form.Item>
          <Form.Item name="team_id" label="Team">
            <Select allowClear options={teamOptions} />
          </Form.Item>
          <Form.Item name="manager_id" label="Reports to">
            <Select
              allowClear
              showSearch
              placeholder="No manager"
              optionFilterProp="label"
              options={managerOptions}
            />
          </Form.Item>
          <Typography.Text strong>Capabilities</Typography.Text>
          <div style={{ display: "grid", gap: 4, margin: "8px 0 16px" }}>
            <Tooltip
              title={
                canEditOps ? "" : "Only the Agency Admin can add or remove an Operations Manager"
              }
            >
              <Form.Item name="is_operations_manager" valuePropName="checked" noStyle>
                <Checkbox disabled={!canEditOps}>Operations Manager</Checkbox>
              </Form.Item>
            </Tooltip>
            <Form.Item name="is_team_leader" valuePropName="checked" noStyle>
              <Checkbox>Team Leader (designation)</Checkbox>
            </Form.Item>
            <Form.Item name="is_telecaller" valuePropName="checked" noStyle>
              <Checkbox>Telecaller</Checkbox>
            </Form.Item>
            <Form.Item name="is_field_agent" valuePropName="checked" noStyle>
              <Checkbox>Field Agent</Checkbox>
            </Form.Item>
          </div>
          {editing !== "new" && hasPermission("employees.deactivate") && (
            <Form.Item name="is_active" label="Active" valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
        </Form>
      </Modal>

      <Modal
        open={resettingFor !== null}
        title={`Reset password — ${resettingFor?.full_name ?? ""}`}
        onOk={resetPassword}
        onCancel={() => setResettingFor(null)}
        destroyOnClose
      >
        <Form form={resetForm} layout="vertical">
          <Form.Item
            name="new_password"
            label="New password"
            rules={[{ required: true, min: 8, message: "At least 8 characters" }]}
          >
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
