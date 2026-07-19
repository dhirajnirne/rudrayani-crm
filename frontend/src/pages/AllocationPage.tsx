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
import { HistoryOutlined, UserSwitchOutlined, PlusOutlined } from "@ant-design/icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "../api/client";
import type { AllocationLog, Company, Customer, Employee } from "../types";
import CustomerDetailDrawer from "../components/CustomerDetailDrawer";

interface Product {
  id: string;
  raw_label: string;
  canonical_label: string;
}

const fmtAmount = (v: string | null) =>
  v == null ? "—" : Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 });

/** Shared column set for both queues. */
const getBaseColumns = (onOpenDetail: (customerId: string) => void) => [
  {
    title: "",
    key: "details",
    width: 40,
    render: (_: unknown, record: Customer) => (
      <Button
        type="text"
        icon={<PlusOutlined />}
        title="View Details"
        onClick={() => onOpenDetail(record.id)}
      />
    ),
  },
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
  {
    title: "POS",
    dataIndex: "pos",
    width: 130,
    align: "right" as const,
    render: (v: string | null) => <span className="money">{fmtAmount(v)}</span>,
  },
];

interface Branch { id: string; name: string }
interface Team { id: string; name: string; branch_id: string }

function useBranchTeam() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  useEffect(() => {
    Promise.all([api.get("/branches"), api.get("/teams")]).then(([br, tm]) => {
      setBranches(br.data.branches);
      setTeams(tm.data.teams);
    });
  }, []);
  const teamOptions = teams.filter((t) => !branchId || t.branch_id === branchId);
  return { branches, teams: teamOptions, branchId, setBranchId, teamId, setTeamId };
}

/** Agents a TL can allocate to: active users who work customers. */
function useAssignableAgents(
  branchId: string | null,
  teamId: string | null,
  customerBranch?: string | null,
  product?: string | null,
) {
  const [agents, setAgents] = useState<Employee[]>([]);
  useEffect(() => {
    const params: Record<string, string> = {};
    if (branchId) params.branch_id = branchId;
    if (teamId) params.team_id = teamId;
    if (customerBranch) params.customer_branch = customerBranch;
    if (product) params.product = product;
    api.get("/employees", { params }).then((res) => {
      setAgents(
        (res.data.employees as Employee[]).filter(
          (e) =>
            e.is_active &&
            e.capabilities.some((c) =>
              ["telecaller", "field_agent", "branch_manager"].includes(c),
            ),
        ),
      );
    });
  }, [branchId, teamId, customerBranchId, product]);
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
      setBuckets(bRes.data.buckets.map((b: { label: string }) => b.label));
    });
  }, [companyId]);

  return { companies, companyId, setCompanyId, products, buckets, product, setProduct, bucket, setBucket };
}

function FilterRow({
  filters,
  branchTeam,
  agentPickerLabel,
}: {
  filters: ReturnType<typeof useCompanyFilters>;
  branchTeam: ReturnType<typeof useBranchTeam>;
  agentPickerLabel?: string;
}) {
  return (
    <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
      <Col xs={24} sm={8}>
        <Select
          style={{ width: "100%" }}
          title="All companies" placeholder="All companies"
          allowClear
          value={filters.companyId}
          onChange={(v) => {
            filters.setCompanyId(v ?? null);
            filters.setProduct(null);
            filters.setBucket(null);
          }}
          options={filters.companies.map((c) => ({ value: c.id, label: c.name }))}
        />
      </Col>
      <Col xs={12} sm={3}>
        <Select
          style={{ width: "100%" }}
          title={agentPickerLabel ? "Branch (agent filter)" : "All branches"} placeholder={agentPickerLabel ? "Branch (agent filter)" : "All branches"}
          allowClear
          value={branchTeam.branchId}
          onChange={(v) => { branchTeam.setBranchId(v ?? null); branchTeam.setTeamId(null); }}
          options={branchTeam.branches.map((b) => ({ value: b.id, label: b.name }))}
        />
      </Col>
      <Col xs={12} sm={3}>
        <Select
          style={{ width: "100%" }}
          title={agentPickerLabel ? "Team (agent filter)" : "All teams"} placeholder={agentPickerLabel ? "Team (agent filter)" : "All teams"}
          allowClear
          value={branchTeam.teamId}
          onChange={(v) => branchTeam.setTeamId(v ?? null)}
          options={branchTeam.teams.map((t) => ({ value: t.id, label: t.name }))}
        />
      </Col>
      <Col xs={12} sm={5}>
        <Select
          style={{ width: "100%" }}
          title="All products" placeholder="All products"
          allowClear
          value={filters.product}
          onChange={(v) => filters.setProduct(v ?? null)}
          disabled={!filters.companyId}
          options={filters.products.map((p) => ({
            value: p.raw_label,
            label: p.canonical_label || p.raw_label,
          }))}
        />
      </Col>
      <Col xs={12} sm={5}>
        <Select
          style={{ width: "100%" }}
          title="All buckets" placeholder="All buckets"
          allowClear
          value={filters.bucket}
          onChange={(v) => filters.setBucket(v ?? null)}
          disabled={!filters.companyId}
          options={filters.buckets.map((b) => ({ value: b, label: b }))}
        />
      </Col>
    </Row>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Unallocated queue: filter → multi-select → assign
// ──────────────────────────────────────────────────────────────────────────────

function UnallocatedQueue({ onOpenDetail }: { onOpenDetail: (id: string) => void }) {
  const filters = useCompanyFilters();
  const branchTeam = useBranchTeam();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [customerBranch, setCustomerBranch] = useState<string>("");
  const agents = useAssignableAgents(branchTeam.branchId, branchTeam.teamId, customerBranch, filters.product);
  const allAgents = useAssignableAgents(null, null, null, null);
  const telecallers = useMemo(() => allAgents.filter((a) => a.capabilities.includes("telecaller")), [allAgents]);
  const fieldAgents = useMemo(() => agents.filter((a) => a.capabilities.includes("field_agent")), [agents]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [fieldAgentId, setFieldAgentId] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [assigningField, setAssigningField] = useState(false);

  useEffect(() => {
    api.get("/branches").then((res) => setBranches(res.data.branches));
  }, []);

  const load = useCallback(
    async (pg = 1) => {
      setLoading(true);
      try {
        const params: Record<string, string | number> = { page: pg, limit: 50 };
        if (filters.companyId) params.company_id = filters.companyId;
        if (filters.product) params.product = filters.product;
        if (filters.bucket) params.bucket = filters.bucket;
        if (customerBranch) params.customer_branch = customerBranch;
        const res = await api.get("/allocations/unallocated", { params });
        setCustomers(res.data.customers);
        setTotal(res.data.total);
        setPage(pg);
        setSelected([]);
      } finally {
        setLoading(false);
      }
    },
    [filters.companyId, filters.product, filters.bucket, customerBranch],
  );

  useEffect(() => {
    load(1);
  }, [load]);

  const assign = () => {
    if (!agentId) return message.error("Pick an agent first");
    const agentName = agents.find((a) => a.id === agentId)?.full_name;
    Modal.confirm({
      title: `Assign ${selected.length} customer(s) to ${agentName}?`,
      content: "This will move them out of the unallocated queue immediately.",
      okText: "Assign",
      onOk: async () => {
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
      },
    });
  };

  const assignField = () => {
    if (!fieldAgentId) return message.error("Pick a field agent first");
    const fieldAgentName = agents.find((a) => a.id === fieldAgentId)?.full_name;
    Modal.confirm({
      title: `Assign ${selected.length} customer(s) to field agent ${fieldAgentName}?`,
      content: "This will move them out of the unallocated queue immediately.",
      okText: "Assign",
      onOk: async () => {
        setAssigningField(true);
        try {
          const res = await api.post("/allocations/assign-field-agent", {
            customer_ids: selected,
            agent_id: fieldAgentId,
          });
          message.success(`${res.data.assigned} customer(s) assigned to field agent ${res.data.agent_name}`);
          load(page);
        } catch (err) {
          message.error(errorMessage(err));
        } finally {
          setAssigningField(false);
        }
      },
    });
  };

  return (
    <div>
      <FilterRow filters={filters} branchTeam={branchTeam} agentPickerLabel="Narrows agent picker" />
      <Typography.Text type="secondary" style={{ display: "block", marginBottom: 12, fontSize: 12 }}>
        Branch / Team filters above narrow the agent selector — not the customer table. Use "Customer branch" below to filter unallocated customers by their assigned branch.
      </Typography.Text>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={6}>
          <Input
            title="Search customer branch" placeholder="Search customer branch"
            allowClear
            value={customerBranch}
            onChange={(e) => setCustomerBranch(e.target.value)}
          />
        </Col>
      </Row>

      {selected.length > 0 && (
        <>
          <Alert
            type="info"
            style={{ marginBottom: 12 }}
            message={
              <Space wrap>
                <span>
                  <b>{selected.length}</b> customer(s) selected — assign to:
                </span>
                <Select
                  style={{ width: 200 }}
                  title="Choose telecaller" placeholder="Choose telecaller"
                  showSearch
                  optionFilterProp="label"
                  value={agentId}
                  onChange={setAgentId}
                  options={telecallers.map((a) => ({ value: a.id, label: a.full_name }))}
                />
                <Button
                  type="primary"
                  icon={<UserSwitchOutlined />}
                  loading={assigning}
                  onClick={assign}
                >
                  Assign Telecaller
                </Button>
              </Space>
            }
          />
          <Alert
            type="info"
            style={{ marginBottom: 12 }}
            message={
              <Space wrap>
                <span>Or assign to field agent:</span>
                <Select
                  style={{ width: 200 }}
                  title="Choose field agent" placeholder="Choose field agent"
                  showSearch
                  optionFilterProp="label"
                  value={fieldAgentId}
                  onChange={setFieldAgentId}
                  options={fieldAgents.map((a) => ({ value: a.id, label: a.full_name }))}
                />
                <Button
                  type="primary"
                  icon={<UserSwitchOutlined />}
                  loading={assigningField}
                  onClick={assignField}
                >
                  Assign Field Agent
                </Button>
              </Space>
            }
          />
        </>
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
        columns={getBaseColumns(onOpenDetail)}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Allocated list: see who has what, reallocate with reason, view history
// ──────────────────────────────────────────────────────────────────────────────

function AllocatedList({ onOpenDetail }: { onOpenDetail: (id: string) => void }) {
  const filters = useCompanyFilters();
  const branchTeam = useBranchTeam();
  const agents = useAssignableAgents(null, null);
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
        if (branchTeam.branchId) params.branch_id = branchTeam.branchId;
        if (branchTeam.teamId) params.team_id = branchTeam.teamId;
        const res = await api.get("/customers", { params });
        setCustomers(res.data.customers);
        setTotal(res.data.total);
        setPage(pg);
        setSelected([]);
      } finally {
        setLoading(false);
      }
    },
    [filters.companyId, filters.product, filters.bucket, branchTeam.branchId, branchTeam.teamId],
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
      ...getBaseColumns(onOpenDetail),
      {
        title: "Telecaller",
        dataIndex: "assigned_agent_name",
        width: 140,
        render: (v: string | null) => (v ? <Tag color="blue">{v}</Tag> : "—"),
      },
      {
        title: "Field Agent",
        dataIndex: "assigned_field_agent_name",
        width: 140,
        render: (v: string | null) => (v ? <Tag color="green">{v}</Tag> : "—"),
      },
      {
        title: "",
        key: "actions",
        width: 120,
        render: (_: unknown, record: Customer) => (
          <Space>
            <Button
              type="link"
              size="small"
              onClick={() => {
                setAgentId(record.assigned_agent_id);
                setReallocOpen(true);
              }}
            >
              Reallocate
            </Button>
            <Button
              type="link"
              size="small"
              icon={<HistoryOutlined />}
              onClick={() => openHistory(record)}
            >
              History
            </Button>
          </Space>
        ),
      },
    ],
    [onOpenDetail],
  );

  return (
    <div>
      <FilterRow filters={filters} branchTeam={branchTeam} />

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
              title="Choose agent" placeholder="Choose agent"
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
                    <Tag color={log.slot === "field" ? "purple" : "default"}>
                      {log.slot === "field" ? "Field Agent" : "Telecaller"}
                    </Tag>
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
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    by {log.allocated_by_name} · {new Date(log.created_at).toLocaleString("en-IN")}
                  </Typography.Text>
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
  const [detailDrawerId, setDetailDrawerId] = useState<string | null>(null);

  return (
    <div>
      <Typography.Title level={3} style={{ marginBottom: 24 }}>
        Customer Allocation
      </Typography.Title>
      <Tabs
        defaultActiveKey="unallocated"
        items={[
          { key: "unallocated", label: "Unallocated Queue", children: <UnallocatedQueue onOpenDetail={setDetailDrawerId} /> },
          { key: "allocated", label: "Allocated", children: <AllocatedList onOpenDetail={setDetailDrawerId} /> },
        ]}
      />
      <CustomerDetailDrawer
        customerId={detailDrawerId}
        open={detailDrawerId !== null}
        onClose={() => setDetailDrawerId(null)}
      />
    </div>
  );
}
