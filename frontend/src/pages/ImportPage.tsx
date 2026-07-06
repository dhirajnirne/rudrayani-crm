import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Form,
  Input,
  Radio,
  Row,
  Select,
  Space,
  Statistic,
  Steps,
  Table,
  Tag,
  Tabs,
  Typography,
  Upload,
  message,
} from "antd";
import {
  CheckCircleOutlined,
  CloudUploadOutlined,
  FileExcelOutlined,
  HistoryOutlined,
  InboxOutlined,
} from "@ant-design/icons";
import type { RcFile } from "antd/es/upload";
import type { Dayjs } from "dayjs";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, errorMessage } from "../api/client";
import type { Company, ImportRun, ImportTemplate } from "../types";

const SYSTEM_FIELDS = [
  { value: "loan_number", label: "Loan Number (required)" },
  { value: "customer_name", label: "Customer Name (required)" },
  { value: "mobile_number", label: "Mobile Number" },
  { value: "product", label: "Product" },
  { value: "bucket", label: "Bucket" },
  { value: "due_amount", label: "Due Amount / POS" },
  { value: "emi", label: "EMI Amount" },
  { value: "agent_phone", label: "Agent Phone (assigns the loan)" },
];

interface PreviewResult {
  mode: "new" | "allocation";
  total_rows: number;
  valid_rows: number;
  error_rows: number;
  duplicates_in_db: number;
  updates_in_db: number;
  missing_from_file: number;
  unmapped_columns: string[];
  errors: { row: number; problems: string[] }[];
  duplicate_loan_numbers: string[];
}

interface CommitResult {
  inserted_rows: number;
  updated_rows: number;
  duplicate_rows: number;
  error_rows: number;
  unknown_agent_phones: string[];
}

// ──────────────────────────────────────────────────────────────────────────────
// Import wizard (4-step flow)
// ──────────────────────────────────────────────────────────────────────────────

function ImportWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);

  // Step 0
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [file, setFile] = useState<RcFile | null>(null);
  const [mode, setMode] = useState<"new" | "allocation">("new");
  const [allocationMonth, setAllocationMonth] = useState<Dayjs | null>(null);

  // Step 1
  const [uploadKey, setUploadKey] = useState("");
  const [fileName, setFileName] = useState("");
  const [detectedColumns, setDetectedColumns] = useState<string[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [templates, setTemplates] = useState<ImportTemplate[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [templateName, setTemplateName] = useState("");
  const [savedTemplateId, setSavedTemplateId] = useState<string | null>(null);

  // Step 2
  const [preview, setPreview] = useState<PreviewResult | null>(null);

  // Step 3
  const [result, setResult] = useState<CommitResult | null>(null);

  useEffect(() => {
    api.get("/companies").then((r) => setCompanies(r.data.companies));
  }, []);

  // Load templates when company changes
  useEffect(() => {
    if (!companyId) { setTemplates([]); return; }
    api
      .get("/import-templates", { params: { company_id: companyId } })
      .then((r) =>
        setTemplates(
          (r.data.templates as ImportTemplate[]).filter((t) => t.is_active),
        ),
      );
  }, [companyId]);

  // ── Step 0: upload file ──────────────────────────────────────────────────

  const monthParam = () =>
    mode === "allocation" && allocationMonth
      ? { mode, allocation_month: allocationMonth.format("YYYY-MM-01") }
      : { mode };

  const handleUpload = async () => {
    if (!companyId) return message.error("Select a company first");
    if (mode === "allocation" && !allocationMonth) {
      return message.error("Pick the allocation month first");
    }
    if (!file) return message.error("Attach an Excel file (.xlsx)");
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file as unknown as Blob);
      const res = await api.post("/imports/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setUploadKey(res.data.upload_key);
      setFileName(file.name);
      setDetectedColumns(res.data.columns);
      setRowCount(res.data.row_count);
      // Clear mapping for the new file
      setMapping({});
      setSavedTemplateId(null);
      setTemplateName("");
      setStep(1);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // ── Step 1: map columns ──────────────────────────────────────────────────

  const applyTemplate = (templateId: string) => {
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return;
    const newMapping: Record<string, string> = {};
    for (const col of detectedColumns) {
      const mapped = tpl.column_mapping[col];
      if (mapped) newMapping[col] = mapped;
    }
    setMapping(newMapping);
  };

  const handlePreview = async () => {
    // Validate: required system fields must be mapped
    const mappedFields = Object.values(mapping);
    if (!mappedFields.includes("loan_number") || !mappedFields.includes("customer_name")) {
      return message.error("Map at least Loan Number and Customer Name before previewing");
    }
    setLoading(true);
    try {
      let resolvedTemplateId = savedTemplateId;

      // Save as template if a name was provided
      if (templateName.trim()) {
        const saveRes = await api.post("/import-templates", {
          company_id: companyId,
          name: templateName.trim(),
          column_mapping: mapping,
        });
        resolvedTemplateId = saveRes.data.template.id;
        setSavedTemplateId(resolvedTemplateId);
        message.success(`Template "${templateName.trim()}" saved (v${saveRes.data.template.version})`);
      }

      const body: Record<string, unknown> = {
        upload_key: uploadKey,
        company_id: companyId,
        ...monthParam(),
      };
      if (resolvedTemplateId) {
        body.template_id = resolvedTemplateId;
      } else {
        body.column_mapping = mapping;
      }

      const res = await api.post("/imports/preview", body);
      setPreview(res.data);
      setStep(2);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: commit ───────────────────────────────────────────────────────

  const handleCommit = async () => {
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        upload_key: uploadKey,
        company_id: companyId,
        file_name: fileName,
        ...monthParam(),
      };
      if (savedTemplateId) {
        body.template_id = savedTemplateId;
      } else {
        body.column_mapping = mapping;
      }
      const res = await api.post("/imports/commit", body);
      setResult(res.data);
      setStep(3);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const restart = () => {
    setStep(0);
    setFile(null);
    setCompanyId(null);
    setUploadKey("");
    setDetectedColumns([]);
    setMapping({});
    setTemplateName("");
    setSavedTemplateId(null);
    setPreview(null);
    setResult(null);
  };

  // ── Render steps ─────────────────────────────────────────────────────────

  const renderStep0 = () => (
    <Space direction="vertical" style={{ width: "100%" }} size="large">
      <Form.Item label="Company" required>
        <Select
          style={{ width: 320 }}
          placeholder="Select a company"
          value={companyId}
          onChange={setCompanyId}
          options={companies.map((c) => ({ value: c.id, label: c.name }))}
        />
      </Form.Item>

      <Form.Item label="Import type" required style={{ marginBottom: 0 }}>
        <Radio.Group
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          options={[
            { value: "new", label: "New customers" },
            { value: "allocation", label: "Monthly allocation" },
          ]}
          optionType="button"
        />
      </Form.Item>
      {mode === "allocation" && (
        <Form.Item
          label="Allocation month"
          required
          extra="Existing loans are updated with the file's bucket/amounts; every loan gets a snapshot for this month (feeds the performance dashboard)."
        >
          <DatePicker
            picker="month"
            value={allocationMonth}
            onChange={setAllocationMonth}
            style={{ width: 200 }}
          />
        </Form.Item>
      )}

      <Upload.Dragger
        accept=".xlsx"
        maxCount={1}
        beforeUpload={(f) => { setFile(f as RcFile); return false; }}
        onRemove={() => setFile(null)}
        fileList={file ? [file as unknown as import("antd").UploadFile] : []}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined style={{ color: "#00535b" }} />
        </p>
        <p className="ant-upload-text">Click or drag an .xlsx file here</p>
        <p className="ant-upload-hint">Max 15 MB · Excel (.xlsx) only</p>
      </Upload.Dragger>

      <Button
        type="primary"
        size="large"
        icon={<CloudUploadOutlined />}
        onClick={handleUpload}
        loading={loading}
        style={{ height: 48, paddingInline: 32 }}
      >
        Upload & Detect Columns
      </Button>
    </Space>
  );

  const mappingTableData = detectedColumns.map((col) => ({
    col,
    mapped: mapping[col] ?? "",
  }));

  const renderStep1 = () => (
    <Space direction="vertical" style={{ width: "100%" }} size="large">
      <Alert
        type="info"
        showIcon
        message={`${fileName} — ${rowCount} data rows, ${detectedColumns.length} columns detected`}
      />

      {/* Load existing template */}
      {templates.length > 0 && (
        <div>
          <Typography.Text type="secondary">Load existing template:</Typography.Text>
          <Select
            style={{ marginLeft: 12, width: 260 }}
            placeholder="Choose a saved template…"
            allowClear
            options={templates.map((t) => ({ value: t.id, label: `${t.name} (v${t.version})` }))}
            onChange={(id) => { if (id) applyTemplate(id); }}
          />
        </div>
      )}

      {/* Two-column mapping matrix */}
      <Table
        rowKey="col"
        dataSource={mappingTableData}
        pagination={false}
        size="small"
        columns={[
          {
            title: "Excel Column",
            dataIndex: "col",
            width: "45%",
            render: (v: string) => (
              <Typography.Text style={{ fontFamily: "monospace" }}>{v}</Typography.Text>
            ),
          },
          {
            title: "Maps to system field",
            dataIndex: "mapped",
            width: "55%",
            render: (_: string, record: { col: string }) => (
              <Select
                style={{ width: "100%" }}
                placeholder="Skip this column"
                allowClear
                value={mapping[record.col] || undefined}
                onChange={(v) =>
                  setMapping((prev) => {
                    const next = { ...prev };
                    if (v) next[record.col] = v;
                    else delete next[record.col];
                    return next;
                  })
                }
                options={SYSTEM_FIELDS}
              />
            ),
          },
        ]}
      />

      {/* Save as template */}
      <div>
        <Typography.Text type="secondary">
          Template name{" "}
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            (optional — saves/versions this mapping for reuse)
          </Typography.Text>
        </Typography.Text>
        <Input
          style={{ marginTop: 4, width: 320 }}
          placeholder="e.g. Standard Ledger"
          value={templateName}
          onChange={(e) => setTemplateName(e.target.value)}
        />
      </div>

      <Space>
        <Button onClick={() => setStep(0)}>Back</Button>
        <Button
          type="primary"
          size="large"
          onClick={handlePreview}
          loading={loading}
          style={{ height: 48, paddingInline: 32, backgroundColor: "#00535b", borderColor: "#00535b" }}
        >
          Apply Template & Parse Ledger
        </Button>
      </Space>
    </Space>
  );

  const renderStep2 = () => {
    if (!preview) return null;
    const isAllocation = preview.mode === "allocation";
    const canCommit = preview.valid_rows > 0 || (isAllocation && preview.updates_in_db > 0);
    return (
      <Space direction="vertical" style={{ width: "100%" }} size="large">
        <Row gutter={16}>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic title="Total rows" value={preview.total_rows} />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic
                title={isAllocation ? "New loans (will insert)" : "Valid (will insert)"}
                value={preview.valid_rows}
                valueStyle={{ color: "#2c694e" }}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic
                title="Errors (will skip)"
                value={preview.error_rows}
                valueStyle={preview.error_rows > 0 ? { color: "#ba1a1a" } : {}}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic
                title={isAllocation ? "Existing loans (will update)" : "Already in DB"}
                value={isAllocation ? preview.updates_in_db : preview.duplicates_in_db}
                valueStyle={
                  isAllocation
                    ? { color: "#2c694e" }
                    : preview.duplicates_in_db > 0
                      ? { color: "#d77a00" }
                      : {}
                }
              />
            </Card>
          </Col>
        </Row>

        {isAllocation && preview.missing_from_file > 0 && (
          <Alert
            type="warning"
            showIcon
            message={`${preview.missing_from_file} active loan(s) are not in this month's file — they will have no allocation for this month.`}
          />
        )}

        {preview.unmapped_columns.length > 0 && (
          <Alert
            type="info"
            showIcon
            message={`${preview.unmapped_columns.length} unmapped column(s) will be saved as custom fields: ${preview.unmapped_columns.join(", ")}`}
          />
        )}

        {preview.errors.length > 0 && (
          <div>
            <Typography.Text strong>Row errors (first 50):</Typography.Text>
            <Table
              rowKey="row"
              size="small"
              style={{ marginTop: 8 }}
              pagination={false}
              dataSource={preview.errors}
              columns={[
                { title: "Row", dataIndex: "row", width: 70 },
                {
                  title: "Problems",
                  dataIndex: "problems",
                  render: (ps: string[]) => ps.join("; "),
                },
              ]}
            />
          </div>
        )}

        {!canCommit && (
          <Alert
            type="warning"
            message="No valid rows to insert — check your column mapping or the file data."
            showIcon
          />
        )}

        <Space>
          <Button onClick={() => setStep(1)}>Back to mapping</Button>
          <Button
            type="primary"
            size="large"
            disabled={!canCommit}
            onClick={handleCommit}
            loading={loading}
            style={canCommit ? { height: 48, paddingInline: 32 } : { height: 48 }}
          >
            Commit Import (
            {isAllocation ? preview.valid_rows + preview.updates_in_db : preview.valid_rows} rows)
          </Button>
        </Space>
      </Space>
    );
  };

  const renderStep3 = () => {
    if (!result) return null;
    return (
      <Space direction="vertical" style={{ width: "100%" }} size="large" align="center">
        <CheckCircleOutlined style={{ fontSize: 64, color: "#2c694e" }} />
        <Typography.Title level={3} style={{ margin: 0 }}>
          Import complete
        </Typography.Title>
        <Descriptions bordered size="small" style={{ width: 360 }}>
          <Descriptions.Item label="Inserted" span={3}>
            <span className="money" style={{ color: "#2c694e" }}>
              {result.inserted_rows}
            </span>
          </Descriptions.Item>
          {result.updated_rows > 0 && (
            <Descriptions.Item label="Updated" span={3}>
              <span className="money" style={{ color: "#2c694e" }}>
                {result.updated_rows}
              </span>
            </Descriptions.Item>
          )}
          <Descriptions.Item label="Skipped (duplicate)" span={3}>
            <span className="money">{result.duplicate_rows}</span>
          </Descriptions.Item>
          <Descriptions.Item label="Errors" span={3}>
            <span className="money">{result.error_rows}</span>
          </Descriptions.Item>
        </Descriptions>
        {result.unknown_agent_phones?.length > 0 && (
          <Alert
            type="warning"
            showIcon
            message={`Unknown agent phone(s), loans left with their previous assignee: ${result.unknown_agent_phones.join(", ")}`}
          />
        )}
        <Space>
          <Button onClick={() => navigate("/customers")}>View Customers</Button>
          <Button type="primary" onClick={restart}>
            Import another file
          </Button>
        </Space>
      </Space>
    );
  };

  const stepContent = [renderStep0(), renderStep1(), renderStep2(), renderStep3()];

  return (
    <div>
      <Steps
        current={step}
        style={{ marginBottom: 32 }}
        items={[
          { title: "Select & Upload", icon: <FileExcelOutlined /> },
          { title: "Map Columns" },
          { title: "Preview & Validate" },
          { title: "Done", icon: <CheckCircleOutlined /> },
        ]}
      />
      <Card>{stepContent[step]}</Card>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Import history tab
// ──────────────────────────────────────────────────────────────────────────────

function ImportHistory() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [runs, setRuns] = useState<ImportRun[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get("/companies").then((r) => setCompanies(r.data.companies));
  }, []);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const res = await api.get("/imports/runs", { params: { company_id: companyId } });
      setRuns(res.data.runs);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Space direction="vertical" style={{ width: "100%" }} size="large">
      <Select
        style={{ width: 320 }}
        placeholder="Select a company to view history"
        value={companyId}
        onChange={setCompanyId}
        options={companies.map((c) => ({ value: c.id, label: c.name }))}
      />
      <Table
        rowKey="id"
        loading={loading}
        dataSource={runs}
        pagination={false}
        columns={[
          {
            title: "Date",
            dataIndex: "created_at",
            width: 170,
            render: (v: string) => new Date(v).toLocaleString("en-IN"),
          },
          { title: "File", dataIndex: "file_name", render: (v) => v ?? "—" },
          { title: "Template", dataIndex: "template_name", render: (v) => v ?? "—" },
          { title: "Uploaded by", dataIndex: "uploaded_by_name", render: (v) => v ?? "—" },
          {
            title: "Inserted",
            dataIndex: "inserted_rows",
            width: 90,
            align: "right",
            render: (v: number) => <span className="money" style={{ color: "#2c694e" }}>{v}</span>,
          },
          {
            title: "Dupes",
            dataIndex: "duplicate_rows",
            width: 80,
            align: "right",
            render: (v: number) => <span className="money">{v}</span>,
          },
          {
            title: "Errors",
            dataIndex: "error_rows",
            width: 80,
            align: "right",
            render: (v: number) => (
              <span className="money" style={v > 0 ? { color: "#ba1a1a" } : {}}>
                {v}
              </span>
            ),
          },
          {
            title: "Status",
            key: "status",
            width: 110,
            render: (_, r: ImportRun) => {
              if (r.inserted_rows === 0 && r.error_rows === 0)
                return <Tag color="default">All dupes</Tag>;
              if (r.error_rows === 0) return <Tag color="success">Clean</Tag>;
              return <Tag color="warning">Partial</Tag>;
            },
          },
        ]}
      />
    </Space>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Page shell with Tabs
// ──────────────────────────────────────────────────────────────────────────────

export default function ImportPage() {
  return (
    <div>
      <Typography.Title level={3} style={{ marginBottom: 24 }}>
        Data Import
      </Typography.Title>
      <Tabs
        defaultActiveKey="wizard"
        items={[
          {
            key: "wizard",
            label: (
              <Space>
                <CloudUploadOutlined />
                Import Wizard
              </Space>
            ),
            children: <ImportWizard />,
          },
          {
            key: "history",
            label: (
              <Space>
                <HistoryOutlined />
                Import History
              </Space>
            ),
            children: <ImportHistory />,
          },
        ]}
      />
    </div>
  );
}
