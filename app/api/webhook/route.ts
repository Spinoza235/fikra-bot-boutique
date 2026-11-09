// app/api/webhook/route.ts
// L'adresse que Meta appelle à chaque nouveau message : https://VOTRE-PROJET.vercel.app/api/webhook

import crypto from "crypto";
import { traiterMessage, type MessageRecu } from "@/lib/bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 1) VÉRIFICATION : Meta appelle cette adresse une fois pour vérifier qu'elle est à vous
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  if (p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Interdit", { status: 403 });
}

// 2) MESSAGES : Meta envoie ici chaque message reçu par votre numéro
export async function POST(req: Request) {
  const corpsBrut = await req.text();

  // Sécurité : vérifie que la requête vient vraiment de Meta (si WHATSAPP_APP_SECRET est rempli)
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (secret) {
    const signature = req.headers.get("x-hub-signature-256") ?? "";
    const attendu = "sha256=" + crypto.createHmac("sha256", secret).update(corpsBrut).digest("hex");
    const ok =
      signature.length === attendu.length &&
      crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(attendu));
    if (!ok) return new Response("Signature invalide", { status: 401 });
  }

  let corps: any;
  try {
    corps = JSON.parse(corpsBrut);
  } catch {
    return new Response("JSON invalide", { status: 400 });
  }

  for (const entree of corps?.entry ?? []) {
    for (const changement of entree?.changes ?? []) {
      const valeur = changement?.value;
      const nomClient: string | undefined = valeur?.contacts?.[0]?.profile?.name;
      const messages: MessageRecu[] = valeur?.messages ?? []; // vide pour les accusés de lecture
      for (const msg of messages) {
        try {
          await traiterMessage(msg, nomClient);
        } catch (e) {
          console.error("Erreur en traitant le message", e);
        }
      }
    }
  }

  // Toujours répondre 200 à Meta, sinon il renvoie le message plusieurs fois
  return Response.json({ ok: true });
}
