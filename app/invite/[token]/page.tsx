import { redirect } from "next/navigation";
import { AcceptInvitation } from "@/components/invite/accept-invitation";
import { getCurrentUser } from "@/lib/supabase/user";

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  return (
    <section className="flex flex-1 items-center justify-center px-4 py-16">
      <AcceptInvitation token={token} />
    </section>
  );
}
