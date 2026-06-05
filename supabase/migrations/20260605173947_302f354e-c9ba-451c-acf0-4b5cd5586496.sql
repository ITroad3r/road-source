
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'sales', 'sourcing');
CREATE TYPE public.engagement_type AS ENUM ('freelance', 'permanent');
CREATE TYPE public.demand_status AS ENUM ('open', 'sourcing', 'submitted', 'interview', 'offer', 'placed', 'closed', 'lost');
CREATE TYPE public.candidate_stage AS ENUM ('identified', 'contacted', 'screened', 'submitted', 'client_interview', 'offer', 'placed', 'rejected', 'withdrawn');
CREATE TYPE public.seniority_level AS ENUM ('junior', 'mid', 'senior', 'lead', 'principal');
CREATE TYPE public.availability_status AS ENUM ('available', 'available_soon', 'unavailable');

-- ============ UPDATED_AT TRIGGER ============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  seniority public.seniority_level DEFAULT 'mid',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles viewable by signed-in" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id UUID, _roles public.app_role[])
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = ANY(_roles))
$$;

-- ============ AUTO PROFILE + DEFAULT ROLE ON SIGNUP ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'sourcing');
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ CLIENTS ============
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  industry TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clients viewable by signed-in" ON public.clients FOR SELECT TO authenticated USING (true);
CREATE POLICY "Sales/managers manage clients" ON public.clients FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager','sales']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager','sales']::public.app_role[]));
CREATE TRIGGER trg_clients_updated BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ DEMANDS ============
CREATE TABLE public.demands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  engagement public.engagement_type NOT NULL DEFAULT 'freelance',
  required_skills TEXT[] DEFAULT '{}',
  location TEXT,
  budget_min NUMERIC,
  budget_max NUMERIC,
  status public.demand_status NOT NULL DEFAULT 'open',
  assigned_to UUID REFERENCES auth.users(id),
  start_date DATE,
  priority INT DEFAULT 3,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.demands TO authenticated;
GRANT ALL ON public.demands TO service_role;
ALTER TABLE public.demands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Demands: assignees + privileged view" ON public.demands FOR SELECT TO authenticated USING (
  assigned_to = auth.uid()
  OR public.has_any_role(auth.uid(), ARRAY['admin','manager','sales']::public.app_role[])
);
CREATE POLICY "Demands: sales/managers create" ON public.demands FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager','sales']::public.app_role[]));
CREATE POLICY "Demands: assignees + privileged update" ON public.demands FOR UPDATE TO authenticated
  USING (assigned_to = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin','manager','sales']::public.app_role[]))
  WITH CHECK (assigned_to = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin','manager','sales']::public.app_role[]));
CREATE POLICY "Demands: managers delete" ON public.demands FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]));
CREATE TRIGGER trg_demands_updated BEFORE UPDATE ON public.demands FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_demands_assigned ON public.demands(assigned_to);
CREATE INDEX idx_demands_status ON public.demands(status);

-- ============ TALENT HUB CVS ============
CREATE TABLE public.talent_hub_cvs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  headline TEXT,
  summary TEXT,
  skills TEXT[] DEFAULT '{}',
  years_experience INT,
  seniority public.seniority_level,
  location TEXT,
  remote_ok BOOLEAN DEFAULT true,
  availability public.availability_status DEFAULT 'available',
  engagement_preference public.engagement_type,
  daily_rate NUMERIC,
  salary_expectation NUMERIC,
  cv_url TEXT,
  linkedin_url TEXT,
  tags TEXT[] DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.talent_hub_cvs TO authenticated;
GRANT ALL ON public.talent_hub_cvs TO service_role;
ALTER TABLE public.talent_hub_cvs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Talent Hub: signed-in search" ON public.talent_hub_cvs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Talent Hub: sourcing+ insert" ON public.talent_hub_cvs FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager','sourcing']::public.app_role[]));
CREATE POLICY "Talent Hub: sourcing+ update" ON public.talent_hub_cvs FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager','sourcing']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager','sourcing']::public.app_role[]));
CREATE POLICY "Talent Hub: managers delete" ON public.talent_hub_cvs FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]));
CREATE TRIGGER trg_cvs_updated BEFORE UPDATE ON public.talent_hub_cvs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_cvs_skills ON public.talent_hub_cvs USING GIN(skills);
CREATE INDEX idx_cvs_tags ON public.talent_hub_cvs USING GIN(tags);
CREATE INDEX idx_cvs_name ON public.talent_hub_cvs(full_name);

-- ============ DEMAND CANDIDATES (pipeline) ============
CREATE TABLE public.demand_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demand_id UUID NOT NULL REFERENCES public.demands(id) ON DELETE CASCADE,
  cv_id UUID NOT NULL REFERENCES public.talent_hub_cvs(id) ON DELETE CASCADE,
  stage public.candidate_stage NOT NULL DEFAULT 'identified',
  notes TEXT,
  submitted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (demand_id, cv_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.demand_candidates TO authenticated;
GRANT ALL ON public.demand_candidates TO service_role;
ALTER TABLE public.demand_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Pipeline view" ON public.demand_candidates FOR SELECT TO authenticated USING (
  public.has_any_role(auth.uid(), ARRAY['admin','manager','sales']::public.app_role[])
  OR EXISTS (SELECT 1 FROM public.demands d WHERE d.id = demand_id AND d.assigned_to = auth.uid())
);
CREATE POLICY "Pipeline insert" ON public.demand_candidates FOR INSERT TO authenticated WITH CHECK (
  public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[])
  OR EXISTS (SELECT 1 FROM public.demands d WHERE d.id = demand_id AND d.assigned_to = auth.uid())
);
CREATE POLICY "Pipeline update" ON public.demand_candidates FOR UPDATE TO authenticated USING (
  public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[])
  OR EXISTS (SELECT 1 FROM public.demands d WHERE d.id = demand_id AND d.assigned_to = auth.uid())
) WITH CHECK (
  public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[])
  OR EXISTS (SELECT 1 FROM public.demands d WHERE d.id = demand_id AND d.assigned_to = auth.uid())
);
CREATE POLICY "Pipeline delete" ON public.demand_candidates FOR DELETE TO authenticated USING (
  public.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[])
);
CREATE TRIGGER trg_pipeline_updated BEFORE UPDATE ON public.demand_candidates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ CANDIDATE FINANCIALS ============
CREATE TABLE public.candidate_financials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demand_candidate_id UUID NOT NULL UNIQUE REFERENCES public.demand_candidates(id) ON DELETE CASCADE,
  client_rate NUMERIC,
  candidate_rate NUMERIC,
  margin NUMERIC,
  currency TEXT DEFAULT 'EUR',
  placement_date DATE,
  contract_duration_months INT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_financials TO authenticated;
GRANT ALL ON public.candidate_financials TO service_role;
ALTER TABLE public.candidate_financials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Financials: privileged only" ON public.candidate_financials FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager','sales']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager','sales']::public.app_role[]));
CREATE TRIGGER trg_fin_updated BEFORE UPDATE ON public.candidate_financials FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
