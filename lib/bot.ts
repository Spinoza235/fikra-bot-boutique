// lib/bot.ts
// Le "cerveau" du bot : décide quoi répondre à chaque message reçu.

import { BOUTIQUE, CATEGORIES, prix, trouverCategorie, trouverProduit } from "./catalogue";
import { lireSession, sauverSession, type Session } from "./session";
import { envoyerBoutons, envoyerListe, envoyerTexte, marquerCommeLu } from "./whatsapp";

// Forme d'un message tel que Meta nous l'envoie
export type MessageRecu = {
  id: string;
  from: string; // numéro du client, ex. "23566000000"
  type: string; // "text", "interactive", "image", "audio"...
  text?: { body: string };
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string };
  };
};

export async function traiterMessage(msg: MessageRecu, nomClient?: string) {
  // JOUR 3 : mode perroquet (le bot répète ce qu'on lui écrit)
  if (process.env.BOT_MODE === "perroquet") {
    const texte = msg.text?.body ?? `(message de type ${msg.type})`;
    await envoyerTexte(msg.from, `🦜 Vous avez écrit : ${texte}`);
    return;
  }

  const session = await lireSession(msg.from);

  // Meta renvoie parfois le même message deux fois : on l'ignore
  if (session.dernierMessageId === msg.id) return;
  session.dernierMessageId = msg.id;

  await marquerCommeLu(msg.id);

  try {
    const choix = msg.interactive?.button_reply?.id ?? msg.interactive?.list_reply?.id;
    if (choix) {
      await surChoix(session, choix);
    } else if (msg.type === "text" && msg.text) {
      await surTexte(session, msg.text.body, nomClient);
    } else {
      await envoyerTexte(
        session.telephone,
        "Pour l'instant je comprends seulement les messages écrits et les menus 🙂\nÉcrivez *menu* pour commencer."
      );
    }
  } finally {
    await sauverSession(session); // on mémorise toujours, même en cas d'erreur
  }
}

// ---------- Quand le client ÉCRIT un message ----------

async function surTexte(session: Session, texte: string, nomClient?: string) {
  const mot = texte
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // enlève les accents

  // Le bot attend une quantité : le client peut écrire un nombre
  if (session.etape === "quantite") {
    const n = parseInt(mot, 10);
    if (n >= 1 && n <= 99) return ajouterAuPanier(session, n);
  }

  if (mot.includes("panier")) return afficherPanier(session);
  if (mot === "vider") return viderPanier(session);

  // Tout autre message : accueil + menu des catégories
  return envoyerAccueil(session, nomClient);
}

// ---------- Quand le client TOUCHE un bouton ou une ligne de liste ----------

async function surChoix(session: Session, choix: string) {
  const [action, valeur] = choix.split(":");

  switch (action) {
    case "cat":
      return envoyerProduits(session, valeur);
    case "prod":
      return demanderQuantite(session, valeur);
    case "qte":
      return ajouterAuPanier(session, parseInt(valeur, 10));
    case "menu":
      return envoyerCategories(session, "Choisissez une catégorie 👇");
    case "panier":
      return afficherPanier(session);
    case "vider":
      return viderPanier(session);
    case "commander":
      // La suite (nom, quartier, confirmation) sera faite en semaine 2
      return envoyerTexte(
        session.telephone,
        "👍 Merci ! La validation de la commande (nom, quartier, livraison) arrive bientôt.\nVotre panier est bien gardé."
      );
    default:
      return envoyerCategories(session, "Choisissez une catégorie 👇");
  }
}

// ---------- Les différentes réponses ----------

function totalPanier(session: Session) {
  return session.panier.reduce((total, ligne) => {
    const p = trouverProduit(ligne.produitId);
    return total + (p ? p.prix * ligne.quantite : 0);
  }, 0);
}

async function envoyerAccueil(session: Session, nomClient?: string) {
  const bonjour = nomClient ? `Bonjour ${nomClient} 👋` : "Bonjour 👋";
  await envoyerCategories(
    session,
    `${bonjour}\nBienvenue chez *${BOUTIQUE.nom}*.\nCommandez ici en quelques clics, on vous livre.`
  );
}

async function envoyerCategories(session: Session, texte: string) {
  session.etape = "menu";
  session.produitEnCours = null;

  const sections = [
    {
      titre: "Catégories",
      lignes: CATEGORIES.map((c) => ({ id: `cat:${c.id}`, titre: c.nom, description: c.description })),
    },
  ];
  if (session.panier.length > 0) {
    sections.push({
      titre: "Mon panier",
      lignes: [{ id: "panier", titre: "🛒 Voir mon panier", description: `Total : ${prix(totalPanier(session))}` }],
    });
  }

  await envoyerListe(session.telephone, { texte, bouton: "Voir le menu", sections });
}

async function envoyerProduits(session: Session, categorieId: string) {
  const categorie = trouverCategorie(categorieId);
  if (!categorie) return envoyerCategories(session, "Catégorie introuvable. Choisissez 👇");

  await envoyerListe(session.telephone, {
    entete: categorie.nom,
    texte: "Touchez *Voir les produits* puis choisissez un article.",
    bouton: "Voir les produits",
    sections: [
      {
        titre: "Produits",
        lignes: categorie.produits.slice(0, 9).map((p) => ({
          id: `prod:${p.id}`,
          titre: p.nom,
          description: p.description ? `${prix(p.prix)} · ${p.description}` : prix(p.prix),
        })),
      },
      { titre: "Navigation", lignes: [{ id: "menu", titre: "⬅️ Autres catégories" }] },
    ],
  });
}

async function demanderQuantite(session: Session, produitId: string) {
  const produit = trouverProduit(produitId);
  if (!produit) return envoyerCategories(session, "Produit introuvable. Choisissez 👇");

  session.etape = "quantite";
  session.produitEnCours = produit.id;

  await envoyerBoutons(
    session.telephone,
    `*${produit.nom}* : ${prix(produit.prix)} l'unité.\nCombien en voulez-vous ?\n(Touchez un bouton ou écrivez un nombre)`,
    [
      { id: "qte:1", titre: "1" },
      { id: "qte:2", titre: "2" },
      { id: "qte:3", titre: "3" },
    ]
  );
}

async function ajouterAuPanier(session: Session, quantite: number) {
  const produit = session.produitEnCours ? trouverProduit(session.produitEnCours) : undefined;
  if (!produit || !(quantite >= 1)) return envoyerCategories(session, "Choisissez d'abord un produit 👇");

  const ligne = session.panier.find((l) => l.produitId === produit.id);
  if (ligne) ligne.quantite += quantite;
  else session.panier.push({ produitId: produit.id, quantite });

  session.etape = "menu";
  session.produitEnCours = null;

  await envoyerBoutons(
    session.telephone,
    `✅ ${quantite} × ${produit.nom} ajouté au panier.\nTotal du panier : *${prix(totalPanier(session))}*`,
    [
      { id: "menu", titre: "➕ Autre produit" },
      { id: "panier", titre: "🛒 Voir le panier" },
      { id: "commander", titre: "✅ Commander" },
    ]
  );
}

async function afficherPanier(session: Session) {
  if (session.panier.length === 0) {
    return envoyerCategories(session, "🛒 Votre panier est vide.\nChoisissez une catégorie 👇");
  }

  const lignes = session.panier.map((l) => {
    const p = trouverProduit(l.produitId);
    return p ? `• ${l.quantite} × ${p.nom} = ${prix(p.prix * l.quantite)}` : "";
  });

  await envoyerBoutons(
    session.telephone,
    `🛒 *Votre panier*\n\n${lignes.join("\n")}\n\n*Total : ${prix(totalPanier(session))}*`,
    [
      { id: "menu", titre: "➕ Ajouter" },
      { id: "vider", titre: "🗑️ Vider" },
      { id: "commander", titre: "✅ Commander" },
    ]
  );
}

async function viderPanier(session: Session) {
  session.panier = [];
  await envoyerCategories(session, "🗑️ Panier vidé.\nChoisissez une catégorie 👇");
}
