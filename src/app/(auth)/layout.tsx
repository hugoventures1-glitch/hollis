export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="font-display text-3xl font-black tracking-tight text-text-primary">
            Hollis
          </span>
        </div>
        <div className="rounded-2xl border border-border bg-surface-raised p-8 shadow-sm">
          {children}
        </div>
      </div>
    </div>
  );
}
