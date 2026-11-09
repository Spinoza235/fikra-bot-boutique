# Fikra Bot Boutique

Bot WhatsApp de commande pour une boutique (Next.js + API WhatsApp Cloud + Supabase).
Fikra Tech, N'Djamena.

## Lancer sur votre PC

```bash
npm install
npm run dev
```

Ouvrez http://localhost:3000. La page doit afficher « ✅ Fikra Bot Boutique est en ligne ».

## Variables d'environnement

Copiez `.env.example` dans un nouveau fichier `.env.local`, puis remplissez les valeurs.
Mettez exactement les mêmes valeurs dans **Vercel > Settings > Environment Variables**.

| Variable | Où la trouver |
|---|---|
| `WHATSAPP_TOKEN` | Meta > votre app > Étape 1. Faites un essai > Générer un jeton d'accès |
| `WHATSAPP_PHONE_NUMBER_ID` | Même page (identifiant du numéro de test) |
| `WHATSAPP_VERIFY_TOKEN` | Un mot de passe que vous inventez (le même que dans Meta > Webhook) |
| `WHATSAPP_APP_SECRET` | Optionnel : Paramètres de l'app > Général > Clé secrète |
| `SHOP_NAME` | Nom de la boutique affiché par le bot |
| `BOT_MODE` | `perroquet` le jour 3 seulement, ensuite à supprimer |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Supabase > Project Settings > API (jours 6-7) |

⚠️ Ne mettez jamais `.env.local` sur GitHub. Il est déjà exclu par `.gitignore`.

## Structure

- `app/api/webhook/route.ts` : l'adresse que WhatsApp appelle (`/api/webhook`)
- `lib/bot.ts` : le cerveau, qui décide quoi répondre
- `lib/whatsapp.ts` : envoie les textes, les boutons et les listes
- `lib/catalogue.ts` : **les produits et les prix (à modifier)**
- `lib/session.ts` : la mémoire du panier (Supabase, sinon mémoire temporaire)
- `supabase/tables.sql` : la table à créer dans Supabase

## Mettre à jour en ligne

```bash
git add .
git commit -m "message"
git push
```

Vercel remet le bot en ligne automatiquement.
Après avoir changé une variable dans Vercel, faites **Deployments > ⋯ > Redeploy**.
