/** Bilingual (Urdu + English) sign-in code email (docs/05 §4). Plain text and simple HTML. */
export type OtpEmail = { subject: string; text: string; html: string };

export function buildOtpEmail(code: string, expiresMinutes: number): OtpEmail {
  const subject = `${code} — روشن روزگار کا کوڈ / Roshan Rozgar code`;
  const text = [
    `آپ کا سائن اِن کوڈ: ${code}`,
    `یہ کوڈ ${expiresMinutes} منٹ تک کارآمد ہے۔`,
    "ہم آپ سے یہ کوڈ کبھی نہیں مانگیں گے۔ اگر آپ نے نہیں مانگا تو اس ای میل کو نظرانداز کریں۔",
    "",
    `Your sign-in code: ${code}`,
    `It is valid for ${expiresMinutes} minutes.`,
    "We will never ask you for this code. If you did not request it, ignore this email.",
    "",
    "Sign-in is not identity verification. / سائن اِن شناخت کی تصدیق نہیں ہے۔",
  ].join("\n");
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#1a1a1a;max-width:480px;margin:auto;padding:16px">
<p dir="rtl" style="font-size:18px">آپ کا سائن اِن کوڈ:</p>
<p dir="ltr" style="font-size:36px;font-weight:bold;letter-spacing:8px;margin:8px 0">${code}</p>
<p dir="rtl">یہ کوڈ ${expiresMinutes} منٹ تک کارآمد ہے۔ ہم آپ سے یہ کوڈ کبھی نہیں مانگیں گے۔</p>
<hr style="border:none;border-top:1px solid #ddd">
<p>Your sign-in code is above. It is valid for ${expiresMinutes} minutes. We will never ask you for this code. If you did not request it, ignore this email.</p>
<p style="color:#666;font-size:13px">Sign-in is not identity verification.</p>
</body></html>`;
  return { subject, text, html };
}
