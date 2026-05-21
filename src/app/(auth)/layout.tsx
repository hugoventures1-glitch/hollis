import Image from "next/image";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* ── Left panel: form ── */}
      <div className="relative flex w-full flex-col overflow-hidden bg-surface lg:w-[45%]">
        {/* Subtle warm radial glow behind form area */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 90% 70% at 50% 55%, rgba(230,210,180,0.18) 0%, transparent 70%)",
          }}
        />

        {/* Logo */}
        <div className="relative flex items-center gap-3 px-12 pt-9">
          <Image
            src="/hollis-logo.png"
            alt="Hollis"
            width={28}
            height={28}
            style={{ objectFit: "contain" }}
            priority
          />
          <span className="font-display text-xl font-semibold tracking-tight text-text-primary">
            Hollis
          </span>
        </div>

        {/* Form */}
        <div className="relative flex flex-1 items-center justify-center px-12 py-10">
          <div className="w-full max-w-[380px]">{children}</div>
        </div>

        {/* Footer */}
        <div className="relative px-12 pb-9">
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
          style={{
            background:
              "radial-gradient(circle, rgba(99,102,241,0.4) 0%, transparent 60%)",
          }}
        />
        <div
          className="pointer-events-none absolute -bottom-64 -left-32 h-[700px] w-[700px] rounded-full blur-[160px]"
          style={{
            background:
              "radial-gradient(circle, rgba(59,130,246,0.28) 0%, transparent 60%)",
          }}
        />
        <div
          className="pointer-events-none absolute top-1/2 left-1/4 h-[400px] w-[400px] -translate-y-1/2 rounded-full blur-[120px]"
          style={{
            background:
              "radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 65%)",
          }}
        />

        {/* Content */}
        <div className="relative z-10 flex w-full flex-col items-center px-8 pb-10">
          {/* Tagline above image */}
          <div className="mb-7 text-center">
            <p
              className="text-[11px] font-medium uppercase tracking-[0.18em]"
              style={{ color: "rgba(250,250,250,0.35)" }}
            >
              AI-powered renewal automation
            </p>
          </div>

          <Image
            src="/hollis-macbook.png"
            alt="Hollis dashboard"
            width={1100}
            height={720}
            className="w-full"
            style={{
              filter:
                "drop-shadow(0 32px 64px rgba(0,0,0,0.9)) drop-shadow(0 0 120px rgba(99,102,241,0.15))",
            }}
            priority
          />

          <div className="mt-7 text-center">
            <p
              className="text-[26px] font-semibold leading-tight tracking-tight"
              style={{ color: "rgba(250,250,250,0.92)" }}
            >
              Renewal automation,
            </p>
            <p
              className="text-[26px] font-semibold leading-tight tracking-tight"
              style={{ color: "rgba(250,250,250,0.3)" }}
            >
              on autopilot.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
