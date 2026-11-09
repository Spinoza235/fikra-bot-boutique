-- supabase/tables.sql
-- À copier dans Supabase > SQL Editor > New query, puis cliquer sur "Run".

create table if not exists sessions (
  telephone          text primary key,          -- numéro WhatsApp du client
  etape              text not null default 'menu',
  produit_en_cours   text,
  panier             jsonb not null default '[]'::jsonb,
  dernier_message_id text,
  mis_a_jour_le      timestamptz not null default now()
);

-- Sécurité : personne ne peut lire la table depuis Internet.
-- Seul votre bot (avec la clé secrète "service_role") y a accès.
alter table sessions enable row level security;
