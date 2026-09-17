-- Allow one active credential per credential type on a commerce connection.
--
-- The legacy active_connection index permits only one active credential total,
-- which prevents a provider connection from holding both its API credential and
-- a webhook signing secret.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.commerce_provider_credentials
    WHERE revoked_at IS NULL
    GROUP BY connection_id, credential_type
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot migrate commerce_provider_credentials: duplicate active connection/credential_type rows exist.';
  END IF;
END
$$;

DROP INDEX IF EXISTS public.commerce_provider_credentials_active_connection_uidx;

CREATE UNIQUE INDEX commerce_provider_credentials_active_type_uidx
  ON public.commerce_provider_credentials (connection_id, credential_type)
  WHERE revoked_at IS NULL;
