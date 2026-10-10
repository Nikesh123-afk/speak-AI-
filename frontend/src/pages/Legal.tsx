import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useConfig } from '../lib/queries';
import { Eyebrow } from '../components/ui';

const UPDATED = '10 October 2026';

function SupportLink() {
  const { data: config } = useConfig();
  return config?.supportEmail
    ? <a href={`mailto:${config.supportEmail}`} className="font-medium text-ink underline underline-offset-4">{config.supportEmail}</a>
    : <Link to="/contact" className="font-medium text-ink underline underline-offset-4">our contact page</Link>;
}

function Doc({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <article className="container-page max-w-3xl py-12 sm:py-16">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1 className="mt-3 text-3xl font-medium sm:text-5xl">{title}</h1>
      <p className="mt-3 text-sm text-muted">Last updated {UPDATED}</p>
      <div className="mt-10 space-y-8 leading-relaxed text-muted [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-medium [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1">
        {children}
      </div>
    </article>
  );
}

export function PrivacyPage() {
  return (
    <Doc eyebrow="Legal" title="Privacy policy">
      <section>
        <p>IELTS Fluent AI (“we”) runs this speaking-practice service. This policy explains what we collect, why, who we share it with and the choices you have. Questions: <SupportLink />.</p>
      </section>
      <section>
        <h2>What we collect</h2>
        <ul>
          <li><strong className="text-ink">Account details:</strong> your name, email address and a one-way hash of your password (we never store the password itself).</li>
          <li><strong className="text-ink">Your practice:</strong> the questions you answered, the text of your answers, and the feedback and scores generated for them.</li>
          <li><strong className="text-ink">Billing:</strong> if you subscribe, Stripe handles your card. We store only your Stripe customer and subscription IDs and your plan.</li>
          <li><strong className="text-ink">Newsletter:</strong> your email address and when you confirmed, if you sign up.</li>
          <li><strong className="text-ink">Security records:</strong> active sign-in sessions, and short-lived rate-limit counters keyed by a hash of your IP address or email.</li>
        </ul>
      </section>
      <section>
        <h2>Your voice</h2>
        <p>We never receive audio. Your browser’s built-in speech recognition turns speech into text on your device or through your browser vendor’s service — in Chrome, Google processes the audio under Google’s own terms. Only the resulting text reaches us. You can always type instead.</p>
      </section>
      <section>
        <h2>Why we use it</h2>
        <ul>
          <li>To provide the service you signed up for: running sessions, generating feedback and showing your history (contract).</li>
          <li>To take payment and manage subscriptions (contract).</li>
          <li>To keep accounts secure and prevent abuse, such as rate limiting and password-reset emails (legitimate interests).</li>
          <li>To send the monthly newsletter, only after you confirm (consent — withdraw any time with the link in every email).</li>
        </ul>
        <p className="mt-2">We don’t sell your data, show ads, or use your answers to train AI models.</p>
      </section>
      <section>
        <h2>Who we share it with</h2>
        <ul>
          <li><strong className="text-ink">Google (Gemini API)</strong> receives the text of your answers to generate feedback.</li>
          <li><strong className="text-ink">Stripe</strong> processes payments.</li>
          <li><strong className="text-ink">Our email provider</strong> delivers account and newsletter emails.</li>
          <li><strong className="text-ink">Our hosting and error-monitoring providers</strong> store and run the service. Error reports exclude request bodies and personal data.</li>
        </ul>
        <p className="mt-2">Some of these providers process data outside your country under standard contractual safeguards.</p>
      </section>
      <section>
        <h2>Cookies and storage</h2>
        <p>We set one essential cookie, which keeps you signed in. While you practise, your in-progress answers are kept in your browser’s session storage so a reload doesn’t lose them; they’re cleared when you close the tab. We use no analytics or advertising cookies.</p>
      </section>
      <section>
        <h2>How long we keep it</h2>
        <p>Account and practice data are kept until you delete your account. Sign-in sessions expire after 30 days; reset and confirmation links after 1–48 hours; rate-limit counters within an hour or a day. Stripe keeps payment records as the law requires.</p>
      </section>
      <section>
        <h2>Your rights</h2>
        <p>From <Link to="/account" className="font-medium text-ink underline underline-offset-4">account settings</Link> you can correct your details, download all your data, and delete your account and everything in it. You may also object to processing or complain to your data-protection authority. For anything else, contact <SupportLink />.</p>
      </section>
      <section>
        <h2>Children</h2>
        <p>The service is intended for people aged 16 and over.</p>
      </section>
      <section>
        <h2>Changes</h2>
        <p>If we change this policy in a meaningful way we’ll update the date above and tell account holders by email.</p>
      </section>
    </Doc>
  );
}

export function TermsPage() {
  return (
    <Doc eyebrow="Legal" title="Terms of service">
      <section>
        <p>By creating an account you agree to these terms. If you don’t agree, please don’t use the service. Questions: <SupportLink />.</p>
      </section>
      <section>
        <h2>What the service is</h2>
        <p>IELTS Fluent AI is a practice tool. Feedback is generated automatically from the text of your answers and is guidance only — it is not an official IELTS score, and we don’t guarantee any test result. We are not affiliated with IELTS, the British Council, IDP or Cambridge.</p>
      </section>
      <section>
        <h2>Your account</h2>
        <ul>
          <li>You must be 16 or older and give a real email address.</li>
          <li>Keep your password private. You’re responsible for activity on your account.</li>
          <li>Don’t misuse the service: no attempts to break security, overload it, scrape it, or submit unlawful content.</li>
        </ul>
      </section>
      <section>
        <h2>Plans and payment</h2>
        <ul>
          <li>The Free plan includes three assessed Part 1 sessions.</li>
          <li>Paid plans renew automatically each billing period until cancelled. Prices are shown on the pricing page and charged by Stripe.</li>
          <li>Cancel any time from your dashboard (“Manage billing”). You keep access until the end of the period you’ve paid for; we don’t give partial refunds unless the law requires it.</li>
          <li>“Unlimited” sessions are subject to fair-use limits that stop automated abuse; normal practice never reaches them.</li>
        </ul>
      </section>
      <section>
        <h2>Your content</h2>
        <p>Your answers remain yours. You give us permission to store and process them only to provide the service, as described in the <Link to="/privacy" className="font-medium text-ink underline underline-offset-4">privacy policy</Link>.</p>
      </section>
      <section>
        <h2>Availability and liability</h2>
        <p>We work to keep the service running but can’t promise it will always be available or error-free. To the extent the law allows, the service is provided “as is” and our total liability is limited to what you paid us in the 12 months before the claim. Nothing here limits rights you have under consumer law.</p>
      </section>
      <section>
        <h2>Ending the agreement</h2>
        <p>You can delete your account at any time from account settings. We may suspend accounts that break these terms, and will tell you why.</p>
      </section>
      <section>
        <h2>Changes</h2>
        <p>We may update these terms. For significant changes we’ll email account holders in advance; continuing to use the service afterwards means you accept them.</p>
      </section>
    </Doc>
  );
}

export function ContactPage() {
  const { data: config } = useConfig();
  return (
    <div className="container-page max-w-3xl py-12 sm:py-16">
      <Eyebrow>Support</Eyebrow>
      <h1 className="mt-3 text-3xl font-medium sm:text-5xl">Get in touch</h1>
      {config?.supportEmail ? (
        <>
          <p className="mt-5 text-lg leading-relaxed text-muted">
            Email <a href={`mailto:${config.supportEmail}`} className="font-medium text-ink underline underline-offset-4">{config.supportEmail}</a> from the address on your account, so we can find it quickly.
          </p>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            <li className="rounded-2xl border border-line bg-card p-5">
              <p className="font-medium">Premium</p>
              <p className="mt-1 text-sm text-muted">Priority support: we answer within one business day.</p>
            </li>
            <li className="rounded-2xl border border-line bg-card p-5">
              <p className="font-medium">Free and Standard</p>
              <p className="mt-1 text-sm text-muted">We usually reply within three business days.</p>
            </li>
          </ul>
        </>
      ) : (
        <p className="mt-5 text-muted">Support contact details are coming soon.</p>
      )}
      <div className="mt-10 rounded-2xl border border-line p-5 text-sm text-muted">
        <p className="font-medium text-ink">Before you write</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Forgot your password? <Link to="/forgot-password" className="text-ink underline underline-offset-4">Reset it here</Link>.</li>
          <li>Billing, invoices and cancelling: use “Manage billing” on your dashboard.</li>
          <li>Downloading or deleting your data: <Link to="/account" className="text-ink underline underline-offset-4">account settings</Link>.</li>
        </ul>
      </div>
    </div>
  );
}
