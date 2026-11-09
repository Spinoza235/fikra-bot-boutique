export const metadata = { title: "Fikra Bot Boutique" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#0F0F1A", color: "#fff" }}>
        {children}
      </body>
    </html>
  );
}
