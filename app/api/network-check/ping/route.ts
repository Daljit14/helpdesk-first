export async function GET() {
  return Response.json(
    { ok: true, serverTime: Date.now() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
