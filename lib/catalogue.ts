// lib/catalogue.ts
// Le catalogue de la boutique. Pour changer les produits ou les prix, modifiez seulement ce fichier.
// Règles WhatsApp : nom d'un produit = 24 caractères max, 9 produits max par catégorie.

export const BOUTIQUE = {
  nom: process.env.SHOP_NAME ?? "Boutique Al-Amal",
};

export type Produit = { id: string; nom: string; prix: number; description?: string };
export type Categorie = { id: string; nom: string; description?: string; produits: Produit[] };

export const CATEGORIES: Categorie[] = [
  {
    id: "alimentation",
    nom: "Alimentation",
    description: "Riz, huile, sucre, pâtes…",
    produits: [
      { id: "riz5", nom: "Riz parfumé 5 kg", prix: 4500 },
      { id: "huile1", nom: "Huile végétale 1 L", prix: 1500 },
      { id: "sucre1", nom: "Sucre en poudre 1 kg", prix: 900 },
      { id: "pates", nom: "Spaghetti 500 g", prix: 500 },
      { id: "lait", nom: "Lait en poudre 400 g", prix: 2500 },
    ],
  },
  {
    id: "boissons",
    nom: "Boissons",
    description: "Eau, sodas, jus",
    produits: [
      { id: "eau15", nom: "Eau minérale 1,5 L", prix: 500 },
      { id: "soda", nom: "Soda 33 cl", prix: 500 },
      { id: "jus1", nom: "Jus de fruits 1 L", prix: 1200 },
    ],
  },
  {
    id: "hygiene",
    nom: "Hygiène",
    description: "Savon, dentifrice, lessive",
    produits: [
      { id: "savon", nom: "Savon de toilette", prix: 300 },
      { id: "dentifrice", nom: "Dentifrice 75 ml", prix: 800 },
      { id: "lessive", nom: "Lessive en poudre 1 kg", prix: 1500 },
    ],
  },
];

export function trouverCategorie(id: string) {
  return CATEGORIES.find((c) => c.id === id);
}

export function trouverProduit(id: string) {
  for (const c of CATEGORIES) {
    const p = c.produits.find((p) => p.id === id);
    if (p) return p;
  }
  return undefined;
}

// 4500 -> "4 500 FCFA"
export function prix(montant: number) {
  return montant.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA";
}