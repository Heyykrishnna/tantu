import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-content-center gap-4 px-6 text-center">
      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">404</p>
      <h1 className="font-heading text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Page not found</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">This workspace page does not exist. Return to your tasks to continue.</p>
      <Link href="/tasks" className="mx-auto inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm outline-none hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-zinc-400 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white">Go to tasks</Link>
    </main>
  );
}
