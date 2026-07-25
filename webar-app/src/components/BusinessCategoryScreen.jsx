import { useState, useCallback } from "react";
import { useTheme } from "../context/ThemeContext.jsx";
import { BUSINESS_CATEGORY_GROUPS } from "../config/businessCategories.js";

const FONT = "Outfit, -apple-system, BlinkMacSystemFont, sans-serif";
const TEAL = "#00C9A7";

export default function BusinessCategoryScreen({ onContinue, onBack }) {
  const { colors } = useTheme();
  const [selected, setSelected] = useState(null); // { type:'preset', label } | { type:'custom' }
  const [customText, setCustomText] = useState('');
  const [openGroup, setOpenGroup] = useState(null); // only one group's items shown at a time

  const toggleGroup = useCallback((groupName) => {
    setOpenGroup((prev) => (prev === groupName ? null : groupName));
  }, []);

  const pick = useCallback((label) => {
    setSelected({ type: 'preset', label });
  }, []);

  const pickOther = useCallback(() => {
    setSelected({ type: 'custom' });
  }, []);

  const canContinue = selected && (selected.type === 'preset' || (selected.type === 'custom' && customText.trim()));

  const handleContinue = useCallback(() => {
    if (!canContinue) return;
    onContinue(selected.type === 'custom' ? customText.trim() : selected.label);
  }, [canContinue, selected, customText, onContinue]);

  return (
    <div style={{ ...s.screen, background: colors.bg }}>
      <style>{`
        .bc-tile { transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease; }
        .bc-tile:active { transform: scale(0.96); }
      `}</style>

      {onBack && <button onClick={onBack} style={{ ...s.backBtn, color: colors.textMuted }}>← Back</button>}

      <div style={s.scroll}>
        <div style={s.top}>
          <h1 style={{ ...s.title, color: colors.text }}>What best describes{"\n"}your business?</h1>
        </div>

        {BUSINESS_CATEGORY_GROUPS.map((g) => {
          const isOpen = openGroup === g.group;
          const selectedInGroup = selected?.type === 'preset' && g.items.some((it) => it.label === selected.label);
          return (
            <div key={g.group} style={s.groupBlock}>
              <button
                onClick={() => toggleGroup(g.group)}
                style={{ ...s.groupHeader, borderColor: isOpen || selectedInGroup ? TEAL : colors.border, background: colors.surface }}
              >
                <span style={s.groupHeaderLeft}>
                  <span style={s.groupIconWrap}><GroupIcon icon={g.icon} /></span>
                  <span style={{ ...s.groupLabel, color: TEAL }}>
                    {g.group.toUpperCase()}
                    {selectedInGroup && !isOpen && <span style={{ color: colors.textMuted, fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}> — {selected.label}</span>}
                  </span>
                </span>
                <span style={{ ...s.chevron, color: colors.textMuted, transform: isOpen ? 'rotate(180deg)' : 'none' }}>▾</span>
              </button>
              {isOpen && (
                <div style={s.grid}>
                  {g.items.map((item) => {
                    const isSelected = selected?.type === 'preset' && selected.label === item.label;
                    return (
                      <button
                        key={item.label}
                        className="bc-tile"
                        onClick={() => pick(item.label)}
                        style={{
                          ...s.tile,
                          background: isSelected ? `${TEAL}22` : colors.surface,
                          borderColor: isSelected ? TEAL : colors.border,
                        }}
                      >
                        <span style={s.tileIcon}><ItemIcon icon={item.icon} /></span>
                        <span style={{ ...s.tileLabel, color: colors.text }}>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        <div style={s.groupBlock}>
          <button
            onClick={() => toggleGroup('OTHER')}
            style={{ ...s.groupHeader, borderColor: openGroup === 'OTHER' || selected?.type === 'custom' ? TEAL : colors.border, background: colors.surface }}
          >
            <span style={s.groupHeaderLeft}>
              <span style={s.groupIconWrap}><OtherIcon /></span>
              <span style={{ ...s.groupLabel, color: TEAL }}>OTHER</span>
            </span>
            <span style={{ ...s.chevron, color: colors.textMuted, transform: openGroup === 'OTHER' ? 'rotate(180deg)' : 'none' }}>▾</span>
          </button>
          {openGroup === 'OTHER' && (
            <>
              <div style={s.grid}>
                <button
                  className="bc-tile"
                  onClick={pickOther}
                  style={{
                    ...s.tile,
                    background: selected?.type === 'custom' ? `${TEAL}22` : colors.surface,
                    borderColor: selected?.type === 'custom' ? TEAL : colors.border,
                  }}
                >
                  <span style={s.tileIcon}><OtherIcon /></span>
                  <span style={{ ...s.tileLabel, color: colors.text }}>Other</span>
                </button>
              </div>
              {selected?.type === 'custom' && (
                <>
                  <p style={{ ...s.customLabel, color: colors.textMuted }}>Business Type *</p>
                  <input
                    autoFocus
                    style={{ ...s.customInput, color: colors.text, background: colors.surface, borderColor: colors.border }}
                    type="text"
                    placeholder="Describe your business"
                    value={customText}
                    onChange={(e) => setCustomText(e.target.value)}
                  />
                  {!customText.trim() && <p style={s.customError}>⚠ Please describe your business to continue.</p>}
                </>
              )}
            </>
          )}
        </div>

        <div style={{ height: 100 }} />
      </div>

      <div style={s.bottom}>
        <button
          onClick={handleContinue}
          disabled={!canContinue}
          style={{ ...s.continueBtn, opacity: canContinue ? 1 : 0.5, cursor: canContinue ? 'pointer' : 'not-allowed' }}
        >
          CONTINUE
        </button>
      </div>
    </div>
  );
}

function GroupIcon({ icon }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: TEAL, strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (icon) {
    case 'retail':
      return <svg {...common}><path d="M3 9l1.5-5h15L21 9" /><path d="M4 9v10h16V9" /><path d="M9.5 19v-5.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V19" /></svg>;
    case 'health':
      return <svg {...common}><path d="M20.8 8.6a4.9 4.9 0 0 0-8.8-3 4.9 4.9 0 0 0-8.8 3c0 5.4 8.8 10.4 8.8 10.4s8.8-5 8.8-10.4Z" /></svg>;
    case 'services':
      return <svg {...common}><path d="M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 1 5.4-5.4L21 6l-3-3-3.3 3.3Z" /></svg>;
    case 'food':
      return <svg {...common}><path d="M7 3v6a2 2 0 0 0 4 0V3M9 9v12M17 3c-1.5 1.5-2 3-2 5s.5 3.5 2 5v9" /></svg>;
    case 'professional':
      return <svg {...common}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>;
    case 'tech':
      return <svg {...common}><rect x="3" y="4" width="18" height="12" rx="1.5" /><path d="M8 20h8M12 16v4" /></svg>;
    case 'education':
      return <svg {...common}><path d="M2 8l10-4 10 4-10 4-10-4Z" /><path d="M6 10v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5" /></svg>;
    case 'entertainment':
      return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 9h18M8 5v4M16 5v4M8 15v4M16 15v4" /></svg>;
    case 'manufacturing':
      return <svg {...common}><path d="M3 20V10l5 3.5V10l5 3.5V10l5 3.5V20H3Z" /></svg>;
    default:
      return <OtherIcon />;
  }
}

function ItemIcon({ icon }) {
  const common = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: TEAL, strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (icon) {
    // Retail & E-commerce
    case 'clothing':
      return <svg {...common}><path d="M8 4 L4 7 L6 10 L8 8.5 V20 H16 V8.5 L18 10 L20 7 L16 4 A4 4 0 0 1 8 4 Z" /></svg>;
    case 'jewellery':
      return <svg {...common}><path d="M6 3h12l3 5-9 13L3 8Z" /><path d="M3 8h18M9 3l3 5 3-5M12 8l-3 5 3 8 3-8Z" /></svg>;
    case 'grocery':
      return <svg {...common}><circle cx="9" cy="20" r="1.3" /><circle cx="17" cy="20" r="1.3" /><path d="M3 4h2l2.4 12h11l2-8H7" /></svg>;
    case 'electronics':
      return <svg {...common}><rect x="3" y="4" width="18" height="12" rx="1.5" /><path d="M8 20h8M12 16v4" /></svg>;
    case 'furniture':
      return <svg {...common}><path d="M5 12V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4" /><rect x="3" y="12" width="18" height="6" rx="1.5" /><path d="M5 18v2M19 18v2" /></svg>;
    case 'books':
      return <svg {...common}><path d="M4 4.5A2 2 0 0 1 6 3h5v18H6a2 2 0 0 1-2-2Z" /><path d="M20 4.5A2 2 0 0 0 18 3h-5v18h5a2 2 0 0 0 2-2Z" /></svg>;
    case 'hardware':
      return <svg {...common}><path d="M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 1 5.4-5.4L21 6l-3-3-3.3 3.3Z" /></svg>;
    case 'sports':
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" /></svg>;

    // Health, Wellness & Beauty
    case 'fitness':
      return <svg {...common}><path d="M4 9v6M2 10v4M20 9v6M22 10v4M7 12h10" /><path d="M6 8v8M18 8v8" /></svg>;
    case 'salon':
      return <svg {...common}><circle cx="6" cy="6" r="2.4" /><circle cx="6" cy="18" r="2.4" /><path d="M8 7.5 20 20M8 16.5 20 4" /></svg>;
    case 'pharmacy':
      return <svg {...common}><rect x="4" y="9" width="16" height="11" rx="2" /><path d="M8 9V6a4 4 0 0 1 8 0v3" /><path d="M12 12v4M10 14h4" /></svg>;
    case 'hospital':
      return <svg {...common}><path d="M12 3l8 3.6V12c0 5-3.4 7.8-8 9-4.6-1.2-8-4-8-9V6.6Z" /><path d="M12 9v6M9 12h6" /></svg>;
    case 'dental':
      return <svg {...common}><path d="M12 3c-2.5 0-4 1.5-5 1.5S5 3 4 3c-1.5 0-2 1.5-2 3.5 0 5 1.5 6.5 2 10 .3 2 1 4.5 2.5 4.5s1.5-4 2-6 1-3 1.5-3 1 1 1.5 3 .5 6 2 6 2.2-2.5 2.5-4.5c.5-3.5 2-5 2-10C20 4.5 19.5 3 18 3c-1 0-2 1.5-3 1.5S14.5 3 12 3Z" /></svg>;
    case 'yoga':
      return <svg {...common}><circle cx="12" cy="5" r="2" /><path d="M12 7v6M12 13c-3 0-5 2-5 5M12 13c3 0 5 2 5 5M7 12c-1.5 1-2 2.5-2 4M17 12c1.5 1 2 2.5 2 4" /></svg>;
    case 'therapy':
      return <svg {...common}><path d="M3 12h4l2-5 3 10 2-7 2 2h5" /></svg>;
    case 'counseling':
      return <svg {...common}><path d="M9 4a5 5 0 0 0-2 9.6V17l3-2h2a5 5 0 0 0 0-10Z" /><path d="M9 9c1-1.5 3-1.5 4 0" /></svg>;

    // General Services & Trades
    case 'printing':
      return <svg {...common}><rect x="5" y="8" width="14" height="8" rx="1.5" /><path d="M7 8V4h10v4M7 16v4h10v-4" /></svg>;
    case 'laundry':
      return <svg {...common}><rect x="4" y="3" width="16" height="18" rx="2" /><circle cx="12" cy="13" r="4.5" /><circle cx="7" cy="6" r="0.8" fill={TEAL} stroke="none" /></svg>;
    case 'auto':
      return <svg {...common}><path d="M4 16 5 10a2 2 0 0 1 2-1.5h10A2 2 0 0 1 19 10l1 6" /><rect x="3" y="16" width="18" height="4" rx="1.5" /><circle cx="7.5" cy="16" r="1.3" /><circle cx="16.5" cy="16" r="1.3" /></svg>;
    case 'hvac':
      return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2" /></svg>;
    case 'cleaning':
      return <svg {...common}><path d="M9 3l6 6-9 9-3-3Z" /><path d="M14 4l6 6" /></svg>;
    case 'tailoring':
      return <svg {...common}><circle cx="7" cy="7" r="2" /><path d="M9 9l10 10M19 9 9 19M7 9a2 2 0 1 1 0-4" /></svg>;
    case 'delivery':
      return <svg {...common}><rect x="2" y="8" width="12" height="9" rx="1.2" /><path d="M14 11h4l3 3v3h-7Z" /><circle cx="6.5" cy="19" r="1.4" /><circle cx="17" cy="19" r="1.4" /></svg>;
    case 'security':
      return <svg {...common}><path d="M12 3l8 3.6V12c0 5-3.4 7.8-8 9-4.6-1.2-8-4-8-9V6.6Z" /><circle cx="12" cy="11" r="2.5" /></svg>;

    // Food & Beverage
    case 'restaurant':
      return <svg {...common}><path d="M7 3v6a2 2 0 0 0 4 0V3M9 9v12M17 3c-1.5 1.5-2 3-2 5s.5 3.5 2 5v9" /></svg>;
    case 'cafe':
      return <svg {...common}><path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5Z" /><path d="M17 9h1.5a2.5 2.5 0 0 1 0 5H17" /><path d="M7 3c0 1-1 1-1 2M11 3c0 1-1 1-1 2" /></svg>;
    case 'bakery':
      return <svg {...common}><path d="M5 12a7 7 0 0 1 14 0Z" /><path d="M4 12h16l-1.5 8h-13Z" /><circle cx="12" cy="8" r="1" fill={TEAL} stroke="none" /></svg>;
    case 'catering':
      return <svg {...common}><path d="M3 14a9 9 0 0 1 18 0Z" /><path d="M2 14h20M12 10V4M9 4h6" /></svg>;
    case 'foodtruck':
      return <svg {...common}><rect x="2" y="8" width="12" height="8" rx="1.2" /><path d="M14 10h4l3 3v3h-7Z" /><circle cx="6.5" cy="18" r="1.4" /><circle cx="17" cy="18" r="1.4" /><path d="M5 12h6" /></svg>;
    case 'bar':
      return <svg {...common}><path d="M6 4h12l-5 8v7h-2v-7Z" /><path d="M9 19h6" /></svg>;
    case 'brewery':
      return <svg {...common}><path d="M6 8h9v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2Z" /><path d="M15 10h2a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2" /><path d="M8 8c0-2 1-2 1-4M12 8c0-2 1-2 1-4" /></svg>;

    // Professional & Corporate Services
    case 'design':
      return <svg {...common}><path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-.5-1.5-.5-2.5S14 15 15 15h2a4 4 0 0 0 4-4c0-4.5-4-8-9-8Z" /><circle cx="7.5" cy="12" r="1" fill={TEAL} stroke="none" /><circle cx="9.5" cy="8" r="1" fill={TEAL} stroke="none" /><circle cx="14.5" cy="8" r="1" fill={TEAL} stroke="none" /></svg>;
    case 'accounting':
      return <svg {...common}><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M16 15h0" /></svg>;
    case 'realestate':
      return <svg {...common}><path d="M4 11 12 4l8 7" /><path d="M6 10v10h12V10" /><path d="M10 20v-5h4v5" /></svg>;
    case 'legal':
      return <svg {...common}><path d="M12 3v18M5 7h14" /><path d="M5 7 2 13a3 3 0 0 0 6 0ZM19 7l-3 6a3 3 0 0 0 6 0Z" /><path d="M8 21h8" /></svg>;
    case 'architecture':
      return <svg {...common}><path d="M4 21 12 3l8 18" /><path d="M8 21l4-9 4 9" /></svg>;
    case 'finance':
      return <svg {...common}><path d="M4 18V9M9 18v-5M14 18V7M19 18v-9" /><path d="M3 18h18" /></svg>;
    case 'insurance':
      return <svg {...common}><path d="M12 3l8 3.6V12c0 5-3.4 7.8-8 9-4.6-1.2-8-4-8-9V6.6Z" /><path d="M9 12l2 2 4-4" /></svg>;

    // Technology & Media
    case 'software':
      return <svg {...common}><path d="M9 8 4 12l5 4M15 8l5 4-5 4" /></svg>;
    case 'network':
      return <svg {...common}><rect x="4" y="4" width="16" height="5" rx="1.2" /><rect x="4" y="15" width="16" height="5" rx="1.2" /><path d="M7 9v6M17 9v6" /></svg>;
    case 'photography':
      return <svg {...common}><path d="M4 8h3l1.5-2h7L17 8h3v11H4Z" /><circle cx="12" cy="13.5" r="3.3" /></svg>;
    case 'marketing':
      return <svg {...common}><path d="M3 11v3l4 1v4l3 1v-5l8 3V6L7 10H3Z" /></svg>;
    case 'cloud':
      return <svg {...common}><path d="M7 18a4 4 0 0 1-1-7.9A5 5 0 0 1 15.5 8 4.5 4.5 0 0 1 17 17Z" /></svg>;
    case 'animation':
      return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M10 9.5v5l4.5-2.5Z" /></svg>;
    case 'broadcast':
      return <svg {...common}><circle cx="12" cy="18" r="1.6" /><path d="M8.5 15a5 5 0 0 1 7 0M5.5 12a9 9 0 0 1 13 0M12 3v3" /></svg>;

    // Education & Childcare
    case 'tutoring':
      return <svg {...common}><path d="M4 19.5V5a2 2 0 0 1 2-2h11v14H6a2 2 0 0 0-2 2Z" /><path d="M9 7h5M9 10h5" /></svg>;
    case 'daycare':
      return <svg {...common}><circle cx="12" cy="8" r="3" /><path d="M6 20c0-3.5 2.7-6 6-6s6 2.5 6 6" /><circle cx="7" cy="11" r="1.6" /><circle cx="17" cy="11" r="1.6" /></svg>;
    case 'music':
      return <svg {...common}><circle cx="6.5" cy="18" r="2.2" /><circle cx="17" cy="16" r="2.2" /><path d="M8.7 18V6l10.3-2v12" /></svg>;
    case 'vocational':
      return <svg {...common}><path d="M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 1 5.4-5.4L21 6l-3-3-3.3 3.3Z" /><circle cx="6" cy="18" r="1.5" /></svg>;
    case 'driving':
      return <svg {...common}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" /><path d="M12 3v6M12 15v6M4.5 7.5l4 4M15.5 12.5l4 4M4.5 16.5l4-4M15.5 11.5l4-4" /></svg>;
    case 'school':
      return <svg {...common}><path d="M2 8l10-4 10 4-10 4-10-4Z" /><path d="M6 10v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5" /></svg>;

    // Entertainment, Events & Travel
    case 'events':
      return <svg {...common}><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M8 3v4M16 3v4" /><path d="M12 14l1 2 2 .2-1.5 1.4.4 2-1.9-1-1.9 1 .4-2L9 16.2l2-.2Z" /></svg>;
    case 'travel':
      return <svg {...common}><path d="M3 13l18-8-6 18-3-7-7-3Z" /></svg>;
    case 'hotel':
      return <svg {...common}><path d="M3 19V6M3 12h13a3 3 0 0 1 3 3v4" /><circle cx="8" cy="9" r="2" /><path d="M5 12V9h8v3" /></svg>;
    case 'cinema':
      return <svg {...common}><path d="M3 7l2-3h3l-1.5 3M8 7l1.5-3h3L11 7M13 7l1.5-3h3L16 7" /><rect x="3" y="7" width="18" height="13" rx="1.5" /></svg>;
    case 'arcade':
      return <svg {...common}><circle cx="12" cy="8" r="3" /><path d="M12 11v7" /><path d="M8 20h8" /><circle cx="8.5" cy="16" r="1" fill={TEAL} stroke="none" /><circle cx="15.5" cy="16" r="1" fill={TEAL} stroke="none" /></svg>;
    case 'museum':
      return <svg {...common}><path d="M3 9 12 4l9 5" /><path d="M4 9v10M9 9v10M15 9v10M20 9v10" /><path d="M2 19h20" /></svg>;

    // Manufacturing, Agriculture & Wholesale
    case 'textile':
      return <svg {...common}><circle cx="12" cy="12" r="6" /><path d="M12 6v12M6 12h12" /></svg>;
    case 'wholesale':
      return <svg {...common}><path d="M3 8l9-4 9 4-9 4Z" /><path d="M3 8v9l9 4 9-4V8" /><path d="M12 12v9" /></svg>;
    case 'foodprocessing':
      return <svg {...common}><rect x="4" y="8" width="16" height="12" rx="1.5" /><path d="M8 8V6a4 4 0 0 1 8 0v2" /><path d="M9 13c1 1 2 1 3 0s2-1 3 0" /></svg>;
    case 'farming':
      return <svg {...common}><path d="M12 21V10" /><path d="M12 10c0-4-3-6-6-6 0 4 2 6 6 6ZM12 13c0-4 3-6 6-6 0 4-2 6-6 6Z" /></svg>;
    case 'carpentry':
      return <svg {...common}><path d="M3 15l9-9 3 3-9 9Z" /><path d="M13 7l3-3 3 3-3 3" /><path d="M3 15l3 3" /></svg>;
    case 'metalwork':
      return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>;

    default:
      return <OtherIcon />;
  }
}

function OtherIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

const s = {
  screen: { position: "fixed", inset: 0, display: "flex", flexDirection: "column", fontFamily: FONT, overflow: "hidden" },
  backBtn: { position: "absolute", top: 48, left: 16, background: "transparent", border: "none",
    fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: "pointer", padding: "6px 4px", zIndex: 2 },
  scroll: { flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" },
  top: { padding: "96px 24px 20px" },
  title: { fontSize: 26, fontWeight: 700, fontFamily: FONT, margin: 0, lineHeight: 1.2, whiteSpace: "pre-line" },
  groupBlock: { padding: "0 20px 8px" },
  groupHeader: { width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
    border: "1.5px solid", borderRadius: 14, padding: "14px 16px", margin: "16px 0 0", cursor: "pointer" },
  groupHeaderLeft: { display: "flex", alignItems: "center", gap: 10, minWidth: 0 },
  groupIconWrap: { flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" },
  groupLabel: { fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textAlign: "left" },
  chevron: { fontSize: 14, transition: "transform 0.2s ease", flexShrink: 0, marginLeft: 10 },
  grid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 12 },
  tile: {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
    border: "1.5px solid", borderRadius: 14, padding: "16px 8px", minHeight: 96, cursor: "pointer",
  },
  tileIcon: { display: "flex", alignItems: "center", justifyContent: "center" },
  tileLabel: { fontSize: 11, fontFamily: FONT, textAlign: "center", lineHeight: 1.3 },
  customLabel: { fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", margin: "12px 4px 6px" },
  customInput: {
    marginTop: 4, width: "100%", boxSizing: "border-box", border: "1.5px solid",
    borderRadius: 12, padding: "14px 16px", fontSize: 14, fontFamily: FONT, outline: "none",
  },
  customError: { fontSize: 11, fontWeight: 600, color: "#FF6B6B", fontFamily: FONT, margin: "6px 4px 0" },
  bottom: {
    position: "absolute", left: 0, right: 0, bottom: 0, padding: "16px 24px 32px",
    background: "linear-gradient(180deg, transparent, rgba(0,0,0,0.35) 40%)",
  },
  continueBtn: {
    width: "100%", background: TEAL, border: "none", borderRadius: 50,
    color: "#04211d", fontSize: 16, fontWeight: 700, fontFamily: FONT,
    padding: "16px", letterSpacing: "0.03em",
  },
};
