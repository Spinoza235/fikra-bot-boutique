// lib/session.ts
// La "mémoire" du bot : où en est chaque client et ce qu'il a dans son panier.
// - Si Supabase est configuré (jours 6-7) : tout est enregistré dans la base de données.
// - Sinon (jours 4-5) : mémoire temporaire, qui peut s'effacer à tout moment sur Vercel.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type LignePanier = { produitId: string; quantite: number };

export type Session = {
  telephone: string;
  etape: "menu" | "quantite";
  produitEnCours: string | null;
  panier: LignePanier[];
  dernierMessageId: string | null;
};

let client: SupabaseClient | null = null;

function supabase() {
  const url = process.env.SUPABASE_URL;
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !cle) return null;
  if (!client) client = createClient(url, cle, { auth: { persistSession: false } });
  return client;
}

const memoireTemporaire = new Map<string, Session>();

function nouvelleSession(telephone: string): Session {
  return { telephone, etape: "menu", produitEnCours: null, panier: [], dernierMessageId: null };
}

export async function lireSession(telephone: string): Promise<Session> {
  const db = supabase();
  if (!db) return memoireTemporaire.get(telephone) ?? nouvelleSession(telephone);

  const { data, error } = await db
    .from("sessions")
    .select("*")
    .eq("telephone", telephone)
    .maybeSingle();

  if (error) console.error("Erreur Supabase (lecture)", error.message);
  if (!data) return nouvelleSession(telephone);

  return {
    telephone,
    etape: data.etape === "quantite" ? "quantite" : "menu",
    produitEnCours: data.produit_en_cours,
    panier: Array.isArray(data.panier) ? data.panier : [],
    dernierMessageId: data.dernier_message_id,
  };
}

export async function sauverSession(s: Session) {
  const db = supabase();
  if (!db) {
    memoireTemporaire.set(s.telephone, s);
    return;
  }

  const { error } = await db.from("sessions").upsert({
    telephone: s.telephone,
    etape: s.etape,
    produit_en_cours: s.produitEnCours,
    panier: s.panier,
    dernier_message_id: s.dernierMessageId,
    mis_a_jour_le: new Date().toISOString(),
  });
  if (error) console.error("Erreur Supabase (écriture)", error.message);
}
