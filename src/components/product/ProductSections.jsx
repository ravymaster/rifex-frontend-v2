// src/components/product/ProductSections.jsx
// RIFEX PRODUCT LANDINGS V1 — shared presentational sections reused by
// the four product landings (Eventos, Campañas, Inscripciones, Rifas).
// Pure presentation: no data fetching, no auth, no product-specific
// copy. Each page supplies its own content + accent color; nothing here
// decides what a product does. Visual language: 2026 clean/premium,
// white cards, soft borders, discrete shadows, numbered steps — see
// src/styles/productLanding.module.css.
import Link from 'next/link';
import styles from '@/styles/productLanding.module.css';

export function ProductPage({ accent, children }) {
  return (
    <div className={styles.page} style={accent ? { '--pl-accent': accent } : undefined}>
      {children}
    </div>
  );
}

export function ProductHero({ eyebrow, title, subtitle, primaryCta, secondaryCta, chips }) {
  return (
    <section className={styles.hero}>
      {eyebrow && <span className={styles.eyebrow}>{eyebrow}</span>}
      <h1 className={styles.heroTitle}>{title}</h1>
      {subtitle && <p className={styles.heroSubtitle}>{subtitle}</p>}
      {(primaryCta || secondaryCta) && (
        <div className={styles.heroCtas}>
          {primaryCta && (
            <Link href={primaryCta.href} className={styles.btnPrimary}>
              {primaryCta.label}
            </Link>
          )}
          {secondaryCta && (
            <Link href={secondaryCta.href} className={styles.btnSecondary}>
              {secondaryCta.label}
            </Link>
          )}
        </div>
      )}
      {chips && chips.length > 0 && (
        <div className={styles.heroVisual}>
          {chips.map((c) => (
            <div key={c.label} className={styles.heroChip}>
              <p className={styles.heroChipValue}>{c.value}</p>
              <p className={styles.heroChipLabel}>{c.label}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function ProductFeatureGrid({ title, subtitle, items, columns = 3 }) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {subtitle && <p className={styles.sectionSubtitle}>{subtitle}</p>}
      </div>
      <div className={`${styles.grid} ${columns === 4 ? styles.grid4 : styles.grid3}`}>
        {items.map((it) => (
          <div key={it.title} className={styles.card}>
            {it.icon && <div className={styles.cardIcon} aria-hidden="true">{it.icon}</div>}
            <p className={styles.cardTitle}>{it.title}</p>
            <p className={styles.cardDesc}>{it.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ProductSteps({ title, subtitle, steps }) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {subtitle && <p className={styles.sectionSubtitle}>{subtitle}</p>}
      </div>
      <ol className={styles.steps} style={{ '--pl-step-cols': Math.min(steps.length, 5), listStyle: 'none', padding: 0, margin: 0 }}>
        {steps.map((s, i) => (
          <li key={s.title} className={styles.step}>
            <div className={styles.stepNum}>{i + 1}</div>
            <p className={styles.stepTitle}>{s.title}</p>
            <p className={styles.stepDesc}>{s.desc}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function ProductUseCases({ title, subtitle, items }) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {subtitle && <p className={styles.sectionSubtitle}>{subtitle}</p>}
      </div>
      <div className={`${styles.grid} ${styles.grid4}`}>
        {items.map((it) => (
          <div key={it.title} className={styles.card}>
            {it.icon && <div className={styles.cardIcon} aria-hidden="true">{it.icon}</div>}
            <p className={styles.cardTitle}>{it.title}</p>
            {it.desc && <p className={styles.cardDesc}>{it.desc}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

export function ProductOperational({ title, subtitle, items }) {
  return (
    <section className={styles.section}>
      <div className={styles.operational}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>{title}</h2>
          {subtitle && <p className={styles.sectionSubtitle}>{subtitle}</p>}
        </div>
        <div className={styles.operationalGrid}>
          {items.map((it) => (
            <div key={it.title} className={styles.operationalItem}>
              {it.icon && <div className={styles.operationalIcon} aria-hidden="true">{it.icon}</div>}
              <div>
                <p className={styles.cardTitle}>{it.title}</p>
                <p className={styles.cardDesc}>{it.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ProductSecurity({ title, subtitle, items }) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {subtitle && <p className={styles.sectionSubtitle}>{subtitle}</p>}
      </div>
      <div className={styles.securityList}>
        {items.map((text) => (
          <div key={text} className={styles.securityItem}>
            <span className={styles.securityCheck} aria-hidden="true">✓</span>
            <span>{text}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ProductFaq({ title, items }) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>{title}</h2>
      </div>
      <div className={styles.faqList}>
        {items.map((it) => (
          <details key={it.q} className={styles.faqItem}>
            <summary>{it.q}</summary>
            <p className={styles.faqAnswer}>{it.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function ProductFinalCta({ title, subtitle, cta, note, noteLink }) {
  return (
    <section className={styles.section} style={{ borderTop: 'none' }}>
      <div className={styles.finalCta}>
        <h2 className={styles.finalCtaTitle}>{title}</h2>
        {subtitle && <p className={styles.finalCtaSubtitle}>{subtitle}</p>}
        <Link href={cta.href} className={styles.btnPrimary}>{cta.label}</Link>
        {note && (
          <p className={styles.finalCtaNote}>
            {note}{' '}
            {noteLink && <Link href={noteLink.href}>{noteLink.label}</Link>}
          </p>
        )}
      </div>
    </section>
  );
}
