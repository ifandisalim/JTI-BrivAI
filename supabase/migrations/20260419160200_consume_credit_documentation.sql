-- JTI-139: document consume_credit threat model (MVP integration tests grant EXECUTE to authenticated per spec §3.4).
-- Enforcement is server-side balance + ledger; authenticated callers can still invoke the RPC from a modified client,
-- so real billing gates should move to Edge Functions with service role when summarization ships.

comment on function public.consume_credit(text, integer) is
  'Deduct credits with row lock (FOR UPDATE), insufficient_credits when balance < cost, idempotent ledger (user_id, idempotency_key). '
  'MVP: EXECUTE granted to authenticated for integration tests; threat model is honest-client + RLS — not APK tamper resistance. '
  'Prefer service-role Edge Functions for strict enforcement.';
