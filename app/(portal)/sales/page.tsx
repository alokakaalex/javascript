import type { Metadata } from "next";
import { ReviewQueuePage } from "@/components/portal/ReviewPages";

export const metadata: Metadata = { title: "Review queue" };

export default function Page() {
  return <ReviewQueuePage stage="sales" />;
}
