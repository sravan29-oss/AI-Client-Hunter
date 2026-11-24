import test, { describe, it } from 'node:test';
import assert from 'node:assert';
import * as cheerio from 'cheerio';

describe('Website Scraper & DOM Evidence Inspection', () => {
  const sampleHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <title>Apex Digital Health - Modern Telehealth Services</title>
      <meta name="description" content="Apex Digital Health provides online consultation, diagnostic bookings, and digital medical records for patients worldwide.">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta property="og:title" content="Apex Digital Health">
      <meta property="og:description" content="Online telehealth consultations">
      <link rel="canonical" href="https://apexdigitalhealth.io">
    </head>
    <body>
      <header>
        <nav>
          <a href="/services">Services</a>
          <a href="/doctors">Doctors</a>
          <a href="/contact">Contact</a>
          <a href="#">Empty Link</a>
        </nav>
      </header>
      <main>
        <h1>Next-Generation Digital Telehealth</h1>
        <h2>Online Consultations</h2>
        <p>Book expert appointments in 2 minutes.</p>
        <img src="/banner.png" alt="Telehealth banner">
        <img src="/doctor.jpg"> <!-- missing alt -->
        <a href="mailto:support@apexdigitalhealth.io">Email Us</a>
        <a href="tel:+919876543210">Call Us</a>
        <a href="https://wa.me/919876543210">Chat on WhatsApp</a>
      </main>
      <footer>
        <p>&copy; 2026 Apex Digital Health</p>
      </footer>
    </body>
    </html>
  `;

  it('should accurately inspect title and meta description lengths', () => {
    const $ = cheerio.load(sampleHtml);
    const title = $('title').text().trim();
    const metaDesc = $('meta[name="description"]').attr('content')?.trim() || '';

    assert.strictEqual(title, 'Apex Digital Health - Modern Telehealth Services');
    assert.ok(title.length > 30 && title.length < 65, 'Title should be in optimal range');
    assert.ok(metaDesc.length > 50 && metaDesc.length < 165, 'Meta description should be in optimal range');
  });

  it('should detect mobile viewport meta tag with device-width and initial-scale', () => {
    const $ = cheerio.load(sampleHtml);
    const viewport = $('meta[name="viewport"]').attr('content') || '';

    assert.ok(viewport.includes('width=device-width'), 'Must have width=device-width');
    assert.ok(viewport.includes('initial-scale=1'), 'Must have initial-scale=1');
  });

  it('should detect contact options: email, phone, and WhatsApp', () => {
    const $ = cheerio.load(sampleHtml);
    const emails: string[] = [];
    const phones: string[] = [];
    let hasWhatsApp = false;

    $('a[href^="mailto:"]').each((_, el) => {
      emails.push($(el).attr('href')!.replace('mailto:', '').split('?')[0]);
    });
    $('a[href^="tel:"]').each((_, el) => {
      phones.push($(el).attr('href')!.replace('tel:', ''));
    });
    $('a[href*="wa.me"]').each(() => {
      hasWhatsApp = true;
    });

    assert.strictEqual(emails.length, 1);
    assert.strictEqual(emails[0], 'support@apexdigitalhealth.io');
    assert.strictEqual(phones.length, 1);
    assert.strictEqual(phones[0], '+919876543210');
    assert.strictEqual(hasWhatsApp, true, 'WhatsApp click-to-chat must be detected');
  });

  it('should detect images missing alt attributes', () => {
    const $ = cheerio.load(sampleHtml);
    const totalImages = $('img').length;
    let missingAlt = 0;

    $('img').each((_, el) => {
      const alt = $(el).attr('alt');
      if (!alt || alt.trim() === '') missingAlt++;
    });

    assert.strictEqual(totalImages, 2);
    assert.strictEqual(missingAlt, 1, 'Exactly 1 image should be missing alt attribute');
  });

  it('should inspect HTML5 semantic landmarks', () => {
    const $ = cheerio.load(sampleHtml);
    assert.strictEqual($('header').length > 0, true, 'Header present');
    assert.strictEqual($('main').length > 0, true, 'Main present');
    assert.strictEqual($('nav').length > 0, true, 'Nav present');
    assert.strictEqual($('footer').length > 0, true, 'Footer present');
  });
});
