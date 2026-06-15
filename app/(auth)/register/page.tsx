import type { Metadata } from "next";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = {
  title: "Create your account · OG Truck Parts",
};

export default function RegisterPage() {
  return (
    <div className="grid gap-6">
      <div className="grid gap-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Create your account
        </h1>
        <p className="text-muted-foreground text-sm">
          Your name, phone, and address stay private — only your username and
          general location are ever public.
        </p>
      </div>
      <RegisterForm />
    </div>
  );
}
