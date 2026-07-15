import {
  Col,
  Empty,
  Input,
  Row,
  Select,
  Table,
  Tag,
  Typography,
} from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import CustomerDetailDrawer from "../components/CustomerDetailDrawer";
import type { Branch, Company, Customer } from "../types";

const STATUS_TAG: Record<string, { color: string; label: string }> = {
  active: { color: "green", label: "Active" },
  closed: { color: "default", label: "Closed" },
  recalled: { color: "orange", label: "Recalled" },
};

interface Product {
  id: string;
  raw_label: string;
  canonical_label: string;
}

export default function CustomersPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [buckets, setBuckets] = useState<string[]>([]);
  const [product, setProduct] = useState<string | null>(null);
  const [bucket, setBucket] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get("/companies"),
      api.get("/branches"),
    ]).then(([cRes, bRes]) => {
      setCompanies(cRes.data.companies);
      setBranches(bRes.data.branches);
    });
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

  const load = useCallback(async (pg = 1) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page: pg, limit: 50 };
      if (companyId) params.company_id = companyId;
      if (branchId) params.branch_id = branchId;
      if (product) params.product = product;
      if (bucket) params.bucket = bucket;
      if (status) params.status = status;
      if (query) params.q = query;
      const res = await api.get("/customers", { params });
      setCustomers(res.data.customers);
      setTotal(res.data.total);
      setPage(pg);
    } finally {
      setLoading(false);
    }
  }, [companyId, branchId, product, bucket, status, query]);

  useEffect(() => {
    load(1);
  }, [load]);

  const fmtAmount = (v: string | null) =>
    v == null ? "—" : Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Customers
        </Typography.Title>
        <Typography.Text type="secondary">{total.toLocaleString()} records</Typography.Text>
      </div>

      {/* Filters */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={6}>
          <Select
            style={{ width: "100%" }}
            placeholder="All companies"
            allowClear
            value={companyId}
            onChange={(v) => { setCompanyId(v ?? null); setProduct(null); setBucket(null); }}
            options={companies.map((c) => ({ value: c.id, label: c.name }))}
          />
        </Col>
        <Col xs={12} sm={4}>
          <Select
            style={{ width: "100%" }}
            placeholder="All branches"
            allowClear
            value={branchId}
            onChange={(v) => setBranchId(v ?? null)}
            options={branches.map((b) => ({ value: b.id, label: b.name }))}
          />
        </Col>
        <Col xs={12} sm={3}>
          <Select
            style={{ width: "100%" }}
            placeholder="All products"
            allowClear
            value={product}
            onChange={(v) => setProduct(v ?? null)}
            disabled={!companyId}
            options={products.map((p) => ({
              value: p.raw_label,
              label: p.canonical_label || p.raw_label,
            }))}
          />
        </Col>
        <Col xs={12} sm={3}>
          <Select
            style={{ width: "100%" }}
            placeholder="All buckets"
            allowClear
            value={bucket}
            onChange={(v) => setBucket(v ?? null)}
            disabled={!companyId}
            options={buckets.map((b) => ({ value: b, label: b }))}
          />
        </Col>
        <Col xs={12} sm={3}>
          <Select
            style={{ width: "100%" }}
            placeholder="All statuses"
            allowClear
            value={status}
            onChange={(v) => setStatus(v ?? null)}
            options={[
              { value: "active", label: "Active" },
              { value: "recalled", label: "Recalled" },
              { value: "closed", label: "Closed" },
            ]}
          />
        </Col>
        <Col xs={24} sm={5}>
          <Input.Search
            placeholder="Loan no / name / mobile"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onSearch={(v) => { setQuery(v); load(1); }}
            onKeyDown={(e) => { if (e.key === "Enter") { setQuery(search); load(1); } }}
            enterButton={<SearchOutlined />}
            allowClear
            onClear={() => { setSearch(""); setQuery(""); }}
          />
        </Col>
      </Row>

      <Table
        rowKey="id"
        loading={loading}
        dataSource={customers}
        locale={{ emptyText: <Empty description="No customers found — import data first" /> }}
        onRow={(record) => ({
          onClick: () => setDetailId(record.id),
          style: { cursor: "pointer" },
        })}
        pagination={{
          current: page,
          pageSize: 50,
          total,
          showSizeChanger: false,
          showTotal: (t) => `${t.toLocaleString()} customers`,
          onChange: (pg) => load(pg),
        }}
        scroll={{ x: 950 }}
        columns={[
          {
            title: "Status",
            dataIndex: "status",
            width: 90,
            render: (v: string) => <Tag color={STATUS_TAG[v]?.color ?? "default"}>{STATUS_TAG[v]?.label ?? v}</Tag>,
          },
          {
            title: "Loan No",
            dataIndex: "loan_number",
            width: 130,
            render: (v: string) => <Typography.Text code>{v}</Typography.Text>,
          },
          { title: "Customer", dataIndex: "customer_name", ellipsis: true },
          { title: "Mobile", dataIndex: "mobile_number", width: 130, render: (v) => v ?? "—" },
          { title: "Company", dataIndex: "company_name", width: 150, ellipsis: true },
          {
            title: "Product",
            dataIndex: "product",
            width: 120,
            render: (v) => (v ? <Tag>{v}</Tag> : "—"),
          },
          {
            title: "Bucket",
            dataIndex: "bucket",
            width: 80,
            render: (v) => (v ? <Tag color="orange">{v}</Tag> : "—"),
          },
          {
            title: "Due Amount",
            dataIndex: "due_amount",
            width: 130,
            align: "right",
            render: (v) => (
              <span className="money">{fmtAmount(v)}</span>
            ),
          },
          {
            title: "POS",
            dataIndex: "pos",
            width: 130,
            align: "right",
            render: (v) => (
              <span className="money">{fmtAmount(v)}</span>
            ),
          },
          {
            title: "EMI",
            dataIndex: "emi",
            width: 110,
            align: "right",
            render: (v) => <span className="money">{fmtAmount(v)}</span>,
          },
          {
            title: "Custom",
            key: "custom",
            width: 80,
            render: (_, r) => {
              const n = Object.keys(r.custom_fields ?? {}).length;
              // Not clickable on its own — the whole row opens the drawer,
              // which already shows these under "Customer Detail".
              return n ? <Tag>{n} field{n > 1 ? "s" : ""}</Tag> : null;
            },
          },
        ]}
      />

      <CustomerDetailDrawer
        customerId={detailId}
        open={detailId !== null}
        onClose={() => setDetailId(null)}
      />
    </div>
  );
}
