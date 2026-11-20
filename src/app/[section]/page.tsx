import { notFound } from "next/navigation";
import { Hub } from "@/components/hub";
export default async function Page({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (
    ![
      "food",
      "media",
      "shopping",
      "calendar",
      "settings",
      "notifications",
      "search",
    ].includes(section)
  )
    notFound();
  return <Hub section={section} />;
}
