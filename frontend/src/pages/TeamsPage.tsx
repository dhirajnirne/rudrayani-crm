import { Button, Form, Input, Modal, Select, Table, Typography, message, Tag, Space, Empty } from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "../api/client";
import type { Branch, Team, Employee } from "../types";

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Team | "new" | null>(null);
  const [managingLeaders, setManagingLeaders] = useState<Team | null>(null);
  const [form] = Form.useForm<{ name: string; branch_id: string }>();
  const [leadersForm] = Form.useForm<{ leader_id: string }>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [teamsRes, branchesRes, employeesRes] = await Promise.all([
        api.get("/teams"),
        api.get("/branches"),
        api.get("/employees"),
      ]);
      setTeams(teamsRes.data.teams);
      setBranches(branchesRes.data.branches);
      setEmployees(employeesRes.data.employees);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    const values = await form.validateFields();
    try {
      if (editing === "new") {
        await api.post("/teams", values);
        message.success("Team created");
      } else if (editing) {
        await api.patch(`/teams/${editing.id}`, values);
        message.success("Team updated");
      }
      setEditing(null);
      form.resetFields();
      load();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const addLeader = async () => {
    const values = await leadersForm.validateFields();
    if (!managingLeaders) return;
    try {
      await api.post(`/teams/${managingLeaders.id}/leaders`, {
        user_id: values.leader_id,
      });
      message.success("Team leader added");
      leadersForm.resetFields();
      load();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const removeLeader = async (teamId: string, leaderId: string) => {
    try {
      await api.delete(`/teams/${teamId}/leaders/${leaderId}`);
      message.success("Team leader removed");
      load();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Teams
        </Typography.Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            form.resetFields();
            setEditing("new");
          }}
        >
          Add team
        </Button>
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={teams}
        pagination={false}
        columns={[
          { title: "Team", dataIndex: "name" },
          { title: "Branch", dataIndex: "branch_name" },
          {
            title: "Leaders",
            render: (_, record) => {
              const leaders = record.leaders ?? [];
              if (leaders.length === 0) {
                return <span style={{ color: "#999" }}>No leaders</span>;
              }
              return <Space wrap>{leaders.map((l) => <Tag key={l.id}>{l.full_name}</Tag>)}</Space>;
            },
          },
          {
            title: "",
            width: 150,
            render: (_, record) => (
              <Space>
                <Button
                  type="link"
                  size="small"
                  onClick={() => {
                    form.setFieldsValue({ name: record.name, branch_id: record.branch_id });
                    setEditing(record);
                  }}
                >
                  Edit
                </Button>
                <Button
                  type="link"
                  size="small"
                  onClick={() => {
                    setManagingLeaders(record);
                    leadersForm.resetFields();
                  }}
                >
                  Manage leaders
                </Button>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        open={editing !== null}
        title={editing === "new" ? "Add team" : "Edit team"}
        onOk={save}
        onCancel={() => setEditing(null)}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Team name" rules={[{ required: true }]}>
            <Input placeholder="e.g. Team A" />
          </Form.Item>
          <Form.Item name="branch_id" label="Branch" rules={[{ required: true }]}>
            <Select
              options={branches.map((b) => ({ value: b.id, label: b.name }))}
              placeholder="Select branch"
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={managingLeaders !== null}
        title={`Manage leaders for ${managingLeaders?.name ?? ""}`}
        onOk={addLeader}
        onCancel={() => setManagingLeaders(null)}
        destroyOnClose
      >
        <div style={{ marginBottom: 16 }}>
          <Typography.Title level={5}>Current leaders:</Typography.Title>
          {(managingLeaders?.leaders ?? []).length === 0 ? (
            <Empty description="No leaders assigned" style={{ margin: "16px 0" }} />
          ) : (
            <div style={{ marginBottom: 16 }}>
              {(managingLeaders?.leaders ?? []).map((leader) => (
                <div
                  key={leader.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px",
                    borderRadius: "4px",
                    backgroundColor: "#f5f5f5",
                    marginBottom: "8px",
                  }}
                >
                  <span>{leader.full_name}</span>
                  <Button
                    type="text"
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={() => removeLeader(managingLeaders!.id, leader.id)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <Typography.Title level={5}>Add leader:</Typography.Title>
        <Form form={leadersForm} layout="vertical">
          <Form.Item name="leader_id" label="Select team leader" rules={[{ required: true }]}>
            <Select
              title="Select a team leader" placeholder="Select a team leader"
              options={employees
                .filter((e) => e.designation === "team_leader")
                .map((e) => ({ value: e.id, label: e.full_name }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
