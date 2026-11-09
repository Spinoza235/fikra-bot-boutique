// lib/whatsapp.ts
// Toutes les fonctions qui ENVOIENT des messages au client via l'API WhatsApp de Meta.

const API = process.env.WHATSAPP_API_URL ?? "https://graph.facebook.com/v25.0";

// Fonction de base : envoie n'importe quel message à l'API de Meta
async function appelerApi(corps: Record<string, unknown>) {
  const res = await fetch(`${API}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messaging_product: "whatsapp", ...corps }),
  });
  if (!res.ok) {
    // L'erreur s'affiche dans les "Logs" de Vercel : très utile pour comprendre un problème
    console.error("Erreur WhatsApp", res.status, await res.text());
  }
}

// Coupe un texte trop long (WhatsApp refuse les titres trop longs)
const couper = (texte: string, max: number) =>
  texte.length <= max ? texte : texte.slice(0, max - 1) + "…";

// 1) Message texte simple
export function envoyerTexte(to: string, texte: string) {
  return appelerApi({ to, type: "text", text: { body: texte, preview_url: false } });
}

// 2) Message avec jusqu'à 3 boutons
export type Bouton = { id: string; titre: string };

export function envoyerBoutons(to: string, texte: string, boutons: Bouton[]) {
  return appelerApi({
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: couper(texte, 1024) },
      action: {
        buttons: boutons.slice(0, 3).map((b) => ({
          type: "reply",
          reply: { id: b.id, title: couper(b.titre, 20) },
        })),
      },
    },
  });
}

// 3) Message avec une liste déroulante (10 lignes maximum au total)
export type Ligne = { id: string; titre: string; description?: string };
export type Section = { titre: string; lignes: Ligne[] };

export function envoyerListe(
  to: string,
  options: { entete?: string; texte: string; bouton: string; sections: Section[] }
) {
  let reste = 10;
  const sections = options.sections
    .map((s) => {
      const lignes = s.lignes.slice(0, reste);
      reste -= lignes.length;
      return {
        title: couper(s.titre, 24),
        rows: lignes.map((l) => ({
          id: l.id,
          title: couper(l.titre, 24),
          ...(l.description ? { description: couper(l.description, 72) } : {}),
        })),
      };
    })
    .filter((s) => s.rows.length > 0);

  return appelerApi({
    to,
    type: "interactive",
    interactive: {
      type: "list",
      ...(options.entete ? { header: { type: "text", text: couper(options.entete, 60) } } : {}),
      body: { text: couper(options.texte, 1024) },
      action: { button: couper(options.bouton, 20), sections },
    },
  });
}

// 4) Affiche les deux coches bleues chez le client (message lu)
export function marquerCommeLu(messageId: string) {
  return appelerApi({ status: "read", message_id: messageId });
}
