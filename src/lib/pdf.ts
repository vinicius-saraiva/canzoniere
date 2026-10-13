import type { Browser } from "puppeteer-core";

/**
 * HTML → PDF with headless Chrome.
 * On Vercel: puppeteer-core + @sparticuz/chromium (a Lambda-sized Chromium build).
 * Locally: the Chrome that the `puppeteer` dev dependency downloads.
 */
async function launch(): Promise<Browser> {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromium = (await import("@sparticuz/chromium")).default;
    const puppeteer = await import("puppeteer-core");
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }
  const puppeteer = await import("puppeteer");
  return puppeteer.launch({ headless: true }) as unknown as Browser;
}

export async function htmlToPdf(html: string): Promise<Uint8Array> {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    return await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "16mm", right: "14mm", bottom: "16mm", left: "14mm" },
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate:
        '<div style="width:100%;font-size:9px;color:#888;text-align:center;font-family:Helvetica,Arial,sans-serif;"><span class="pageNumber"></span></div>',
    });
  } finally {
    await browser.close();
  }
}
