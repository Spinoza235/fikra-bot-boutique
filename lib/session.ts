// lib/session.ts
// La "mémoire" du bot : où en est chaque client, son panier, son nom et son adresse.
// - Si Supabase est configuré : tout est enregistré dans la base de données.
// - Sinon : mémoire temporaire, qui peut s'effacer quand Vercel met le bot en veille.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type LignePanier = { produitId: string; quantite: number };

// Les étapes de la conversation
// menu -> quantite -> (panier) -> nom -> adresse -> confirmation -> menu
export type Etape = "menu" | "quantite" | "nom" | "adresse" | "confirmation";
const ETAPES: Etape[] = ["menu", "quantite", "nom", "adresse", "confirmation"];

export type Session = {
  telephone: string;
  etape: Etape;
  produitEnCours: string | null;
  panier: LignePanier[];
  nom: string | null;
  adresse: string | null;
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
  return {
    telephone,
    etape: "menu",
    produitEnCours: null,
    panier: [],
    nom: null,
    adresse: null,
    dernierMessageId: null,
  };
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
    etape: ETAPES.includes(data.etape) ? data.etape : "menu",
    produitEnCours: data.produit_en_cours,
    panier: Array.isArray(data.panier) ? data.panier : [],
    nom: data.nom ?? null,
    adresse: data.adresse ?? null,
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
    nom: s.nom,
    adresse: s.adresse,
    dernier_message_id: s.dernierMessageId,
    mis_a_jour_le: new Date().toISOString(),
  });
  if (error) console.error("Erreur Supabase (écriture)", error.message);
}