import {
  Alert,
  Button,
  Col,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Timeline,
  Typography,
  message,
} from "antd";
import { HistoryOutlined, UserSwitchOutlined } from "@ant-design/icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "../api/client";
import type { AllocationLog, Company, Customer, Employee } from "../types";

interface Product {
  id: string;
  raw_label: string;
  canonical_label: string;
}

const fmtAmount = (v: string | null) =>
  v == null ? "—" : Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 });

/** Shared column set for both queues. */
const baseColumns = [
  {
    title: "Loan No",
    dataIndex: "loan_number",
    width: 130,
    render: (v: string) => <Typography.Text code>{v}</Typography.Text>,
  },
  { title: "Customer", dataIndex: "customer_name", ellipsis: true },
  { title: "Company", dataIndex: "company_name", width: 150, ellipsis: true },
  {
    title: "Product",
    dataIndex: "product",
    width: 120,
    render: (v: string | null) => (v ? <Tag>{v}</Tag> : "—"),
  },
  {
    title: "Bucket",
    dataIndex: "bucket",
    width: 80,
    render: (v: string | null) => (v ? <Tag color="orange">{v}</Tag> : "—"),
  },
  {
    title: "Due Amount",
    dataIndex: "due_amount",
    width: 130,
    align: "right" as const,
    render: (v: string | null) => <span className="money">{fmtAmount(v)}</span>,
  },
];

/** Agents a TL can allocate to: active users who work customers. */
function useAssignableAgents() {
  const [agents, setAgents] = useState<Employee[]>([]);
  useEffect(() => {
    api.get("/employees").then((res) => {
      setAgents(
        (res.data.employees as Employee[]).filter(
          (e) =>
            e.is_active &&
            e.capabilities.some((c) =>
              ["telecaller", "field_agent", "team_leader"].includes(c),
            ),
        ),
      );
    });
  }, []);
  return agents;
}

function useCompanyFilters() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [buckets, setBuckets] = useState<string[]>([]);
  const [product, setProduct] = useState<string | null>(null);
  const [bucket, setBucket] = useState<string | null>(null);

  useEffect(() => {
    api.get("/companies").then((res) => setCompanies(res.data.companies));
  }, []);

  useEffect(() => {
    if (!companyId) {
      setProducts([]);
      setBuckets([]);
      setProduct(null);
      setBucket(null);
      return;
    }
    Promise.all([
      api.get("/products", { params: { company_id: companyId } }),
      api.get("/buckets", { params: { company_id: companyId } }),
    ]).then(([pRes, bRes]) => {
      setProducts(pRes.data.products);
      setBuckets(bRes.data.buckets);
    });
  }, [companyId]);

  return { companies, companyId, setCompanyId, products, buckets, product, setProduct, bucket, setBucket };
}

function FilterRow(props: ReturnType<typeof useCompanyFilters>) {
  return (
    <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
      <Col xs={24} sm={10}>
        <Select
          style={{ width: "100%" }}
          placeholder="All companies"
          allowClear
          value={props.companyId}
          onChange={(v) => {
            props.setCompanyId(v ?? null);
            props.setProduct(null);
            props.setBucket(null);
          }}
          options={props.companies.map((c) => ({ value: c.id, label: c.name }))}
        />
      </Col>
      <Col xs={12} sm={7}>
        <Select
          style={{ width: "100%" }}
          placeholder="All products"
          allowClear
          value={props.product}
          onChange={(v) => props.setProduct(v ?? null)}
          disabled={!props.companyId}
          options={props.products.map((p) => ({
            value: p.raw_label,
            label: p.canonical_label || p.raw_label,
          }))}
        />
      </Col>
      <Col xs={12} sm={7}>
        <Select
          style={{ width: "100%" }}
          placeholder="All buckets"
          allowClear
          value={props.bucket}
          onChange={(v) => props.setBucket(v ?? null)}
          disabled={!props.companyId}
          options={props.buckets.map((b) => ({ value: b, label: b }))}
        />
      </Col>
    </Row>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Unallocated queue: filter → multi-select → assign
// ──────────────────────────────────────────────────────────────────────────────

function UnallocatedQueue() {
  const filters = useCompanyFilters();
  const agents = useAssignableAgents();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);

  const load = useCallback(
    async (pg = 1) => {
      setLoading(true);
      try {
        const params: Record<string, string | number> = { page: pg, limit: 50 };
        if (filters.companyId) params.company_id = filters.companyId;
        if (filters.product) params.product = filters.product;
        if (filters.bucket) params.bucket = filters.bucket;
        const res = await api.get("/allocations/unallocated", { params });
        setCustomers(res.data.customers);
        setTotal(res.data.total);
        setPage(pg);
        setSelected([]);
      } finally {
        setLoading(false);
      }
    },
    [filters.companyId, filters.product, filters.bucket],
  );

  useEffect(() => {
    load(1);
  }, [load]);

  const assign = async () => {
    if (!agentId) return message.error("Pick an agent first");
    setAssigning(true);
    try {
      const res = await api.post("/allocations/assign", {
        customer_ids: selected,
        agent_id: agentId,
      });
      message.success(`${res.data.assigned} customer(s) assigned to ${res.data.agent_name}`);
      load(page);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div>
      <FilterRow {...filters} />

      {selected.length > 0 && (
        <Alert
          type="info"
          style={{ marginBottom: 12 }}
          message={
            <Space wrap>
              <span>
                <b>{selected.length}</b> customer(s) selected — assign to:
              </span>
              <Select
                style={{ width: 240 }}
                placeholder="Choose agent"
                showSearch
                optionFilterProp="label"
                value={agentId}
                onChange={setAgentId}
                options={agents.map((a) => ({ value: a.id, label: a.full_name }))}
              />
              <Button
                type="primary"
                icon={<UserSwitchOutlined />}
                loading={assigning}
                onClick={assign}
              >
                Assign
              </Button>
            </Space>
          }
        />
      )}

      <Table
        rowKey="id"
        loading={loading}
        dataSource={customers}
        rowSelection={{
          selectedRowKeys: selected,
          onChange: (keys) => setSelected(keys as string[]),
        }}
        pagination={{
          current: page,
          pageSize: 50,
          total,
          showSizeChanger: false,
          showTotal: (t) => `${t.toLocaleString()} unallocated`,
          onChange: (pg) => load(pg),
        }}
        scroll={{ x: 800 }}
        columns={baseColumns}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Allocated list: see who has what, reallocate with reason, view history
// ──────────────────────────────────────────────────────────────────────────────

function AllocatedList() {
  const filters = useCompanyFilters();
  const agents = useAssignableAgents();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  // Reallocate modal state
  const [reallocOpen, setReallocOpen] = useState(false);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  // History modal state
  const [historyFor, setHistoryFor] = useState<Customer | null>(null);
  const [history, setHistory] = useState<AllocationLog[]>([]);

  const load = useCallback(
    async (pg = 1) => {
      setLoading(true);
      try {
        const params: Record<string, string | number> = {
          page: pg,
          limit: 50,
          assigned: "true",
          status: "active",
        };
        if (filters.companyId) params.company_id = filters.companyId;
        if (filters.product) params.product = filters.product;
        if (filters.bucket) params.bucket = filters.bucket;
        const res = await api.get("/customers", { params });
        setCustomers(res.data.customers);
        setTotal(res.data.total);
        setPage(pg);
        setSelected([]);
      } finally {
        setLoading(false);
      }
    },
    [filters.companyId, filters.product, filters.bucket],
  );

  useEffect(() => {
    load(1);
  }, [load]);

  const reallocate = async () => {
    if (!agentId) return message.error("Pick the new agent");
    if (!reason.trim()) return message.error("Reallocation needs a reason");
    setSaving(true);
    try {
      const res = await api.post("/allocations/assign", {
        customer_ids: selected,
        agent_id: agentId,
        reason: reason.trim(),
      });
      message.success(`${res.data.assigned} customer(s) moved to ${res.data.agent_name}`);
      setReallocOpen(false);
      setReason("");
      setAgentId(null);
      load(page);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const openHistory = async (customer: Customer) => {
    setHistoryFor(customer);
    const res = await api.get("/allocations/logs", { params: { customer_id: customer.id } });
    setHistory(res.data.logs);
  };

  const columns = useMemo(
    () => [
      ...baseColumns,
      {
        title: "Assigned To",
        dataIndex: "assigned_agent_name",
        width: 160,
        render: (v: string | null) => (v ? <Tag color="blue">{v}</Tag> : "—"),
      },
      {
        title: "",
        key: "actions",
        width: 90,
        render: (_: unknown, record: Customer) => (
          <Button
            type="link"
            size="small"
            icon={<HistoryOutlined />}
            onClick={() => openHistory(record)}
          >
            History
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <div>
      <FilterRow {...filters} />

      {selected.length > 0 && (
        <Alert
          type="warning"
          style={{ marginBottom: 12 }}
          message={
            <Space wrap>
              <span>
                <b>{selected.length}</b> customer(s) selected
              </span>
              <Button
                type="primary"
                icon={<UserSwitchOutlined />}
                onClick={() => setReallocOpen(true)}
              >
                Reallocate…
              </Button>
            </Space>
          }
        />
      )}

      <Table
        rowKey="id"
        loading={loading}
        dataSource={customers}
        rowSelection={{
          selectedRowKeys: selected,
          onChange: (keys) => setSelected(keys as string[]),
        }}
        pagination={{
          current: page,
          pageSize: 50,
          total,
          showSizeChanger: false,
          showTotal: (t) => `${t.toLocaleString()} allocated`,
          onChange: (pg) => load(pg),
        }}
        scroll={{ x: 950 }}
        columns={columns}
      />

      <Modal
        open={reallocOpen}
        title={`Reallocate ${selected.length} customer(s)`}
        onOk={reallocate}
        confirmLoading={saving}
        onCancel={() => setReallocOpen(false)}
        okText="Reallocate"
      >
        <Space direction="vertical" style={{ width: "100%" }} size="middle">
          <div>
            <Typography.Text type="secondary">New agent</Typography.Text>
            <Select
              style={{ width: "100%", marginTop: 4 }}
              placeholder="Choose agent"
              showSearch
              optionFilterProp="label"
              value={agentId}
              onChange={setAgentId}
              options={agents.map((a) => ({ value: a.id, label: a.full_name }))}
            />
          </div>
          <div>
            <Typography.Text type="secondary">
              Reason <Typography.Text type="danger">*</Typography.Text> (logged with timestamp)
            </Typography.Text>
            <Input.TextArea
              rows={2}
              style={{ marginTop: 4 }}
              placeholder="e.g. Agent on leave, field visit required…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </Space>
      </Modal>

      <Modal
        open={historyFor !== null}
        title={`Allocation history — ${historyFor?.customer_name ?? ""}`}
        footer={null}
        onCancel={() => setHistoryFor(null)}
      >
        {history.length === 0 ? (
          <Typography.Text type="secondary">No allocation history</Typography.Text>
        ) : (
          <Timeline
            style={{ marginTop: 16 }}
            items={history.map((log) => ({
              children: (
                <div>
                  <div>
                    {log.from_agent_name ? (
                      <>
                        <Tag>{log.from_agent_name}</Tag>→<Tag color="blue">{log.to_agent_name}</Tag>
                      </>
                    ) : (
                      <>
                        First allocation to <Tag color="blue">{log.to_agent_name}</Tag>
                      </>
                    )}
                  </div>
                  {log.reason && (
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      Reason: {log.reason}
                    </Typography.Text>
                  )}
                  <div style={{ fontSize: 12, color: "#888" }}>
                    by {log.allocated_by_name} · {new Date(log.created_at).toLocaleString("en-IN")}
                  </div>
                </div>
              ),
            }))}
          />
        )}
      </Modal>
    </div>
  );
}

export default function AllocationPage() {
  return (
    <div>
      <Typography.Title level={3} style={{ marginBottom: 24 }}>
        Customer Allocation
      </Typography.Title>
      <Tabs
        defaultActiveKey="unallocated"
        items={[
          { key: "unallocated", label: "Unallocated Queue", children: <UnallocatedQueue /> },
          { key: "allocated", label: "Allocated", children: <AllocatedList /> },
        ]}
      />
    </div>
  );
}
