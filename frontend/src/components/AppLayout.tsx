import { Layout, Menu, Typography, Space, Tag, Button } from "antd";
import {
  ApartmentOutlined,
  AuditOutlined,
  BankOutlined,
  DashboardOutlined,
  EnvironmentOutlined,
  FilterOutlined,
  FileSearchOutlined,
  LogoutOutlined,
  ShopOutlined,
  TeamOutlined,
  UnorderedListOutlined,
  UploadOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { CAPABILITY_LABELS } from "../types";
import AlertsBell from "./AlertsBell";

const { Sider, Header, Content } = Layout;

export default function AppLayout() {
  const { user, hasPermission, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Menu assembled from active capabilities/permissions (brief §3).
  const items = [
    { key: "/", icon: <DashboardOutlined />, label: <Link to="/">Dashboard</Link> },
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
    hasPermission("customers.view") && {
      key: "/customers",
      icon: <UnorderedListOutlined />,
      label: <Link to="/customers">Customers</Link>,
    },
    hasPermission("customers.allocate") && {
      key: "/allocation",
      icon: <FileSearchOutlined />,
      label: <Link to="/allocation">Allocation</Link>,
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
            background: "white",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingInline: 24,
          }}
        >
          <Typography.Text strong>{user?.full_name}</Typography.Text>
          <Space>
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
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
