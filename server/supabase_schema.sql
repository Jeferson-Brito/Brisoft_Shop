-- ==========================================================================
-- BRISOFT SHOP - SUPABASE POSTGRESQL DATABASE SCHEMA
-- Execute este script no SQL Editor do seu projeto Supabase
-- ==========================================================================

-- 1. Habilitar extensões úteis
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Tabela de Departamentos
CREATE TABLE IF NOT EXISTS departments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    color VARCHAR(20) DEFAULT '#2563eb',
    description TEXT,
    sort_order INT,
    allow_device_message_mutations BOOLEAN NOT NULL DEFAULT FALSE,
    sla_target_minutes INT DEFAULT 15,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Inserir departamentos padrão
INSERT INTO departments (name, color, sla_target_minutes) VALUES
    ('Comercial', '#7c3aed', 15),
    ('Financeiro', '#2563eb', 10),
    ('Operacional', '#059669', 30),
    ('Suporte Técnico', '#ea580c', 20),
    ('Recursos Humanos', '#dc2626', 60)
ON CONFLICT (name) DO NOTHING;

-- 3. Tabela de Clientes (Empresas)
CREATE TABLE IF NOT EXISTS clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    cnpj VARCHAR(30),
    phone VARCHAR(30),
    email VARCHAR(150),
    segment VARCHAR(50) DEFAULT 'Corporativo',
    status VARCHAR(20) DEFAULT 'Ativo',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Tabela de Contatos (Pessoas vinculadas aos clientes)
CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    phone VARCHAR(30) NOT NULL,
    email VARCHAR(150),
    role VARCHAR(100),
    channel VARCHAR(30) DEFAULT 'WhatsApp',
    avatar_color VARCHAR(20) DEFAULT '#6366f1',
    status VARCHAR(20) DEFAULT 'Ativo',
    is_employee BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_employee BOOLEAN NOT NULL DEFAULT false;

-- 5. Tabela de Usuários / Atendentes
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(150) UNIQUE,
    role VARCHAR(50) DEFAULT 'Analista',
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    avatar_url TEXT,
    phone VARCHAR(30),
    password_hash TEXT,
    is_active BOOLEAN DEFAULT true,
    is_temporary BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'online',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Adicionar colunas se já existir a tabela (para bancos já criados)
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_temporary BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30);
ALTER TABLE users ADD COLUMN IF NOT EXISTS credentials_changed_at TIMESTAMP WITH TIME ZONE;

CREATE TABLE IF NOT EXISTS supervisor_departments (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (user_id, department_id)
);

CREATE INDEX IF NOT EXISTS supervisor_departments_department_idx
    ON supervisor_departments(department_id, user_id);


-- 6. Tabela de Atendimentos / Chamados (Tickets)
CREATE TABLE IF NOT EXISTS tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    protocol VARCHAR(50) UNIQUE,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- Atendente responsável
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    status VARCHAR(30) DEFAULT 'aguardando', -- 'aguardando', 'em_atendimento', 'em_espera', 'finalizado'
    priority VARCHAR(20) DEFAULT 'normal', -- 'baixa', 'normal', 'alta', 'urgente'
    subject VARCHAR(255),
    preview_message TEXT,
    preview TEXT,
    client_name VARCHAR(255),
    initials VARCHAR(10),
    phone VARCHAR(30),
    jid TEXT,
    raw_jid TEXT,
    time VARCHAR(20),
    assumed BOOLEAN DEFAULT false,
    agent_name VARCHAR(255),
    encerrado_em VARCHAR(20),
    encerrado_por VARCHAR(255),
    channel VARCHAR(30) DEFAULT 'whatsapp',
    handled_via VARCHAR(30) DEFAULT 'pending',
    direct_whatsapp_messages INT DEFAULT 0,
    platform_messages INT DEFAULT 0,
    is_employee BOOLEAN NOT NULL DEFAULT false,
    is_group BOOLEAN NOT NULL DEFAULT false,
    group_jid TEXT,
    avatar_url TEXT,
    queued_at TIMESTAMP WITH TIME ZONE,
    
    -- Métricas de SLA
    started_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    first_response_at TIMESTAMP WITH TIME ZONE,
    finished_at TIMESTAMP WITH TIME ZONE,
    sla_minutes_target INT DEFAULT 15,
    sla_met BOOLEAN DEFAULT true,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE departments ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS sort_order INT;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS allow_device_message_mutations BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS avatar_url TEXT;

CREATE TABLE IF NOT EXISTS ticket_collaborators (
    ticket_id TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    added_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (ticket_id, user_id)
);
CREATE INDEX IF NOT EXISTS ticket_collaborators_user_idx ON ticket_collaborators(user_id, created_at DESC);

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS queued_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.set_ticket_queued_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'aguardando' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.queued_at := COALESCE(NEW.queued_at, now());
    ELSIF OLD.status IS DISTINCT FROM 'aguardando' THEN
      NEW.queued_at := now();
    ELSIF NEW.queued_at IS NULL THEN
      NEW.queued_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tickets_set_queued_at ON public.tickets;
CREATE TRIGGER tickets_set_queued_at
BEFORE INSERT OR UPDATE OF status ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.set_ticket_queued_at();

-- 7. Tabela de Mensagens da Conversa
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE NOT NULL,
    sender_type VARCHAR(20),
    sender_name VARCHAR(255),
    message_context VARCHAR(30),
    sender VARCHAR(20) NOT NULL, -- 'client', 'agent', 'system'
    type VARCHAR(30),
    time VARCHAR(20),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    text TEXT,
    media_url TEXT,
    media_type VARCHAR(50),
    read BOOLEAN DEFAULT false,
    remote_message_id VARCHAR(100), -- ID do WhatsApp
    whatsapp_account_id TEXT,
    file_name TEXT,
    participant_jid TEXT,
    reply_to_message_id TEXT,
    reply_to_remote_message_id TEXT,
    reply_preview TEXT,
    reply_sender TEXT,
    edited_at TIMESTAMP WITH TIME ZONE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS tickets_whatsapp_group_idx
    ON tickets(channel, group_jid)
    WHERE is_group = true AND group_jid IS NOT NULL;

-- 8. Tabela de Notas Internas de Contato
CREATE TABLE IF NOT EXISTS contact_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 9. Tabela de Avaliações de Satisfação (CSAT / NPS)
CREATE TABLE IF NOT EXISTS ratings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE NOT NULL,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    score INT NOT NULL CHECK (score >= 1 AND score <= 5),
    agent_name VARCHAR(255),
    phone VARCHAR(30),
    jid TEXT,
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Histórico consolidado de desempenho mensal
CREATE TABLE IF NOT EXISTS performance_monthly_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    month_start DATE NOT NULL,
    scope_type VARCHAR(20) NOT NULL CHECK (scope_type IN ('company', 'department', 'agent')),
    scope_id TEXT NOT NULL,
    scope_name TEXT,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (month_start, scope_type, scope_id)
);

-- 10. Tabela de Mensagens Rápidas
CREATE TABLE IF NOT EXISTS quick_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(150) NOT NULL,
    category VARCHAR(50) DEFAULT 'Geral',
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    uses_count INT DEFAULT 0,
    is_favorite BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL DEFAULT 'null'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Inserir mensagens rápidas padrão
INSERT INTO quick_messages (title, category, content, is_favorite, is_active) VALUES
    ('Saudação inicial', 'Saudação', 'Olá! 👋 Bem-vindo à Brisoft Shop! Como podemos te ajudar hoje?', true, true),
    ('Solicitação de dados', 'Documentação', 'Para prosseguirmos com seu atendimento, por favor confirme: 1. Nome completo 2. CPF/CNPJ 3. Número de contrato.', true, true),
    ('Encerramento com satisfação', 'Encerramento', 'Agradecemos o contato! Ficamos felizes em atendê-lo. Por favor, avalie nosso atendimento. Tenha um ótimo dia!', true, true);

-- Habilitar Realtime para as tabelas principais
ALTER PUBLICATION supabase_realtime ADD TABLE tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE ratings;

-- ============================================================================
-- Atualizações Recentes (Rodar estas caso já tenha o banco criado)
-- ============================================================================
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS awaiting_rating BOOLEAN DEFAULT false;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS assumed_at TIMESTAMPTZ;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS queued_at TIMESTAMPTZ;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS unread_count INT DEFAULT 0;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS preview TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS client_name VARCHAR(255);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS initials VARCHAR(10);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS phone VARCHAR(30);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS jid TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS raw_jid TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS time VARCHAR(20);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS assumed BOOLEAN DEFAULT false;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS agent_name VARCHAR(255);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS encerrado_em VARCHAR(20);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS encerrado_por VARCHAR(255);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS is_employee BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender VARCHAR(20);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_type VARCHAR(20);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_name VARCHAR(255);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_context VARCHAR(30);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS type VARCHAR(30);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS time VARCHAR(20);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS remote_message_id TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS whatsapp_account_id TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS agent_name VARCHAR(255);
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS phone VARCHAR(30);
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS jid TEXT;

CREATE INDEX IF NOT EXISTS tickets_department_status_idx ON tickets(department_id, status);
CREATE INDEX IF NOT EXISTS tickets_channel_phone_status_idx ON tickets(channel, phone, status, created_at DESC);
CREATE INDEX IF NOT EXISTS tickets_channel_jid_status_idx ON tickets(channel, jid, status, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_user_id_idx ON messages(user_id);
CREATE INDEX IF NOT EXISTS messages_ticket_created_idx ON messages(ticket_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS messages_whatsapp_remote_unique_idx
  ON messages(whatsapp_account_id, remote_message_id)
  WHERE whatsapp_account_id IS NOT NULL AND remote_message_id IS NOT NULL;

-- A aplicação acessa estas tabelas somente pelo backend com service role.
-- Bloqueia acesso direto pelas chaves públicas/anon do Supabase.
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE quick_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE supervisor_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_monthly_snapshots ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('chat-media', 'chat-media', false, 26214400)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('whatsapp-sessions', 'whatsapp-sessions', false, 52428800)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit;
