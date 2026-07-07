import { Card, Modal, Table, Typography, message } from "antd";
import { useEffect, useState } from "react";
import { api, errorMessage } from "../../api/client";
import { lakh, compactCount } from "./format";
import type { DashboardFilters } from "./types";

interface RecallRow {
  company_id: string;
  company_name: string;
  recalled_count: number;
  recalled_amount: number;
}

interface RecallReport {
  total_recalled_count: number;
  total_recalled_amount: number;
  lifetime_recalled_count: number;
  by_company: RecallRow[];
}

/** Cases the lender pulled back this month -- distinct from `closed`, so a healthy book doesn't read as churn. */
export default function RecalledStatTile({ filters }: { filters: DashboardFilters }) {
  const [data, setData] = useState<RecallReport | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const params: Record<string, string> = { month: filters.month };
    if (filters.company_id) params.company_id = filters.company_id;
    api
      .get("/reports/recalls", { params })
      .then((res) => setData(res.data))
      .catch((err) => message.error(errorMessage(err)));
  }, [filters.month, filters.company_id]);

  return (
    <>
      <Card
        size="small"
        hoverable
        onClick={() => setOpen(true)}
        style={{ background: "#f7f8f7", border: "none", cursor: "pointer" }}
      >
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          Recalled This Month
        </Typography.Text>
        <div className="money" style={{ fontSize: 20, fontWeight: 700 }}>
          {compactCount(data?.total_recalled_count ?? 0)}
        </div>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {data ? lakh(data.total_recalled_amount) : "—"} · lifetime book:{" "}
          {compactCount(data?.lifetime_recalled_count ?? 0)}
        </Typography.Text>
      </Card>
      <Modal title="Recalled Cases This Month" open={open} onCancel={() => setOpen(false)} footer={null}>
        <Table<RecallRow>
          rowKey="company_id"
          size="small"
          pagination={false}
          dataSource={data?.by_company ?? []}
          locale={{ emptyText: "No recalls this month" }}
          columns={[
            { title: "Company", dataIndex: "company_name" },
            { title: "Count", dataIndex: "recalled_count", align: "right" },
            {
              title: "Amount",
              dataIndex: "recalled_amount",
              align: "right",
              render: (v: number) => lakh(v),
            },
          ]}
        />
      </Modal>
    </>
  );
}
