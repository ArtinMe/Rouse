export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-zinc-50 px-6 text-center dark:bg-black">
      <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
        Rouse
      </h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        Wakes you up before you miss your stop.
      </p>
    </div>
  );
}
