import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, BookOpen, Home, Search } from "lucide-react";

import { BrandLogo } from "@/components/brand/brand-logo";
import { Button } from "@/components/ui/button";
import Footer from "@/features/public/components/footer";
import Header from "@/features/public/components/header";

const destinations = [
  {
    title: "Server deals",
    description: "Compare available plans by region, network, and price.",
    href: "/servers",
    icon: Search,
  },
  {
    title: "Knowledge Base",
    description:
      "Find practical guidance on servers, networks, and operations.",
    href: "/en/knowledge",
    icon: BookOpen,
  },
] as const;

export default function EnglishNotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Suspense
        fallback={<div className="h-[65px] border-b border-border/60" />}
      >
        <Header language="en" />
      </Suspense>

      <main className="container mx-auto flex flex-1 items-center px-4 py-12 md:py-20">
        <div className="grid w-full gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.72fr)] lg:items-center">
          <section className="space-y-6">
            <BrandLogo compact />
            <p className="text-sm font-semibold text-primary">
              404 / Not Found
            </p>
            <div className="space-y-4">
              <h1 className="font-editorial max-w-3xl text-4xl font-semibold leading-tight md:text-5xl">
                This page is no longer available
              </h1>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground">
                The address may be incorrect or the content may have moved. Use
                a stable section below to continue browsing.
              </p>
            </div>
            <Button asChild size="lg" className="min-h-11 rounded-md px-6">
              <Link href="/en">
                <Home className="size-4" />
                English home
              </Link>
            </Button>
          </section>

          <nav
            aria-label="Suggested destinations"
            className="divide-y border-y border-border/70"
          >
            {destinations.map((destination) => {
              const Icon = destination.icon;
              return (
                <Link
                  key={destination.href}
                  href={destination.href}
                  className="group flex min-h-28 items-center gap-4 py-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">
                      {destination.title}
                    </span>
                    <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                      {destination.description}
                    </span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
                </Link>
              );
            })}
          </nav>
        </div>
      </main>

      <Suspense fallback={null}>
        <Footer language="en" />
      </Suspense>
    </div>
  );
}
