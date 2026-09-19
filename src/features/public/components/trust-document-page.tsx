import Link from "next/link";
import {
  ArrowRight,
  Mail,
  MessageCircle,
  Send,
  ShieldCheck,
} from "lucide-react";

import { PublicSectionHeading } from "@/features/public/components/public-section-heading";
import {
  mailtoHref,
  SITE_CONTACT,
  type PublicLanguage,
} from "@/features/public/lib/site-contact";
import type { TrustDocument } from "@/features/public/lib/trust-pages";

/**
 * Renders the long-form trust documents (contact, privacy, terms, affiliate
 * disclosure) from one record shape. Adding a document is a content change in
 * `trust-pages.ts`, not a new page component.
 */
export function TrustDocumentPage({
  doc,
  language,
}: {
  doc: TrustDocument;
  language: PublicLanguage;
}) {
  const english = language === "en";
  const primaryHref = english ? "/en/knowledge" : "/servers";
  const primaryLabel = english ? "Browse the knowledge base" : "浏览服务器比价";
  const secondaryHref = english ? "/en/fwq/page/1" : "/knowledge";
  const secondaryLabel = english ? "Read the latest articles" : "打开知识库";

  return (
    <main id="main-content" className="min-w-0 flex-1">
      <section className="public-hero">
        <div className="public-container py-9 md:py-12">
          <p className="public-kicker">{doc.kicker}</p>
          <h1 className="font-editorial mt-4 max-w-3xl break-words text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            {doc.heading}
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">
            {doc.intro}
          </p>
          <p className="mt-4 text-xs font-medium text-muted-foreground">
            {english ? "Last updated" : "最后更新"}：{doc.updatedAt}
          </p>
        </div>
      </section>

      <div className="public-container space-y-10 py-10 md:space-y-14">
        {doc.channels && doc.channels.length > 0 ? (
          <section aria-labelledby="trust-channels">
            <PublicSectionHeading
              title={english ? "Who are you?" : "你是哪一类？"}
              description={
                english
                  ? "Pick the route that matches your situation."
                  : "按身份选择入口，通常能更快得到回复。"
              }
              eyebrow={english ? "ROUTES" : "联系入口"}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              {doc.channels.map((channel) => (
                <a
                  key={channel.id}
                  href={
                    channel.href === "email"
                      ? mailtoHref()
                      : channel.href
                  }
                  {...(channel.external
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : {})}
                  className="public-panel flex min-h-11 flex-col gap-2 p-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <span className="flex items-center gap-2 text-base font-semibold text-foreground">
                    <Mail className="size-5 text-primary" aria-hidden="true" />
                    {channel.label}
                  </span>
                  <span className="text-sm leading-6 text-muted-foreground">
                    {channel.description}
                  </span>
                  <span className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                    {SITE_CONTACT.email}
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </span>
                </a>
              ))}
            </div>

            <div className="public-panel mt-4 grid gap-3 p-5 sm:grid-cols-2">
              <a
                href={SITE_CONTACT.qqGroup.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-11 items-center gap-2 text-sm font-medium text-primary underline underline-offset-4 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <MessageCircle className="size-4" aria-hidden="true" />
                {SITE_CONTACT.qqGroup.label}
              </a>
              <a
                href={SITE_CONTACT.telegram.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-11 items-center gap-2 text-sm font-medium text-primary underline underline-offset-4 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Send className="size-4" aria-hidden="true" />
                {SITE_CONTACT.telegram.label}
              </a>
            </div>
          </section>
        ) : null}

        <section aria-labelledby="trust-body">
          <h2 id="trust-body" className="sr-only">
            {doc.heading}
          </h2>
          <div className="space-y-8">
            {doc.sections.map((section, index) => (
              <section
                key={section.id}
                aria-labelledby={`trust-${section.id}`}
                className="scroll-mt-28 border-b border-border/70 pb-8 last:border-b-0 last:pb-0"
              >
                <div className="flex items-start gap-3">
                  <span
                    className="public-stat mt-0.5 text-lg text-primary/70"
                    aria-hidden="true"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3
                      id={`trust-${section.id}`}
                      className="scroll-mt-28 text-base font-semibold text-foreground"
                    >
                      {section.heading}
                    </h3>
                    {section.paragraphs.map((paragraph) => (
                      <p
                        key={paragraph.slice(0, 24)}
                        className="mt-2 break-words text-sm leading-7 text-muted-foreground"
                      >
                        {paragraph}
                      </p>
                    ))}
                    {section.bullets && section.bullets.length > 0 ? (
                      <ul className="mt-3 space-y-2">
                        {section.bullets.map((bullet) => (
                          <li
                            key={bullet.slice(0, 24)}
                            className="flex items-start gap-2 text-sm leading-7 text-muted-foreground"
                          >
                            <ShieldCheck
                              className="mt-1.5 size-3.5 shrink-0 text-primary"
                              aria-hidden="true"
                            />
                            <span className="min-w-0 break-words">
                              {bullet}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </div>
              </section>
            ))}
          </div>
        </section>

        <section
          aria-labelledby="trust-cta"
          className="rounded-2xl border border-primary/15 bg-primary/5 p-6 sm:p-8"
        >
          <h2 id="trust-cta" className="text-xl font-semibold text-foreground">
            {english ? "Start here." : "接下来，从这两处开始。"}
          </h2>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Link
              href={primaryHref}
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {primaryLabel}
            </Link>
            <Link
              href={secondaryHref}
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-border px-6 text-sm font-semibold text-foreground transition-colors hover:border-primary/30 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {secondaryLabel}
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
