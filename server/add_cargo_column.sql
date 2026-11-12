-- Adiciona coluna 'cargo' na tabela users (opcional caso queira nativo no schema do Supabase)
-- Nota: O backend já sincroniza e persiste os cargos via system_settings automaticamente!

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS cargo TEXT;
COMMENT ON COLUMN public.users.cargo IS 'Cargo / função profissional do usuário (ex: Analista de Suporte, Supervisor de TI, etc.)';
