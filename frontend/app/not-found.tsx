import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-content-center gap-4 px-6 text-center">
      <p className="text-xs font-medium uppercase tracking-widest text-violet-500">404</p>
      <h1 className="font-[family-name:var(--font-poppins)] text-2xl font-semibold">Page not found</h1>
      <p className="text-sm text-slate-500 dark:text-zinc-400">This workspace page does not exist. Return to your tasks to continue.</p>
      <Link href="/tasks" className="mx-auto rounded-lg bg-violet-500 px-4 py-2 text-sm font-medium text-white outline-none hover:bg-violet-600 focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2">Go to tasks</Link>
    </main>
  );
}
