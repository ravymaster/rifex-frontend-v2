import { supabaseBrowser as supabase } from "@/lib/supabaseClient";

export default function GoogleButton({ label = "Continuar con Google", className = "" }) {
  async function signInGoogle() {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/oauth`,   // página callback (ver abajo)
        queryParams: { prompt: "select_account" }
      },
    });
  }

  return (
    <button
      type="button"
      onClick={signInGoogle}
      className={className}
      style={{
        display:"inline-flex", alignItems:"center", justifyContent:"center", gap:8,
        borderRadius:12, border:"1px solid #e5e7eb", background:"#fff",
        padding:"10px 14px", fontWeight:800
      }}
    >
      <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" width="18" height="18"/>
      {label}
    </button>
  );
}
