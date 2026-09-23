import type { Metadata } from "next";
import { ReviewPropertyPage } from "@/components/portal/ReviewPages";

export const metadata: Metadata = { title: "Review property" };

export default async function Page(props: PageProps<"/sales/properties/[id]">) {
  const { id } = await props.params;
  const { decided } = await props.searchParams;
  return <ReviewPropertyPage stage="sales" id={id} decided={Boolean(decided)} />;
}
