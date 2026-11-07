import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { loadInstitutions } from "@/lib/institutions";

type Props = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  return (await loadInstitutions(await createClient())).find((i) => i.slug === slug) ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const i = await load((await params).slug);
  return { title: i ? i.name : "Institution" };
}

/** Public page an institution can share with its students and alumni. */
export default async function InstitutionPage({ params }: Props) {
  const i = await load((await params).slug);
  if (!i) notFound();
  return (
    <section className="grid max-w-3xl gap-4">
      <p className="label-cap">{[i.city, i.country].filter(Boolean).join(", ") || "On Alumni Connect"}</p>
      <h1 className="text-4xl font-bold">{i.name}</h1>
      <p className="lede">
        {i.mentors
          ? `${i.mentors} ${i.mentors === 1 ? "alumnus is" : "alumni are"} volunteering to mentor ${i.short_name || i.name} students one-on-one.`
          : `${i.short_name || i.name} is building its mentor community. Alumni: be one of the first.`}
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href="/login?as=student" className="btn">I&apos;m a student here</Link>
        <Link href="/login?as=alumni" className="btn btn-ghost">I graduated from here</Link>
      </div>
      <p className="text-[0.9rem] text-muted">
        Students sign in with their institution email. Alumni sign in with any email and choose {i.short_name || i.name} as
        their institution; its organizers confirm them.
        {i.website && <> Official site: <a href={i.website} rel="noopener noreferrer">{i.website.replace(/^https?:\/\//, "")}</a>.</>}
      </p>
    </section>
  );
}
