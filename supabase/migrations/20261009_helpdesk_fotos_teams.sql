-- Fotos do Teams (Microsoft 365) — já aplicado no projeto.
-- Bucket público "fotos" (até 500 KB, jpeg/png) e tabela hd_fotos(email → url, hash).
-- hd_fotos_hashes / hd_fotos_salvar: usadas por /api/sincronizar-fotos (protegidas pelo segredo do Vault).
-- hd_fotos_disparar(): chama a função da Vercel (cron "hd-fotos-teams" todo dia 6h10 BRT e botão em Configurações → Equipe).
-- hd_fotos_status(): situação da última sincronização para a tela.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 512000, array['image/jpeg','image/png']) on conflict (id) do nothing;
create table if not exists public.hd_fotos (
  email text primary key, url text not null, hash text not null, atualizado_em timestamptz not null default now());
alter table public.hd_fotos enable row level security;
-- select cron.schedule('hd-fotos-teams', '10 9 * * *', 'select public.hd_fotos_disparar()');
