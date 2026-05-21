import Image from "next/image";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* ── Left panel: form ── */}
      <div className="relative flex w-full flex-col bg-surface lg:w-1/2">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-10 pt-8">
          <Image
            src="/hollis-logo.png"
            alt="Hollis"
            width={24}
            height={24}
            style={{ objectFit: "contain" }}
            priority
          />
          <span className="font-display text-lg font-semibold tracking-tight text-text-primary">
            Hollis
          </span>
        </div>

        {/* Form */}
        <div className="flex flex-1 items-center justify-center px-8 py-12">
          <div className="w-full max-w-sm">{children}</div>
        </div>

        {/* Footer */}
        <div className="px-10 pb-8">
          <p className="text-xs text-text-tertiary">
            By continuing, you agree to our{" "}
            <a href="#" className="underline underline-offset-2 hover:text-text-secondary transition-colors">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="#" className="underline underline-offset-2 hover:text-text-secondary transition-colors">
              Privacy Policy
            </a>
            .
          </p>
        </div>
      </div>

      {/* ── Right panel: dark + MacBook ── */}
      <div
        className="relative hidden overflow-hidden lg:flex lg:w-1/2 lg:flex-col lg:items-center lg:justify-center"
        style={{ background: "#0C0C0C" }}
      >
        {/* Gradient orbs */}
        <div
          className="pointer-events-none absolute -top-48 -right-48 h-[700px] w-[700px] rounded-full blur-[160px]"
          style={{ background: "radial-gradient(circle, rgba(99,102,241,0.35) 0%, transparent 65%)" }}
        />
        <div
          className="pointer-events-none absolute -bottom-48 -left-24 h-[600px] w-[600px] rounded-full blur-[140px]"
          style={{ background: "radial-gradient(circle, rgba(59,130,246,0.25) 0%, transparent 65%)" }}
        />
        <div
          className="pointer-events-none absolute top-1/3 left-1/3 h-[350px] w-[350px] rounded-full blur-[110px]"
          style={{ background: "radial-gradient(circle, rgba(16,185,129,0.12) 0%, transparent 65%)" }}
        />

        {/* Content */}
        <div className="relative z-10 flex w-full flex-col items-center px-10">
          <Image
            src="/hollis-macbook.png"
            alt="Hollis dashboard"
            width={900}
            height={580}
            className="w-full max-w-2xl"
            style={{ filter: "drop-shadow(0 40px 80px rgba(0,0,0,0.8))" }}
            priority
          />

          <div className="mt-8 text-center">
            <p className="text-[22px] font-semibold leading-snug tracking-tight" style={{ color: "rgba(250,250,250,0.9)" }}>
              Renewal automation,
            </p>
            <p className="text-[22px] font-semibold leading-snug tracking-tight" style={{ color: "rgba(250,250,250,0.35)" }}>
              on autopilot.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
