"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signUpAction(formData: {
  name: string;
  email: string;
  password: string;
}): Promise<{ error: string } | { needsConfirmation: true } | never> {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email: formData.email,
    password: formData.password,
    options: {
      data: {
        full_name: formData.name,
      },
    },
  });

  if (error) {
    return { error: error.message };
  }

  if (data.user) {
    const { error: agencyError } = await supabase.from("agencies").insert({
      name: `${formData.name}'s Agency`,
      user_id: data.user.id,
    });

    if (agencyError) {
      console.error("Failed to create agency:", agencyError.message);
    }
  }

  // Email confirmation is required — no active session yet
  if (!data.session) {
    return { needsConfirmation: true };
  }

  redirect("/dashboard");
}
