import { Button, Form, Input, Modal, Table, Typography, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "../api/client";
import BranchDetailDrawer from "../components/BranchDetailDrawer";
import type { Branch } from "../types";

export default function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Branch | "new" | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [form] = Form.useForm<{ name: string }>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setBranches((await api.get("/branches")).data.branches);
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
        await api.post("/branches", values);
        message.success("Branch created");
      } else if (editing) {
        await api.patch(`/branches/${editing.id}`, values);
        message.success("Branch renamed");
      }
      setEditing(null);
      form.resetFields();
      load();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Branches
        </Typography.Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            form.resetFields();
            setEditing("new");
          }}
        >
          Add branch
        </Button>
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={branches}
        pagination={false}
        onRow={(record) => ({
          onClick: () => setDetailId(record.id),
          style: { cursor: "pointer" },
        })}
        columns={[
          { title: "Name", dataIndex: "name" },
          {
            title: "",
            width: 100,
            render: (_, record) => (
              <Button
                type="link"
                onClick={(e) => {
                  e.stopPropagation();
                  form.setFieldsValue({ name: record.name });
                  setEditing(record);
                }}
              >
                Rename
              </Button>
            ),
          },
        ]}
      />
      <BranchDetailDrawer
        branchId={detailId}
        open={detailId !== null}
        onClose={() => setDetailId(null)}
      />
      <Modal
        open={editing !== null}
        title={editing === "new" ? "Add branch" : "Rename branch"}
        onOk={save}
        onCancel={() => setEditing(null)}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Branch name" rules={[{ required: true }]}>
            <Input placeholder="e.g. Sangli" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
