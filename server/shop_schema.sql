-- Brisoft Shop: executar SOMENTE no projeto Supabase NOVO, após supabase_schema.sql.
-- Não modifica tabelas ou registros do Desk. Operações do catálogo são atômicas.
BEGIN;
CREATE TABLE IF NOT EXISTS public.shop_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(120) NOT NULL CHECK (length(trim(name)) >= 2),
  slug varchar(60) NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) >= 3),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.shop_memberships (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.shop_companies(id)
);
CREATE TABLE IF NOT EXISTS public.shop_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.shop_companies(id),
  sku varchar(80) NOT NULL CHECK (length(trim(sku)) > 0),
  name varchar(180) NOT NULL CHECK (length(trim(name)) >= 2),
  category varchar(80) NOT NULL DEFAULT '',
  unit varchar(12) NOT NULL DEFAULT 'UN' CHECK (length(trim(unit)) > 0),
  barcode varchar(60),
  price_cents integer NOT NULL CHECK (price_cents BETWEEN 0 AND 100000000),
  availability text NOT NULL CHECK (availability IN ('AVAILABLE','OUT_OF_STOCK','DISCONTINUED')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,sku)
);
CREATE INDEX IF NOT EXISTS shop_products_company_name ON public.shop_products(company_id,name,id);
CREATE TABLE IF NOT EXISTS public.shop_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.shop_companies(id),
  actor text NOT NULL,
  action text NOT NULL,
  before jsonb,
  after jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS shop_audit_company_date ON public.shop_audit(company_id,created_at DESC);
-- No browser access policies: only the server's service_role may access these
-- tables. Server JWT auth + membership checks are required on every request.
ALTER TABLE public.shop_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shop_companies, public.shop_memberships, public.shop_products, public.shop_audit FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.shop_create_company(p_user_id uuid,p_name text,p_slug text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE c public.shop_companies; actor_name text;
BEGIN
  -- Serialize two setup requests from the same authenticated administrator.
  SELECT coalesce(email,name,id::text) INTO actor_name FROM public.users WHERE id=p_user_id AND is_active IS NOT FALSE FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SHOP_MEMBERSHIP'; END IF;
  IF EXISTS(SELECT 1 FROM public.shop_memberships WHERE user_id=p_user_id) THEN RAISE EXCEPTION 'SHOP_ALREADY_LINKED'; END IF;
  INSERT INTO public.shop_companies(name,slug) VALUES(trim(p_name),p_slug) RETURNING * INTO c;
  INSERT INTO public.shop_memberships(user_id,company_id) VALUES(p_user_id,c.id);
  INSERT INTO public.shop_audit(company_id,actor,action,after) VALUES(c.id,actor_name,'COMPANY_CREATED',to_jsonb(c));
  RETURN jsonb_build_object('id',c.id,'name',c.name,'slug',c.slug);
END $$;

CREATE OR REPLACE FUNCTION public.shop_save_product(p_user_id uuid,p_product_id uuid,p_value jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE tenant uuid; previous public.shop_products; saved public.shop_products; actor_name text;
BEGIN
  SELECT m.company_id,coalesce(u.email,u.name,u.id::text) INTO tenant,actor_name
    FROM public.shop_memberships m JOIN public.users u ON u.id=m.user_id
    WHERE m.user_id=p_user_id AND u.is_active IS NOT FALSE;
  IF tenant IS NULL THEN RAISE EXCEPTION 'SHOP_MEMBERSHIP'; END IF;
  IF p_product_id IS NOT NULL THEN
    SELECT * INTO previous FROM public.shop_products WHERE id=p_product_id AND company_id=tenant FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'SHOP_NOT_FOUND'; END IF;
    IF previous.version<>(p_value->>'version')::integer THEN RAISE EXCEPTION 'SHOP_CONFLICT'; END IF;
    UPDATE public.shop_products SET name=p_value->>'name',sku=p_value->>'sku',category=p_value->>'category',
      unit=p_value->>'unit',barcode=p_value->>'barcode',price_cents=(p_value->>'price_cents')::integer,
      availability=p_value->>'availability',version=version+1,updated_at=clock_timestamp()
      WHERE id=p_product_id AND company_id=tenant RETURNING * INTO saved;
  ELSE
    INSERT INTO public.shop_products(company_id,name,sku,category,unit,barcode,price_cents,availability)
      VALUES(tenant,p_value->>'name',p_value->>'sku',p_value->>'category',p_value->>'unit',p_value->>'barcode',(p_value->>'price_cents')::integer,p_value->>'availability') RETURNING * INTO saved;
  END IF;
  INSERT INTO public.shop_audit(company_id,actor,action,before,after)
    VALUES(tenant,actor_name,CASE WHEN p_product_id IS NULL THEN 'PRODUCT_CREATED' ELSE 'PRODUCT_UPDATED' END,
      CASE WHEN p_product_id IS NULL THEN NULL ELSE to_jsonb(previous) END,to_jsonb(saved));
  RETURN to_jsonb(saved);
END $$;
REVOKE ALL ON FUNCTION public.shop_create_company(uuid,text,text), public.shop_save_product(uuid,uuid,jsonb) FROM PUBLIC;
-- Supabase roles exist in Supabase; conditional block also permits local SQL QA.
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON public.shop_companies,public.shop_memberships,public.shop_products,public.shop_audit FROM anon;
    REVOKE ALL ON FUNCTION public.shop_create_company(uuid,text,text),public.shop_save_product(uuid,uuid,jsonb) FROM anon;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON public.shop_companies,public.shop_memberships,public.shop_products,public.shop_audit FROM authenticated;
    REVOKE ALL ON FUNCTION public.shop_create_company(uuid,text,text),public.shop_save_product(uuid,uuid,jsonb) FROM authenticated;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    GRANT SELECT,INSERT,UPDATE ON public.shop_companies,public.shop_memberships,public.shop_products TO service_role;
    GRANT SELECT,INSERT ON public.shop_audit TO service_role;
    GRANT EXECUTE ON FUNCTION public.shop_create_company(uuid,text,text),public.shop_save_product(uuid,uuid,jsonb) TO service_role;
  END IF;
END $$;
COMMIT;
