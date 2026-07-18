import { Alert, Badge, Button, Collapse, Input, Modal, Select, Space, Table, Tag, Typography, message } from "antd";
import { CalendarOutlined, PhoneOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "../api/client";
import CustomerDetailDrawer from "../components/CustomerDetailDrawer";
import LogCallModal from "../components/LogCallModal";
import RecordPaymentModal from "../components/RecordPaymentModal";
import { palette } from "../theme/tokens";
import type { Branch, DispositionCode, WorklistCustomer } from "../types";

dayjs.extend(relativeTime);

const fmtAmount = (v: string | number | null | undefined) =>
  v == null ? "-" : Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 });

interface ReminderDue {
  id: string;
  customer_id: string | null;
  customer_name: string | null;
  loan_number: string | null;
  note: string | null;
  remind_at: string;
}

interface PtpDue {
  id: string;
  customer_id: string;
  customer_name: string;
  loan_number: string;
  amount: string;
  promised_date: string;
}

/**
 * A telecaller/field agent's own worklist on web -- the properly-scoped
 * equivalent of the (now hidden-for-this-persona) generic Customers page.
 * Complements the mobile app rather than duplicating it: same data
 * (GET /worklist), but a denser table suited to a desk/keyboard.
 */
export default function MyWorklistPage() {
  const [customers, setCustomers] = useState<WorklistCustomer[]>([]);
  const [reminders, setReminders] = useState<ReminderDue[]>([]);
  const [ptpsDue, setPtpsDue] = useState<PtpDue[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [products, setProducts] = useState<{ raw_label: string; canonical_label: string }[]>([]);
  const [buckets, setBuckets] = useState<{ id: string; name: string }[]>([]);

  const [search, setSearch] = useState("");
  const [filterBranch, setFilterBranch] = useState<string | undefined>();
  const [filterProduct, setFilterProduct] = useState<string | undefined>();
  const [filterBucket, setFilterBucket] = useState<string | undefined>();

  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [dispositionCodes, setDispositionCodes] = useState<DispositionCode[]>([]);
  const [logCallTarget, setLogCallTarget] = useState<WorklistCustomer | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<WorklistCustomer | null>(null);
  const [reallocTarget, setReallocTarget] = useState<WorklistCustomer | null>(null);
  const [reallocReason, setReallocReason] = useState("");
  const [reallocSubmitting, setReallocSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const today = dayjs().format("YYYY-MM-DD");
      const params: Record<string, string> = {};
      if (search) params.q = search;
      if (filterBranch) params.branch_id = filterBranch;
      if (filterProduct) params.product = filterProduct;
      if (filterBucket) params.bucket = filterBucket;

      const [worklistRes, remindersRes, ptpsRes] = await Promise.all([
        api.get("/worklist", { params }),
        api.get("/reminders", { params: { status: "pending", date: today } }),
        api.get("/ptps/due", { params: { date: today } }),
      ]);
      setCustomers(worklistRes.data.customers);
      setReminders(remindersRes.data.reminders);
      setPtpsDue(ptpsRes.data.ptps);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [search, filterBranch, filterProduct, filterBucket]);

  useEffect(() => {
    api.get("/dispositions").then((res) => setDispositionCodes(res.data.disposition_codes));
    api.get("/branches").then((res) => setBranches(res.data.branches));
    api.get("/products").then((res) => setProducts(res.data.products));
    api.get("/buckets").then((res) => setBuckets(res.data.buckets));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dueCount = reminders.length + ptpsDue.length;

  const submitReallocation = async () => {
    if (!reallocTarget) return;
    if (reallocReason.trim().length < 3) {
      message.error("Please explain why (at least a few words)");
      return;
    }
    setReallocSubmitting(true);
    try {
      await api.post("/reallocation-requests", {
        customer_id: reallocTarget.id,
        reason: reallocReason.trim(),
      });
      message.success("Request sent — your team leader will review it");
      setReallocTarget(null);
      setReallocReason("");
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setReallocSubmitting(false);
    }
  };

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 4 }}>
        My Worklist
      </Typography.Title>
      <Typography.Text type="secondary">{customers.length} customers assigned to you</Typography.Text>

      <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Input.Search
          placeholder="Search name or phone..."
          allowClear
          onSearch={(v) => setSearch(v)}
          style={{ width: 240 }}
        />
        <Select
          title="All branches" placeholder="All branches"
          allowClear
          style={{ width: 180 }}
          value={filterBranch}
          onChange={(v) => setFilterBranch(v ?? undefined)}
          options={branches.map((b) => ({ value: b.id, label: b.name }))}
        />
        <Select
          title="All products" placeholder="All products"
          allowClear
          style={{ width: 160 }}
          value={filterProduct}
          onChange={(v) => setFilterProduct(v ?? undefined)}
          options={Array.from(new Set(products.map((p) => p.raw_label))).map((label) => ({
            value: label,
            label,
          }))}
        />
        <Select
          title="All buckets" placeholder="All buckets"
          allowClear
          style={{ width: 140 }}
          value={filterBucket}
          onChange={(v) => setFilterBucket(v ?? undefined)}
          options={Array.from(new Set(buckets.map((b) => b.name))).map((label) => ({
            value: label,
            label,
          }))}
        />
      </div>

      <div style={{ marginTop: 16, marginBottom: 16 }}>
        <Collapse
          defaultActiveKey={dueCount > 0 ? ["due"] : []}
          items={[
            {
              key: "due",
              label: (
                <Space>
                  <span>Due Today</span>
                  <Badge count={dueCount} showZero={false} style={{ backgroundColor: palette.warning }} />
                </Space>
              ),
              children:
                dueCount === 0 ? (
                  <Typography.Text type="secondary">Nothing due today.</Typography.Text>
                ) : (
                  <Space direction="vertical" style={{ width: "100%" }}>
                    {ptpsDue.map((p) => (
                      <Alert
                        key={p.id}
                        type={dayjs(p.promised_date).isBefore(dayjs(), "day") ? "error" : "warning"}
                        showIcon
                        icon={<CalendarOutlined />}
                        message={`PTP: ${p.customer_name} — ${fmtAmount(p.amount)} by ${dayjs(p.promised_date).format("DD MMM")}`}
                        action={
                          <Button size="small" onClick={() => setDetailId(p.customer_id)}>
                            View
                          </Button>
                        }
                      />
                    ))}
                    {reminders.map((r) => (
                      <Alert
                        key={r.id}
                        type="info"
                        showIcon
                        message={
                          r.customer_name
                            ? `${r.customer_name} (${r.loan_number}) — ${r.note ?? "Reminder"}`
                            : (r.note ?? "Reminder")
                        }
                        description={dayjs(r.remind_at).format("HH:mm")}
                        action={
                          r.customer_id ? (
                            <Button size="small" onClick={() => setDetailId(r.customer_id)}>
                              View
                            </Button>
                          ) : undefined
                        }
                      />
                    ))}
                  </Space>
                ),
            },
          ]}
        />
      </div>

      <Table<WorklistCustomer>
        rowKey="id"
        loading={loading}
        dataSource={customers}
        pagination={{ pageSize: 50 }}
        locale={{ emptyText: "No customers assigned to you right now" }}
        onRow={(record) => ({
          onClick: () => setDetailId(record.id),
          style: { cursor: "pointer" },
        })}
        scroll={{ x: 900 }}
        columns={[
          {
            title: "Loan No",
            dataIndex: "loan_number",
            width: 120,
            render: (v: string) => <Typography.Text code>{v}</Typography.Text>,
          },
          { title: "Customer", dataIndex: "customer_name", ellipsis: true },
          {
            title: "Mobile",
            dataIndex: "mobile_number",
            width: 130,
            render: (v: string | null) => (v ? <><PhoneOutlined /> {v}</> : "-"),
          },
          { title: "Product", dataIndex: "product", width: 110, render: (v) => v ?? "-" },
          {
            title: "Bucket",
            dataIndex: "bucket",
            width: 80,
            render: (v: string | null) => (v ? <Tag color="orange">{v}</Tag> : "-"),
          },
          {
            title: "Due Amount",
            dataIndex: "due_amount",
            width: 120,
            align: "right" as const,
            render: (v: string | null) => <span className="money">{fmtAmount(v)}</span>,
          },
          {
            title: "EMI",
            dataIndex: "emi",
            width: 120,
            align: "right" as const,
            render: (v: string | null) => <span className="money">{fmtAmount(v)}</span>,
          },
          {
            title: "Last Activity",
            width: 220,
            render: (_, r) =>
              r.last_call_at ? (
                <span>
                  <Tag>{r.last_result_code ?? "Logged"}</Tag>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {" "}
                    {dayjs(r.last_call_at).fromNow()}
                  </Typography.Text>
                </span>
              ) : (
                <Typography.Text type="secondary">No calls yet</Typography.Text>
              ),
          },
          {
            title: "PTP",
            width: 140,
            render: (_, r) =>
              r.ptp_date ? (
                <span>
                  {fmtAmount(r.ptp_amount)}
                  <br />
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {dayjs(r.ptp_date).format("DD MMM")}
                  </Typography.Text>
                </span>
              ) : (
                "-"
              ),
          },
          {
            title: "Actions",
            width: 260,
            render: (_, r) => (
              <Space onClick={(e) => e.stopPropagation()}>
                <Button size="small" onClick={() => setLogCallTarget(r)}>
                  Log Call
                </Button>
                <Button size="small" onClick={() => setPaymentTarget(r)}>
                  Payment
                </Button>
                <Button
                  size="small"
                  onClick={() => {
                    setReallocReason("");
                    setReallocTarget(r);
                  }}
                >
                  Reallocate
                </Button>
              </Space>
            ),
          },
        ]}
      />

      <CustomerDetailDrawer
        customerId={detailId}
        open={detailId !== null}
        onClose={() => {
          setDetailId(null);
          void load();
        }}
      />

      {logCallTarget && (
        <LogCallModal
          customerId={logCallTarget.id}
          customerName={logCallTarget.customer_name}
          dispositionCodes={dispositionCodes}
          open={logCallTarget !== null}
          onClose={() => setLogCallTarget(null)}
          onSaved={load}
        />
      )}
      {paymentTarget && (
        <RecordPaymentModal
          customerId={paymentTarget.id}
          customerName={paymentTarget.customer_name}
          dueAmount={paymentTarget.due_amount != null ? Number(paymentTarget.due_amount) : null}
          open={paymentTarget !== null}
          onClose={() => setPaymentTarget(null)}
          onSaved={load}
        />
      )}

      <Modal
        title={`Request Reallocation — ${reallocTarget?.customer_name ?? ""}`}
        open={!!reallocTarget}
        onCancel={() => setReallocTarget(null)}
        onOk={submitReallocation}
        confirmLoading={reallocSubmitting}
        okText="Send Request"
      >
        <Typography.Paragraph type="secondary">
          Your team lead will review this — nothing changes until they decide. Check My Requests for the
          outcome.
        </Typography.Paragraph>
        <Input.TextArea
          rows={3}
          placeholder="Why should this customer be moved? (wrong area, language, dispute…)"
          value={reallocReason}
          onChange={(e) => setReallocReason(e.target.value)}
        />
      </Modal>
    </div>
  );
}
