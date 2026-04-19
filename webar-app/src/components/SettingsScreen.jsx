const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const GOLD = "#C9A84C";

export default function SettingsScreen({ onBack }) {
  return (
    <div style={styles.screen}>
      <div style={styles.header}>
        <button onClick={onBack} style={styles.backBtn}>Back</button>
        <h2 style={styles.title}>Settings</h2>
      </div>
      <div style={styles.content}>
        <div style={styles.card}>
          <p style={styles.placeholder}>Settings options coming soon.</p>
        </div>
      </div>
    </div>
  );
}

const styles = {
  screen: {
    position: "fixed", inset: 0,
    background: "linear-gradient(160deg, #061A1F 0%, #0A2229 50%, #061820 100%)",
    display: "flex", flexDirection: "column", fontFamily: FONT,
  },
  header: { display: "flex", alignItems: "center", gap: 12, padding: "48px 20px 16px" },
  backBtn: {
    background: "transparent", border: "none", color: "rgba(255,255,255,0.6)",
    fontSize: 14, fontFamily: FONT, cursor: "pointer",
  },
  title: { fontSize: 22, fontWeight: 700, color: "#fff", margin: 0 },
  content: { flex: 1, padding: "0 20px", overflowY: "auto" },
  card: {
    background: "rgba(255,255,255,0.04)", borderRadius: 16,
    padding: "20px 18px", marginTop: 8,
  },
  placeholder: { fontSize: 14, color: "rgba(255,255,255,0.4)", fontFamily: FONT, margin: 0 },
};
