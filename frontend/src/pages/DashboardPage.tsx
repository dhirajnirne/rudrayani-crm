import { Card, Col, Row, Statistic, Typography } from "antd";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

export default function DashboardPage() {
  const { user, hasPermission } = useAuth();
  const [counts, setCounts] = useState({ branches: 0, teams: 0, companies: 0, employees: 0 });

  useEffect(() => {
    (async () => {
      const [branches, teams, companies] = await Promise.all([
        api.get("/branches"),
        api.get("/teams"),
        api.get("/companies"),
      ]);
      let employees = 0;
      if (hasPermission("employees.view")) {
        employees = (await api.get("/employees")).data.employees.length;
      }
      setCounts({
        branches: branches.data.branches.length,
        teams: teams.data.teams.length,
        companies: companies.data.companies.length,
        employees,
      });
    })().catch(() => {
      /* dashboard counts are best-effort */
    });
  }, [hasPermission]);

  return (
    <div>
      <Typography.Title level={3}>Welcome, {user?.full_name}</Typography.Title>
      <Row gutter={16}>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="Branches" value={counts.branches} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="Teams" value={counts.teams} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="Companies" value={counts.companies} />
          </Card>
        </Col>
        {hasPermission("employees.view") && (
          <Col xs={12} md={6}>
            <Card>
              <Statistic title="Employees" value={counts.employees} />
            </Card>
          </Col>
        )}
      </Row>
      <Typography.Paragraph type="secondary" style={{ marginTop: 24 }}>
        Collection dashboards (daily collection, team status) arrive with Phase 3–5.
      </Typography.Paragraph>
    </div>
  );
}
