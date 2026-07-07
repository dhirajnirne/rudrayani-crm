import { Card, Table, Tag, Typography, message } from "antd";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { api, errorMessage } from "../../api/client";
import type { DashboardFilters } from "./types";

interface MismatchRow {
  customer_id: string;
  loan_number: string;
  customer_name: string;
  lender_bucket: string;
  lender_canonical: number;
  due_date: string;
  dpd: number;
  computed_canonical: number;
}

/**
 * DPD cross-check (live, as-of-today -- not month-scoped): flags active
 * loans whose lender-supplied bucket disagrees with what the EMI due date
 * implies (standard 30-day increments). The lender's bucket stays
 * authoritative everywhere else in the system -- this is purely a "worth a
 * second look" list, never an override.
 */
export default function BucketMismatchCard({ filters }: { filters: DashboardFilters }) {
  const [rows, setRows] = useState<MismatchRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (filters.company_id) params.company_id = filters.company_id;
    api
      .get("/reports/bucket-mismatches", { params })
      .then((res) => setRows(res.data.rows))
      .catch((err) => message.error(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [filters.company_id]);

  return (
    <Card size="small" title="Bucket Mismatches (DPD Cross-Check)" style={{ height: "100%" }}>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 8, fontSize: 12 }}>
        Loans where the EMI due date implies a different bucket than the lender's own bucket column
        -- worth a second look. The lender's bucket stays authoritative everywhere else.
      </Typography.Paragraph>
      <Table<MismatchRow>
        rowKey="customer_id"
        size="small"
        loading={loading}
        pagination={rows.length > 10 ? { pageSize: 10 } : false}
        dataSource={rows}
        locale={{ emptyText: "No mismatches -- lender buckets agree with due-date-implied buckets" }}
        columns={[
          { title: "Loan No", dataIndex: "loan_number" },
          { title: "Customer", dataIndex: "customer_name", ellipsis: true },
          {
            title: "Lender Bucket",
            render: (_, r) => (
              <Tag color="orange">
                {r.lender_bucket} (canonical {r.lender_canonical})
              </Tag>
            ),
          },
          {
            title: "Due Date",
            dataIndex: "due_date",
            render: (v: string) => dayjs(v).format("DD MMM YYYY"),
          },
          { title: "DPD", dataIndex: "dpd", align: "right" },
          {
            title: "DPD-Implied",
            render: (_, r) => <Tag color="blue">canonical {r.computed_canonical}</Tag>,
          },
        ]}
      />
    </Card>
  );
}
