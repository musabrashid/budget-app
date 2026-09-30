import { PrivatePage } from "@/components/private-page";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await searchParams;
  return <PrivatePage screen="trends" month={month} />;
}
