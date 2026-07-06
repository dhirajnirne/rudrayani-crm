import {
  Button,
  Col,
  Descriptions,
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
import type { Company, Customer } from "../types";

interface Product {
  id: string;
  raw_label: string;
  canonical_label: string;
}

export default function CustomersPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [buckets, setBuckets] = useState<string[]>([]);
  const [product, setProduct] = useState<string | null>(null);
  const [bucket, setBucket] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

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

  const load = useCallback(async (pg = 1) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page: pg, limit: 50 };
      if (companyId) params.company_id = companyId;
      if (product) params.product = product;
      if (bucket) params.bucket = bucket;
      if (query) params.q = query;
      const res = await api.get("/customers", { params });
      setCustomers(res.data.customers);
      setTotal(res.data.total);
      setPage(pg);
    } finally {
      setLoading(false);
    }
  }, [companyId, product, bucket, query]);

  useEffect(() => {
    load(1);
  }, [load]);

  const fmtAmount = (v: string | null) =>
    v == null ? "—" : Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 });

  const expandedRow = (record: Customer) => {
    const customKeys = Object.keys(record.custom_fields ?? {});
    if (customKeys.length === 0)
      return <Typography.Text type="secondary">No custom fields</Typography.Text>;
    return (
      <Descriptions size="small" column={3} bordered>
        {customKeys.map((k) => (
          <Descriptions.Item key={k} label={k}>
            {String(record.custom_fields[k] ?? "")}
          </Descriptions.Item>
        ))}
      </Descriptions>
    );
  };

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
        <Col xs={24} sm={8}>
          <Select
            style={{ width: "100%" }}
            placeholder="All companies"
            allowClear
            value={companyId}
            onChange={(v) => { setCompanyId(v ?? null); setProduct(null); setBucket(null); }}
            options={companies.map((c) => ({ value: c.id, label: c.name }))}
          />
        </Col>
        <Col xs={12} sm={5}>
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
        <Col xs={12} sm={4}>
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
        <Col xs={24} sm={7}>
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
        expandable={{
          expandedRowRender: expandedRow,
          rowExpandable: (r) => Object.keys(r.custom_fields ?? {}).length > 0,
        }}
        pagination={{
          current: page,
          pageSize: 50,
          total,
          showSizeChanger: false,
          showTotal: (t) => `${t.toLocaleString()} customers`,
          onChange: (pg) => load(pg),
        }}
        scroll={{ x: 900 }}
        columns={[
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
              return n ? (
                <Button type="link" size="small" style={{ padding: 0 }}>
                  {n} field{n > 1 ? "s" : ""}
                </Button>
              ) : null;
            },
          },
        ]}
      />
    </div>
  );
}
