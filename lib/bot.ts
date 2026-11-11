// lib/bot.ts
// Le "cerveau" du bot : décide quoi répondre à chaque message reçu.
//
// Parcours du client :
//   Bonjour -> catégories -> produits -> quantité -> panier
//   -> Commander -> nom -> quartier -> récapitulatif -> Confirmer
//   -> le client reçoit son numéro de commande, le propriétaire reçoit la commande

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
  // Mode test : le bot répète ce qu'on lui écrit (variable BOT_MODE=perroquet)
  if (process.env.BOT_MODE === "perroquet") {
    const texte = msg.text?.body ?? `(message de type ${msg.type})`;
    await envoyerTexte(msg.from, `Vous avez écrit : ${texte}`);
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
        "Je comprends uniquement les messages écrits et les menus.\nÉcrivez *menu* pour commencer."
      );
    }
  } finally {
    await sauverSession(session); // on mémorise toujours, même en cas d'erreur
  }
}

// ---------- Quand le client ÉCRIT un message ----------

async function surTexte(session: Session, texte: string, nomClient?: string) {
  const brut = texte.trim();
  const mot = brut
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // enlève les accents

  // Mots-clés valables à tout moment
  if (mot === "annuler") return annulerCommande(session);
  if (mot === "menu") return envoyerCategories(session, "Choisissez une catégorie.");

  switch (session.etape) {
    case "quantite": {
      const n = parseInt(mot, 10);
      if (n >= 1 && n <= 99) return ajouterAuPanier(session, n);
      break;
    }
    case "nom":
      return enregistrerNom(session, brut);
    case "adresse":
      return enregistrerAdresse(session, brut);
    case "confirmation":
      return envoyerRecapitulatif(session, "Merci de confirmer ou de modifier votre commande.");
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
      return envoyerCategories(session, "Choisissez une catégorie.");
    case "panier":
      return afficherPanier(session);
    case "vider":
      return viderPanier(session);
    case "commander":
      return demanderNom(session);
    case "confirmer":
      return confirmerCommande(session);
    case "modifier":
      return afficherPanier(session);
    case "annuler":
      return annulerCommande(session);
    default:
      return envoyerCategories(session, "Choisissez une catégorie.");
  }
}

// ---------- Outils ----------

function totalPanier(session: Session) {
  return session.panier.reduce((total, ligne) => {
    const p = trouverProduit(ligne.produitId);
    return total + (p ? p.prix * ligne.quantite : 0);
  }, 0);
}

function lignesPanier(session: Session) {
  return session.panier
    .map((l) => {
      const p = trouverProduit(l.produitId);
      return p ? `• ${l.quantite} × ${p.nom} : ${prix(p.prix * l.quantite)}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

// Numéro de commande court et lisible, ex. "CMD-4F7K2Q"
function numeroCommande() {
  return "CMD-" + Date.now().toString(36).toUpperCase().slice(-6);
}

// "23566925838" -> "+235 66 92 58 38" (affichage seulement)
function telephoneLisible(numero: string) {
  return "+" + numero.replace(/^(\d{3})(\d{2})(\d{2})(\d{2})(\d{2})$/, "$1 $2 $3 $4 $5");
}

// ---------- Menus et panier ----------

async function envoyerAccueil(session: Session, nomClient?: string) {
  const bonjour = nomClient ? `Bonjour ${nomClient},` : "Bonjour,";
  await envoyerCategories(
    session,
    `${bonjour}\nBienvenue chez *${BOUTIQUE.nom}*.\nCommandez en quelques clics, nous vous livrons.`
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
      lignes: [{ id: "panier", titre: "Voir mon panier", description: `Total : ${prix(totalPanier(session))}` }],
    });
  }

  await envoyerListe(session.telephone, { texte, bouton: "Voir le menu", sections });
}

async function envoyerProduits(session: Session, categorieId: string) {
  const categorie = trouverCategorie(categorieId);
  if (!categorie) return envoyerCategories(session, "Catégorie introuvable. Choisissez une catégorie.");

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
      { titre: "Navigation", lignes: [{ id: "menu", titre: "Autres catégories" }] },
    ],
  });
}

async function demanderQuantite(session: Session, produitId: string) {
  const produit = trouverProduit(produitId);
  if (!produit) return envoyerCategories(session, "Produit introuvable. Choisissez une catégorie.");

  session.etape = "quantite";
  session.produitEnCours = produit.id;

  await envoyerBoutons(
    session.telephone,
    `*${produit.nom}* : ${prix(produit.prix)} l'unité.\nQuelle quantité souhaitez-vous ?\nTouchez un bouton ou écrivez un nombre.`,
    [
      { id: "qte:1", titre: "1" },
      { id: "qte:2", titre: "2" },
      { id: "qte:3", titre: "3" },
    ]
  );
}

async function ajouterAuPanier(session: Session, quantite: number) {
  const produit = session.produitEnCours ? trouverProduit(session.produitEnCours) : undefined;
  if (!produit || !(quantite >= 1)) return envoyerCategories(session, "Choisissez d'abord un produit.");

  const ligne = session.panier.find((l) => l.produitId === produit.id);
  if (ligne) ligne.quantite += quantite;
  else session.panier.push({ produitId: produit.id, quantite });

  session.etape = "menu";
  session.produitEnCours = null;

  await envoyerBoutons(
    session.telephone,
    `Ajouté au panier : ${quantite} × ${produit.nom}.\nTotal du panier : *${prix(totalPanier(session))}*`,
    [
      { id: "menu", titre: "Autre produit" },
      { id: "panier", titre: "Voir le panier" },
      { id: "commander", titre: "Commander" },
    ]
  );
}

async function afficherPanier(session: Session) {
  session.etape = "menu";
  if (session.panier.length === 0) {
    return envoyerCategories(session, "Votre panier est vide.\nChoisissez une catégorie.");
  }

  await envoyerBoutons(
    session.telephone,
    `*Votre panier*\n\n${lignesPanier(session)}\n\n*Total : ${prix(totalPanier(session))}*`,
    [
      { id: "menu", titre: "Ajouter un produit" },
      { id: "vider", titre: "Vider le panier" },
      { id: "commander", titre: "Commander" },
    ]
  );
}

async function viderPanier(session: Session) {
  session.panier = [];
  await envoyerCategories(session, "Votre panier a été vidé.\nChoisissez une catégorie.");
}

// ---------- Validation de la commande ----------

// Étape 1 : le nom
async function demanderNom(session: Session) {
  if (session.panier.length === 0) {
    return envoyerCategories(session, "Votre panier est vide.\nChoisissez d'abord un produit.");
  }
  session.etape = "nom";
  await envoyerTexte(
    session.telephone,
    "Pour finaliser votre commande, quel est votre *nom complet* ?\n\n(Écrivez *annuler* pour revenir au menu.)"
  );
}

async function enregistrerNom(session: Session, nom: string) {
  if (nom.length < 2 || nom.length > 60) {
    return envoyerTexte(session.telephone, "Merci d'indiquer un nom valide (2 à 60 caractères).");
  }
  session.nom = nom;
  session.etape = "adresse";
  await envoyerTexte(
    session.telephone,
    `Merci, ${nom}\nIndiquez votre *quartier* et un *point de repère* pour la livraison.\n\nExemple : Moursal, près de la pharmacie du marché.`
  );
}

// Étape 2 : le quartier
async function enregistrerAdresse(session: Session, adresse: string) {
  if (adresse.length < 3 || adresse.length > 150) {
    return envoyerTexte(session.telephone, "Merci d'indiquer votre quartier et un point de repère.");
  }
  session.adresse = adresse;
  await envoyerRecapitulatif(session);
}

// Étape 3 : le récapitulatif
async function envoyerRecapitulatif(session: Session, intro = "Vérifiez votre commande avant de la confirmer.") {
  session.etape = "confirmation";
  await envoyerBoutons(
    session.telephone,
    `*Récapitulatif de votre commande*\n\n${lignesPanier(session)}\n\n*Total : ${prix(totalPanier(session))}*\n\nNom : ${session.nom}\nLivraison : ${session.adresse}\n\n${intro}`,
    [
      { id: "confirmer", titre: "Confirmer" },
      { id: "modifier", titre: "Modifier" },
      { id: "annuler", titre: "Annuler" },
    ]
  );
}

// Étape 4 : confirmation -> message au client + message au propriétaire
async function confirmerCommande(session: Session) {
  if (session.panier.length === 0 || !session.nom || !session.adresse) {
    return envoyerCategories(session, "Aucune commande en cours.\nChoisissez une catégorie.");
  }

  const numero = numeroCommande();
  const total = prix(totalPanier(session));
  const detail = lignesPanier(session);

  // Message au client
  await envoyerTexte(
    session.telephone,
    `*Commande confirmée*\n\nNuméro : *${numero}*\nTotal : *${total}*\n\nMerci pour votre confiance, ${session.nom}\n${BOUTIQUE.nom} vous contactera sur ce numéro pour organiser la livraison.`
  );

  // Message au propriétaire de la boutique
  const proprietaire = process.env.OWNER_PHONE;
  if (proprietaire) {
    await envoyerTexte(
      proprietaire,
      `*Nouvelle commande ${numero}*\n\nClient : ${session.nom}\nTéléphone : ${telephoneLisible(session.telephone)}\nLivraison : ${session.adresse}\n\n${detail}\n\n*Total : ${total}*\n\nContacter le client : https://wa.me/${session.telephone}`
    );
  } else {
    console.error("OWNER_PHONE manquant : le propriétaire n'a pas reçu la commande", numero);
  }

  // On repart à zéro (le nom est gardé pour la prochaine commande)
  session.panier = [];
  session.adresse = null;
  session.etape = "menu";
  session.produitEnCours = null;
}

async function annulerCommande(session: Session) {
  session.etape = "menu";
  session.produitEnCours = null;
  await envoyerCategories(session, "Commande annulée. Votre panier est conservé.\nChoisissez une catégorie.");
}