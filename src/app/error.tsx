"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="empty">
      <b className="text-ink">Something went wrong loading this page</b>
      <span>It's usually temporary. Try again, and if it keeps happening, let the organizers know.</span>
      <button className="btn btn-quiet btn-sm justify-self-start" type="button" onClick={reset}>Try again</button>
    </section>
  );
}
