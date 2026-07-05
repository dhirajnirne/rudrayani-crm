import { Alert, Button, Card, Form, Input, Steps, Typography, message } from "antd";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, errorMessage } from "../api/client";

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [phone, setPhone] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const requestOtp = async (values: { phone: string }) => {
    setSubmitting(true);
    try {
      const res = await api.post("/auth/otp/request", { phone: values.phone });
      setPhone(values.phone);
      setDevOtp(res.data.devOtp ?? null);
      setStep(1);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const resetPassword = async (values: { otp: string; new_password: string }) => {
    setSubmitting(true);
    try {
      await api.post("/auth/otp/verify", {
        phone,
        otp: values.otp,
        new_password: values.new_password,
      });
      message.success("Password reset. Log in with your new password.");
      navigate("/login");
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f0f2f5" }}
    >
      <Card style={{ width: 420 }}>
        <Typography.Title level={4}>Reset password</Typography.Title>
        <Steps
          size="small"
          current={step}
          items={[{ title: "Request OTP" }, { title: "Set new password" }]}
          style={{ marginBottom: 24 }}
        />
        {step === 0 && (
          <Form layout="vertical" onFinish={requestOtp} requiredMark={false}>
            <Form.Item
              name="phone"
              label="Registered phone number"
              rules={[{ required: true, pattern: /^\d{8,15}$/, message: "Enter your phone number" }]}
            >
              <Input placeholder="9999999999" maxLength={15} />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={submitting}>
              Send OTP
            </Button>
          </Form>
        )}
        {step === 1 && (
          <>
            {devOtp && (
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
                message={`Development mode: your OTP is ${devOtp}`}
              />
            )}
            <Form layout="vertical" onFinish={resetPassword} requiredMark={false}>
              <Form.Item
                name="otp"
                label="OTP (sent by SMS)"
                rules={[{ required: true, len: 6, message: "Enter the 6-digit OTP" }]}
              >
                <Input maxLength={6} />
              </Form.Item>
              <Form.Item
                name="new_password"
                label="New password"
                rules={[{ required: true, min: 8, message: "At least 8 characters" }]}
              >
                <Input.Password />
              </Form.Item>
              <Button type="primary" htmlType="submit" block loading={submitting}>
                Reset password
              </Button>
            </Form>
          </>
        )}
        <div style={{ textAlign: "center", marginTop: 12 }}>
          <Link to="/login">Back to login</Link>
        </div>
      </Card>
    </div>
  );
}
