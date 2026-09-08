import { getCurrentUser } from "@/lib/supabase/user";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json(
      { error: "Login required.", code: "invalid" },
      { status: 401 }
    );
  }

  let body: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Invalid JSON body.", code: "invalid" },
      { status: 400 }
    );
  }

  const endpoint = body.endpoint;
  const p256dh = body.keys?.p256dh;
  const auth = body.keys?.auth;

  if (!endpoint || !p256dh || !auth) {
    return Response.json(
      { error: "Invalid subscription.", code: "invalid" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  const { error: deleteError } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint);
  if (deleteError) {
    return Response.json(
      { error: "Could not save subscription.", code: "db" },
      { status: 500 }
    );
  }
  const { error } = await supabase.from("push_subscriptions").insert({
    user_id: user.id,
    endpoint,
    p256dh,
    auth,
  });

  if (error) {
    return Response.json(
      { error: "Could not save subscription.", code: "db" },
      { status: 500 }
    );
  }

  return Response.json({ ok: true });
}
