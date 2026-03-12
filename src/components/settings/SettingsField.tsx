interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}

export function SettingsField({ label, hint, error, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[13px] font-medium text-[#c5c5cb]">{label}</label>
      {children}
      {hint && !error && <p className="text-[12px] text-zinc-500 leading-snug">{hint}</p>}
      {error && <p className="text-[12px] text-red-400">{error}</p>}
    </div>
  );
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export function SettingsInput({ error, className = "", ...props }: InputProps) {
  return (
    <input
      {...props}
      className={`w-full px-3 py-2 rounded-md bg-[#111111] border ${
        error ? "border-red-500/60" : "border-[#2a2a36]"
      } text-[14px] text-[#f5f5f7] placeholder-[#333333] focus:outline-none focus:border-[#555555] focus:ring-1 focus:ring-0 transition-colors ${className}`}
    />
  );
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export function SettingsTextarea({ error, className = "", ...props }: TextareaProps) {
  return (
    <textarea
      {...props}
      className={`w-full px-3 py-2 rounded-md bg-[#111111] border ${
        error ? "border-red-500/60" : "border-[#2a2a36]"
      } text-[14px] text-[#f5f5f7] placeholder-[#333333] focus:outline-none focus:border-[#555555] focus:ring-1 focus:ring-0 transition-colors resize-none ${className}`}
    />
  );
}
