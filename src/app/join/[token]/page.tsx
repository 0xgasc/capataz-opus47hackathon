import { redirect, notFound } from "next/navigation";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const rows = await sql<Array<{ slug: string; vertical: string }>>`
    select slug, vertical from businesses where magic_token = ${token}::uuid
  `;

  if (!rows[0]) notFound();

  const { slug, vertical } = rows[0];

  // Delegation spaces → worker view; everything else → owner dashboard
  if (vertical === "delegacion") {
    redirect(`/delegate/${token}`);
  }

  redirect(`/dashboard/${slug}`);
}
