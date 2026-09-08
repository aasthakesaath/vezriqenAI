import type { Metadata } from "next";
import PlanIntake from "@/components/onboarding/PlanIntake";
import { ONBOARDING_HEADING } from "@/lib/app-copy";

export const metadata: Metadata = { title: ONBOARDING_HEADING, robots: { index: false } };

export default function StartPage() {
  return <PlanIntake />;
}
