import { Card, Table, Tag, message } from "antd";
import { useEffect, useState } from "react";
import { api, errorMessage } from "../../api/client";
import type { DashboardFilters } from "./types";

interface MovementRow {
  bucket: string;
  payment_detected: number;
  allocation_confirmed: number;
  detected_not_confirmed: number;
}

/**
 * In-house payment signal vs. the lender's next-file confirmation, per
 * bucket. "Detected not confirmed" is the owner-level watch item -- cases
 * the team believes are normalized that the lender hasn't agreed with yet.
 */
export default function BucketMovementCard({ filters }: { filters: DashboardFilters }) {
  const [rows, setRows] = useState<MovementRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const params: Record<string, string> = { month: filters.month };
    if (filters.company_id) params.company_id = filters.company_id;
    api
      .get("/reports/bucket-movements", { params })
      .then((res) => setRows(res.data.rows))
      .catch((err) => message.error(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [filters.month, filters.company_id]);

  return (
    <Card size="small" title="Bucket Movements This Month" style={{ height: "100%" }}>
      <Table<MovementRow>
        rowKey="bucket"
        size="small"
        loading={loading}
        pagination={false}
        dataSource={rows}
        locale={{ emptyText: "No movement activity yet" }}
        columns={[
          { title: "Bucket", dataIndex: "bucket", render: (v: string) => <Tag>{v}</Tag> },
          { title: "Payment-Detected", dataIndex: "payment_detected", align: "right" },
          { title: "Allocation-Confirmed", dataIndex: "allocation_confirmed", align: "right" },
          {
            title: "Not Yet Confirmed",
            dataIndex: "detected_not_confirmed",
            align: "right",
            render: (v: number) => (v > 0 ? <Tag color="orange">{v}</Tag> : v),
          },
        ]}
      />
    </Card>
  );
}
