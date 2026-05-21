import Image from "next/image";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* ── Left panel: clean white form ── */}
      <div className="flex w-full flex-col bg-surface lg:w-[45%]">
        {/* Logo */}
        <div className="flex items-center gap-3 px-12 pt-9">
          <Image
            src="/hollis-logo.png"
            alt="Hollis"
            width={32}
            height={32}
            className="dark:invert"
            style={{ objectFit: "contain" }}
            priority
          />
          <span className="font-display text-xl font-semibold tracking-tight text-text-primary">
            Hollis
          </span>
        </div>

        {/* Form */}
        <div className="flex flex-1 items-center justify-center px-12 py-10">
          <div className="w-full max-w-[380px]">{children}</div>
        </div>

        {/* Footer */}
        <div className="px-12 pb-9">
          <p className="text-xs text-text-tertiary">
            By continuing, you agree to our{" "}
            <a
              href="#"
              className="underline underline-offset-2 transition-colors hover:text-text-secondary"
            >
              Terms of Service
            </a>{" "}
            and{" "}
            <a
              href="#"
              className="underline underline-offset-2 transition-colors hover:text-text-secondary"
            >
              Privacy Policy
            </a>
            .
          </p>
        </div>
      </div>

      {/* ── Right panel: dark + MacBook ── */}
      <div
        className="relative hidden overflow-hidden lg:flex lg:w-[55%] lg:flex-col lg:items-center lg:justify-center"
        style={{ background: "#090909" }}
      >
        {/* Gradient orbs */}
        <div
          className="pointer-events-none absolute -top-64 -right-64 h-[800px] w-[800px] rounded-full blur-[180px]"
          style={{ background: "radial-gradient(circle, rgba(99,102,241,0.38) 0%, transparent 60%)" }}
        />
        <div
          className="pointer-events-none absolute -bottom-64 -left-32 h-[700px] w-[700px] rounded-full blur-[160px]"
          style={{ background: "radial-gradient(circle, rgba(59,130,246,0.26) 0%, transparent 60%)" }}
        />
        <div
          className="pointer-events-none absolute top-1/2 left-1/4 h-[400px] w-[400px] -translate-y-1/2 rounded-full blur-[120px]"
          style={{ background: "radial-gradient(circle, rgba(139,92,246,0.14) 0%, transparent 65%)" }}
        />

        {/* MacBook image — rounded corners, fills panel */}
        <div className="relative z-10 flex w-full flex-col items-center px-8 pb-10">
          <div className="w-full overflow-hidden rounded-2xl" style={{ boxShadow: "0 48px 96px rgba(0,0,0,0.85), 0 0 120px rgba(99,102,241,0.12)" }}>
            <Image
              src="/hollis-macbook.png"
              alt="Hollis dashboard"
              width={1100}
              height={720}
              className="w-full"
              priority
            />
          </div>

          <div className="mt-7 text-center">
            <p
              className="text-[24px] font-semibold leading-tight tracking-tight"
              style={{ color: "rgba(250,250,250,0.88)" }}
            >
              Renewal automation,
            </p>
            <p
              className="text-[24px] font-semibold leading-tight tracking-tight"
              style={{ color: "rgba(250,250,250,0.28)" }}
            >
              on autopilot.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
