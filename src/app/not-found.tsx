import Link from "next/link";

export default function NotFound() {
  return (
    <section className="empty">
      <b className="text-ink">That page doesn't exist</b>
      <Link href="/" className="justify-self-start">Go to the start page</Link>
    </section>
  );
}
