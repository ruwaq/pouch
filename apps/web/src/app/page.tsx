const highlights = [
  'Natural language cash-out flow',
  'Cross-chain consolidation via Universal Accounts',
  'Provider routing across gift cards, top-ups, and eSIMs',
];

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '48px 20px',
      }}
    >
      <section
        style={{
          width: '100%',
          maxWidth: 960,
          borderRadius: 24,
          padding: 32,
          background: 'linear-gradient(135deg, rgba(38,79,255,0.22), rgba(12,17,35,0.95))',
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.32)',
        }}
      >
        <p style={{ margin: 0, color: '#9db0ff', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Pouch
        </p>
        <h1 style={{ marginBottom: 12, fontSize: 'clamp(2.5rem, 6vw, 4.75rem)', lineHeight: 1.05 }}>
          Talk to your money. It cashes out anywhere.
        </h1>
        <p style={{ maxWidth: 720, fontSize: '1.05rem', color: '#d8deff' }}>
          Phase 0 is now scaffolded: the monorepo has a typed shared layer, a real domain core, initial database schema,
          and bootable API and web apps ready for feature work.
        </p>

        <div style={{ display: 'grid', gap: 12, marginTop: 28 }}>
          {highlights.map((highlight) => (
            <div
              key={highlight}
              style={{
                border: '1px solid rgba(157, 176, 255, 0.25)',
                borderRadius: 18,
                padding: '16px 18px',
                background: 'rgba(7, 11, 26, 0.58)',
              }}
            >
              {highlight}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
