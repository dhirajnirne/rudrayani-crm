import { Layout, Menu, Spin, Typography, Space, Tag, Button, Tooltip } from "antd";
import { Suspense } from "react";
import {
  ApartmentOutlined,
  AuditOutlined,
  BankOutlined,
  CalendarOutlined,
  DashboardOutlined,
  AimOutlined,
  EnvironmentOutlined,
  FilterOutlined,
  WalletOutlined,
  FileSearchOutlined,
  FileSyncOutlined,
  FlagOutlined,
  LogoutOutlined,
  MoonOutlined,
  ScheduleOutlined,
  ShopOutlined,
  SunOutlined,
  TeamOutlined,
  UnorderedListOutlined,
  UploadOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useThemeMode } from "../theme/ThemeModeProvider";
import { CAPABILITY_LABELS } from "../types";
import AlertsBell from "./AlertsBell";

const { Sider, Header, Content } = Layout;

export default function AppLayout() {
  const { user, hasPermission, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { mode, toggle } = useThemeMode();

  // Menu assembled from active capabilities/permissions (brief §3).
  // A caller with calls.log but not customers.allocate is a plain
  // telecaller/field_agent -- TL/ops/admin hold both, so this is the
  // precise "individual contributor, not a manager" test used throughout.
  const isIndividualContributor = hasPermission("calls.log") && !hasPermission("customers.allocate");
  const items = [
    {
      key: "/",
      icon: <DashboardOutlined />,
      label: <Link to="/">{hasPermission("reports.view") ? "Dashboard" : "My Performance"}</Link>,
    },
    isIndividualContributor && {
      key: "/my-worklist",
      icon: <UnorderedListOutlined />,
      label: <Link to="/my-worklist">My Worklist</Link>,
    },
    hasPermission("employees.view") && {
      key: "/employees",
      icon: <UserOutlined />,
      label: <Link to="/employees">Employees</Link>,
    },
    hasPermission("branches.manage") && {
      key: "/branches",
      icon: <BankOutlined />,
      label: <Link to="/branches">Branches</Link>,
    },
    hasPermission("teams.manage") && {
      key: "/teams",
      icon: <ApartmentOutlined />,
      label: <Link to="/teams">Teams</Link>,
    },
    hasPermission("companies.manage") && {
      key: "/companies",
      icon: <ShopOutlined />,
      label: <Link to="/companies">Companies</Link>,
    },
    hasPermission("companies.manage") && {
      key: "/buckets",
      icon: <FilterOutlined />,
      label: <Link to="/buckets">Buckets</Link>,
    },
    hasPermission("imports.manage") && {
      key: "/import",
      icon: <UploadOutlined />,
      label: <Link to="/import">Import</Link>,
    },
    hasPermission("imports.review") && {
      key: "/import-reviews",
      icon: <FileSyncOutlined />,
      label: <Link to="/import-reviews">Import Review</Link>,
    },
    // Hidden for a plain telecaller/field_agent: after the GET /customers
    // scoping fix, it's a strict, less-useful subset of My Worklist above
    // (no last-call/PTP context) -- two nav items pointing at overlapping
    // data. The route itself stays reachable directly, it's just not linked.
    hasPermission("customers.view") && !isIndividualContributor && {
      key: "/customers",
      icon: <UnorderedListOutlined />,
      label: <Link to="/customers">Customers</Link>,
    },
    hasPermission("customers.allocate") && {
      key: "/allocation",
      icon: <FileSearchOutlined />,
      label: <Link to="/allocation">Allocation</Link>,
    },
    hasPermission("customers.allocate") && {
      key: "/reallocation-requests",
      icon: <FileSyncOutlined />,
      label: <Link to="/reallocation-requests">Reallocation Requests</Link>,
    },
    hasPermission("customers.allocate") && {
      key: "/correction-requests",
      icon: <FlagOutlined />,
      label: <Link to="/correction-requests">Correction Requests</Link>,
    },
    hasPermission("dispositions.manage") && {
      key: "/dispositions",
      icon: <AuditOutlined />,
      label: <Link to="/dispositions">Dispositions</Link>,
    },
    hasPermission("tracking.view") && {
      key: "/tracking",
      icon: <EnvironmentOutlined />,
      label: <Link to="/tracking">Tracking</Link>,
    },
    hasPermission("tracking.view") && {
      key: "/day-plan",
      icon: <CalendarOutlined />,
      label: <Link to="/day-plan">Day Plan</Link>,
    },
    hasPermission("tracking.view") && {
      key: "/attendance",
      icon: <ScheduleOutlined />,
      label: <Link to="/attendance">Attendance</Link>,
    },
    hasPermission("targets.manage") && {
      key: "/targets",
      icon: <AimOutlined />,
      label: <Link to="/targets">Targets</Link>,
    },
    hasPermission("payments.deposit") && {
      key: "/deposits",
      icon: <WalletOutlined />,
      label: <Link to="/deposits">Deposits</Link>,
    },
  ].filter(Boolean) as { key: string }[];

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider breakpoint="lg" collapsedWidth={0}>
        <div style={{ color: "white", padding: 16, fontWeight: 700, fontSize: 16 }}>
          <TeamOutlined /> Rudrayani CRM
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={items as never}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingInline: 24,
          }}
        >
          <Typography.Text strong>{user?.full_name}</Typography.Text>
          <Space>
            <Tooltip title={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
              <Button
                type="text"
                shape="circle"
                icon={mode === "dark" ? <SunOutlined /> : <MoonOutlined />}
                onClick={toggle}
              />
            </Tooltip>
            <AlertsBell />
            {user?.capabilities.map((c) => (
              <Tag color="blue" key={c}>
                {CAPABILITY_LABELS[c]}
              </Tag>
            ))}
            <Button
              icon={<LogoutOutlined />}
              onClick={async () => {
                await logout();
                navigate("/login");
              }}
            >
              Logout
            </Button>
          </Space>
        </Header>
        <Content style={{ margin: 24 }}>
          <Suspense
            fallback={
              <div style={{ display: "grid", placeItems: "center", height: 320 }}>
                <Spin size="large" />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </Content>
      </Layout>
    </Layout>
  );
}
