// Page d'accueil : sert seulement à vérifier que le projet est bien en ligne
export default function Page() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", textAlign: "center", padding: 24 }}>
      <div>
        <h1 style={{ color: "#A78BFA" }}>✅ Fikra Bot Boutique est en ligne</h1>
        <p>L&apos;adresse du webhook est : /api/webhook</p>
      </div>
    </main>
  );
}
