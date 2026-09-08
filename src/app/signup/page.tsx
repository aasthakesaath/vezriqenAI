import type { Metadata } from "next";
import AuthPanel from "@/components/AuthPanel";

export const metadata: Metadata = { title: "Sign Up Free", robots: { index: false } };

export default function SignUpPage() {
  return <AuthPanel mode="signup" />;
}
