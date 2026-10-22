import type { Metadata } from 'next'

// Public About page. The explore footer ("Our story") and the Android / iOS
// Profile → "About Quick In" rows have always opened /about, but the route did
// not exist. Static and unauthenticated, like /privacy.
//
// The copy is deliberately bilingual on BOTH locales: the English and Egyptian
// Arabic paragraphs complement each other rather than translate each other, so
// every paragraph is shown with an explicit direction. Not dir="auto": an Arabic
// line that opens with the Latin brand name would be laid out left-to-right.

const C = { burgundy: '#5B0F16', cream: '#F6F1E6', tan: '#EFE6D8', ink: '#2A2220', muted: '#6B6055' }
const FONT = '"DM Sans", ui-sans-serif, system-ui, -apple-system, sans-serif'

export const metadata: Metadata = {
  title: 'About Us | عن كويك إن',
  description:
    'Quick In is a local Egyptian platform that makes it easy to find, list and book rental units — one simple digital experience for hosts and guests.',
}

function P({ children, muted, ar }: { children: React.ReactNode; muted?: boolean; ar?: boolean }) {
  return (
    <p dir={ar ? 'rtl' : 'ltr'} lang={ar ? 'ar' : undefined} style={{ margin: '0 0 12px', fontSize: 14.5, lineHeight: 1.8, color: muted ? C.muted : C.ink }}>
      {children}
    </p>
  )
}

function Section({ en, ar, children }: { en: string; ar: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 34 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: '2px 16px', margin: '0 0 12px', paddingBottom: 8, borderBottom: `1px solid ${C.tan}` }}>
        <h2 style={{ fontSize: 19, margin: 0, color: C.burgundy }}>{en}</h2>
        <span dir="rtl" lang="ar" style={{ fontSize: 17, fontWeight: 600, color: C.burgundy, opacity: 0.75 }}>{ar}</span>
      </div>
      {children}
    </section>
  )
}

function Reason({ en, ar, children }: { en: string; ar: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.cream, borderRadius: 16, padding: '16px 18px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: '2px 12px', margin: '0 0 8px' }}>
        <h3 style={{ fontSize: 15.5, margin: 0, color: C.ink }}>{en}</h3>
        <span dir="rtl" lang="ar" style={{ fontSize: 14, fontWeight: 600, color: C.muted }}>{ar}</span>
      </div>
      {children}
    </div>
  )
}

const cta: React.CSSProperties = {
  display: 'inline-block',
  padding: '12px 22px',
  borderRadius: 999,
  fontWeight: 600,
  fontSize: 14.5,
  textDecoration: 'none',
}

export default function AboutPage() {
  return (
    <main style={{ minHeight: '100vh', background: C.cream, color: C.ink, fontFamily: FONT, padding: '40px 20px 64px' }}>
      <article
        style={{
          width: '100%',
          maxWidth: 780,
          margin: '0 auto',
          background: '#fff',
          borderRadius: 24,
          border: '1px solid rgba(42,34,32,0.07)',
          boxShadow: '0 12px 40px rgba(42,34,32,0.10)',
          padding: '40px 34px 44px',
        }}
      >
        <img src="/logo.png" alt="Quick In" style={{ height: 44, display: 'block', margin: '0 auto 20px' }} />
        <h1 style={{ fontSize: 26, textAlign: 'center', margin: '0 0 2px' }}>About Quick In</h1>
        <p dir="rtl" lang="ar" style={{ fontSize: 20, textAlign: 'center', margin: '0 0 18px', color: C.muted }}>عن كويك إن</p>
        <p style={{ fontSize: 17, fontWeight: 600, textAlign: 'center', margin: 0, color: C.burgundy }}>
          Find it. Book it. Live it.
        </p>
        <p dir="rtl" lang="ar" style={{ fontSize: 16, textAlign: 'center', margin: '4px 0 0', color: C.burgundy }}>
          لاقي مكانك، احجزه، واستمتع بتجربتك.
        </p>

        <Section en="Who We Are" ar="إحنا مين؟">
          <P ar>Quickin هي منصة مصرية محلية بتسهّل عليك إنك تلاقي، تعرض، وتحجز وحدات للإيجار، كل ده من خلال تجربة رقمية بسيطة وسهلة.</P>
          <P>We connect hosts and guests in one place, making the rental journey more convenient, accessible, and transparent for everyone.</P>
          <P ar>سواء كنت بتدور على مكان لإجازتك أو عندك وحدة وعايز تعرضها للإيجار، Quickin بتساعدك توصل للي محتاجه بسهولة ومن غير تعقيد.</P>
        </Section>

        <Section en="Our Story" ar="حكايتنا">
          <P>We started Quickin with one simple idea: renting should be easier.</P>
          <P ar>لأننا عارفين إن رحلة الإيجار ممكن تكون معقدة، من البحث عن المكان المناسب لحد الحجز والدفع، قررنا نسهّل كل خطوة ونخلي التجربة أبسط وأوضح.</P>
          <P>With Quickin, finding your next stay or listing your property becomes a smoother experience, all in one place.</P>
        </Section>

        <Section en="Our Mission" ar="رسالتنا">
          <P>Our mission is to make renting easier for everyone in Egypt.</P>
          <P ar>هدفنا إننا نربط بين أصحاب الوحدات والناس اللي بتدور على مكان مناسب، من خلال منصة بتجمع بين السهولة، المرونة، والشفافية.</P>
          <P>We want every host to have an easier way to showcase their property and every guest to have a simpler way to find their next stay.</P>
        </Section>

        <Section en="Why Quickin?" ar="ليه Quickin؟">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
            <Reason en="Easy to Use" ar="سهولة في كل خطوة">
              <P muted>Find, list, and book rental units through one convenient platform، من غير خطوات معقدة.</P>
            </Reason>
            <Reason en="Made for Egypt" ar="معمول للسوق المصري">
              <P muted>A local platform designed around your needs، مع إمكانية الدفع بالجنيه المصري.</P>
            </Reason>
            <Reason en="Flexible Payments" ar="طرق دفع مرنة">
              <P muted>Pay through available digital payment methods, including eligible card, wallet, and installment options.</P>
              <P muted ar>اختار طريقة الدفع المناسبة ليك من طرق الدفع المتاحة على المنصة.</P>
            </Reason>
            <Reason en="Transparency You Can Trust" ar="وضوح وشفافية">
              <P muted>Clear property details and booking information help you make more informed decisions.</P>
              <P muted ar>بنحرص إن المعلومات وتفاصيل الحجز تكون واضحة، علشان تقدر تختار وأنت فاهم كل التفاصيل.</P>
            </Reason>
            <Reason en="Better for Everyone" ar="تجربة أسهل للطرفين">
              <P muted>For hosts, it&rsquo;s an easier way to showcase their units and reach potential guests. For guests, it&rsquo;s a simpler way to discover and book a suitable place.</P>
              <P muted ar>سواء بتأجّر وحدتك أو بتدور على مكان تقضي فيه وقتك، إحنا هنا علشان نسهّل عليك الرحلة.</P>
            </Reason>
          </div>
        </Section>

        <Section en="Our Promise" ar="وعدنا ليك">
          <P>At Quickin, we believe that a great rental experience starts with convenience, transparency, and simplicity.</P>
          <P ar>بنشتغل علشان نخلي تجربة الإيجار أسهل وأكثر وضوحًا، ونوفّر تجربة أفضل لأصحاب الوحدات والضيوف في كل خطوة.</P>
          <P>Because finding the right place should be exciting, not complicated.</P>
          <P ar>لأنك تستحق تلاقي مكانك بسهولة، وتستمتع بتجربتك من أول خطوة.</P>
        </Section>

        <section style={{ marginTop: 38, background: C.tan, borderRadius: 20, padding: '26px 22px', textAlign: 'center' }}>
          <h2 style={{ fontSize: 20, margin: 0, color: C.burgundy }}>Your Next Stay Starts Here</h2>
          <p dir="rtl" lang="ar" style={{ fontSize: 16, margin: '2px 0 12px', color: C.burgundy, opacity: 0.8 }}>رحلتك الجاية بتبدأ هنا</p>
          <P>Whether you&rsquo;re looking for your next getaway or ready to list your property, Quickin is here to make it easier.</P>
          <P ar>سواء بتخطط لإجازتك الجاية أو عايز تعرض وحدتك للإيجار، ابدأ رحلتك مع Quickin.</P>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 8 }}>
            <a href="/explore" style={{ ...cta, background: C.burgundy, color: C.cream }}>Explore stays</a>
            <a href="/host" style={{ ...cta, background: '#fff', color: C.burgundy, border: `1px solid ${C.burgundy}` }}>Become a host</a>
          </div>
        </section>
      </article>
    </main>
  )
}
