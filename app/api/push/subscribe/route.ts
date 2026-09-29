import { getCurrentUser } from "@/lib/supabase/user";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const keySchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]+$/)
  .min(16)
  .max(120);

const subscriptionSchema = z
  .object({
    endpoint: z
      .string()
      .max(2048)
      .refine((value) => {
        try {
          return new URL(value).protocol === "https:";
        } catch {
          return false;
        }
      }),
    keys: z.object({
      p256dh: keySchema.min(60),
      auth: keySchema.max(32),
    }),
  })
  .strict();

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json(
      { error: "Login required.", code: "invalid" },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Invalid JSON body.", code: "invalid" },
      { status: 400 }
    );
  }

  const parsed = subscriptionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ code: "invalid" }, { status: 400 });
  }
  const { endpoint, keys } = parsed.data;

  const supabase = createAdminClient();
  const { data: existing, error: lookupError } = await supabase
    .from("push_subscriptions")
    .select("id, user_id")
    .eq("endpoint", endpoint)
    .maybeSingle();
  if (lookupError) {
    return Response.json(
      { error: "Could not save subscription.", code: "db" },
      { status: 500 }
    );
  }

  if (existing && existing.user_id !== user.id) {
    return Response.json(
      {
        error: "Subscription belongs to another account.",
        code: "conflict",
      },
      { status: 409 }
    );
  }

  const mutation = existing
    ? await supabase
        .from("push_subscriptions")
        .update({ p256dh: keys.p256dh, auth: keys.auth })
        .eq("id", existing.id)
    : await supabase.from("push_subscriptions").insert({
        user_id: user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      });

  if (mutation.error) {
    return Response.json(
      { error: "Could not save subscription.", code: "db" },
      { status: 500 }
    );
  }

  return Response.json({ ok: true });
}
