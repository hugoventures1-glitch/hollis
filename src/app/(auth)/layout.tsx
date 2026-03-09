export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0d0d12] px-4">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
