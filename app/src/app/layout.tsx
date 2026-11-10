import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/noto-sans-arabic/arabic-400.css";
import "@fontsource/noto-sans-arabic/arabic-600.css";
import "@fontsource/noto-sans-arabic/arabic-700.css";
import "@fontsource/noto-nastaliq-urdu/arabic-400.css";
import "@fontsource/noto-nastaliq-urdu/arabic-700.css";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { ToastProvider } from "@/components/ui/Toast";
import { VoiceProvider } from "@/components/voice/VoiceProvider";
import { getSession } from "@/lib/auth/guards";
import { getConfig } from "@/lib/config";
import { dirFor } from "@/lib/i18n";
import { I18nProvider } from "@/lib/i18n/client";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return {
    title: { default: t("app.name"), template: `%s · ${t("app.name")}` },
    description: t("app.tagline"),
    manifest: "/manifest.webmanifest",
    icons: { icon: "/icons/icon.svg", apple: "/icons/apple-touch-icon.png" },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f6b3e",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { lang } = await getT();
  const { ai } = getConfig();
  // /api/ai/speak is for signed-in users; signed out, a "Listen" button must not appear only to
  // fail on tap, so the voice model is offered only with a session (cached per request).
  const serverTts = ai.mode === "live" && ai.tts.configured && !!(await getSession());
  return (
    <html lang={lang} dir={dirFor(lang)}>
      <body>
        <I18nProvider lang={lang}>
          <VoiceProvider serverTts={serverTts}>
            <ToastProvider>{children}</ToastProvider>
          </VoiceProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
