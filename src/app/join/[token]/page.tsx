import { redirect, notFound } from "next/navigation";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const rows = await sql<Array<{ slug: string }>>`
    select slug from businesses where magic_token = ${token}::uuid
  `;

  if (!rows[0]) notFound();

  redirect(`/dashboard/${rows[0].slug}`);
}
