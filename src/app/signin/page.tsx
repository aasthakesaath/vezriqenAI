import type { Metadata } from "next";
import AuthPanel from "@/components/AuthPanel";

export const metadata: Metadata = { title: "Sign In", robots: { index: false } };

export default function SignInPage() {
  return <AuthPanel mode="signin" />;
}
