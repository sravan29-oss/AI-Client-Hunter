import * as cheerio from 'cheerio';
import { safeFetchHtml, SafeFetchResult } from '../utils/ssrfProtection';

export interface WebsiteEvidence {
  url: string;
  finalUrl: string;
  isHttps: boolean;
  hasSsl: boolean;
  hadHttpsRedirect: boolean;
  statusCode: number;
  loadTimeMs: number;
  htmlSizeBytes: number;
  htmlSizeKb: number;

  // Title & Meta
  pageTitle: string;
  pageTitleLength: number;
  pageTitleStatus: 'optimal' | 'too_short' | 'too_long' | 'missing';
  metaDescription: string;
  metaDescriptionLength: number;
  metaDescriptionStatus: 'optimal' | 'too_short' | 'too_long' | 'missing';
  canonicalUrl: string | null;
  openGraph: {
    title?: string;
    description?: string;
    image?: string;
    siteName?: string;
  };
  hasTwitterCards: boolean;

  // Mobile Viewport
  hasViewport: boolean;
  viewportContent: string | null;
  hasDeviceWidth: boolean;
  hasInitialScale: boolean;
  isResponsiveReady: boolean;

  // Headings & Navigation
  h1Count: number;
  h1List: string[];
  h2Count: number;
  h2List: string[];
  h3Count: number;
  hasNavigation: boolean;
  navLinksCount: number;
  navItems: string[];
  emptyNavLinksCount: number;

  // Contact Options
  emailsFound: string[];
  phonesFound: string[];
  hasContactForm: boolean;
  hasWhatsApp: boolean;
  socialLinks: Record<string, string>;

  // Links & Page Structure
  totalLinksCount: number;
  internalLinksCount: number;
  externalLinksCount: number;
  emptyLinksCount: number;
  pageStructure: {
    hasHeader: boolean;
    hasMain: boolean;
    hasFooter: boolean;
    hasSection: boolean;
    hasArticle: boolean;
    hasAside: boolean;
  };

  // Accessibility & Performance Signs
  totalImagesCount: number;
  imagesMissingAltCount: number;
  imagesWithAltCount: number;
  hasHtmlLang: boolean;
  htmlLangValue: string | null;
  hasAriaAttributes: boolean;

  scriptTagsCount: number;
  externalScriptsCount: number;
  inlineScriptsCount: number;
  stylesheetCount: number;
  lazyLoadedImagesCount: number;
  hasFavicon: boolean;

  // Tech & Content Sample
  detectedTech: string[];
  bodySample: string;
  commerceIndicators?: string[];
}

export class ScraperService {
  /**
   * Safely fetches and performs a deep technical and structural audit of a public website.
   */
  async scrapeUrl(rawUrl: string): Promise<WebsiteEvidence> {
    const fetchResult: SafeFetchResult = await safeFetchHtml(rawUrl);
    const html = fetchResult.html;
    const $ = cheerio.load(html);

    // 1. Page Title
    const pageTitle =
      $('title').first().text().trim() ||
      $('meta[property="og:title"]').attr('content')?.trim() ||
      '';
    const pageTitleLength = pageTitle.length;
    let pageTitleStatus: 'optimal' | 'too_short' | 'too_long' | 'missing' = 'optimal';
    if (!pageTitleLength) pageTitleStatus = 'missing';
    else if (pageTitleLength < 15) pageTitleStatus = 'too_short';
    else if (pageTitleLength > 65) pageTitleStatus = 'too_long';

    // 2. Meta Description
    const metaDescription =
      $('meta[name="description"]').attr('content')?.trim() ||
      $('meta[property="og:description"]').attr('content')?.trim() ||
      '';
    const metaDescriptionLength = metaDescription.length;
    let metaDescriptionStatus: 'optimal' | 'too_short' | 'too_long' | 'missing' = 'optimal';
    if (!metaDescriptionLength) metaDescriptionStatus = 'missing';
    else if (metaDescriptionLength < 40) metaDescriptionStatus = 'too_short';
    else if (metaDescriptionLength > 165) metaDescriptionStatus = 'too_long';

    // Canonical & Social tags
    const canonicalUrl = $('link[rel="canonical"]').attr('href') || null;
    const openGraph = {
      title: $('meta[property="og:title"]').attr('content')?.trim(),
      description: $('meta[property="og:description"]').attr('content')?.trim(),
      image: $('meta[property="og:image"]').attr('content')?.trim(),
      siteName: $('meta[property="og:site_name"]').attr('content')?.trim(),
    };
    const hasTwitterCards = $('meta[name^="twitter:"]').length > 0;

    // 3. Mobile Viewport Configuration
    const viewportTag = $('meta[name="viewport"]');
    const hasViewport = viewportTag.length > 0;
    const viewportContent = viewportTag.attr('content') || null;
    const hasDeviceWidth = Boolean(viewportContent && viewportContent.toLowerCase().includes('width=device-width'));
    const hasInitialScale = Boolean(viewportContent && viewportContent.toLowerCase().includes('initial-scale=1'));
    const isResponsiveReady = hasViewport && hasDeviceWidth;

    // 4. Headings
    const h1List: string[] = [];
    $('h1').each((_, el) => {
      const text = $(el).text().trim().replace(/\s+/g, ' ');
      if (text && !h1List.includes(text)) h1List.push(text.slice(0, 120));
    });

    const h2List: string[] = [];
    $('h2').each((_, el) => {
      const text = $(el).text().trim().replace(/\s+/g, ' ');
      if (text && !h2List.includes(text) && h2List.length < 8) h2List.push(text.slice(0, 100));
    });

    const h3Count = $('h3').length;

    // 5. Navigation
    const navTags = $('nav, header');
    const hasNavigation = navTags.length > 0;
    const navItems: string[] = [];
    let emptyNavLinksCount = 0;

    navTags.find('a').each((_, el) => {
      const text = $(el).text().trim().replace(/\s+/g, ' ');
      const href = $(el).attr('href')?.trim();
      if (!href || href === '#' || href === 'javascript:void(0)') {
        emptyNavLinksCount++;
      }
      if (text && text.length > 1 && text.length < 35 && !navItems.includes(text) && navItems.length < 12) {
        navItems.push(text);
      }
    });

    // 6. Visible Contact Options
    const emailsFound: string[] = [];
    $('a[href^="mailto:"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const email = href.replace(/^mailto:/i, '').split('?')[0].trim().toLowerCase();
      if (email && !emailsFound.includes(email)) emailsFound.push(email);
    });

    const phonesFound: string[] = [];
    $('a[href^="tel:"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const phone = href.replace(/^tel:/i, '').trim();
      if (phone && !phonesFound.includes(phone)) phonesFound.push(phone);
    });

    // Check for contact forms
    const hasContactForm =
      $('form').filter((_, el) => {
        const formHtml = $(el).html() || '';
        return (
          formHtml.includes('email') ||
          formHtml.includes('message') ||
          formHtml.includes('contact') ||
          formHtml.includes('submit')
        );
      }).length > 0;

    // Check for WhatsApp
    const hasWhatsApp =
      $('a[href*="wa.me"], a[href*="api.whatsapp.com"], a[href*="whatsapp"]').length > 0;

    // Social Media Links
    const socialLinks: Record<string, string> = {};
    const socialHosts: Record<string, string> = {
      'linkedin.com': 'linkedin', 'twitter.com': 'twitter', 'x.com': 'twitter',
      'instagram.com': 'instagram', 'facebook.com': 'facebook', 'youtube.com': 'youtube', 'github.com': 'github',
    };
    $('a[href]').each((_, el) => {
      try {
        const url = new URL($(el).attr('href') || '', fetchResult.finalUrl);
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || !url.pathname.replaceAll('/', '')) return;
        const host = url.hostname.toLowerCase().replace(/^(www|m)\./, '');
        const platform = Object.hasOwn(socialHosts, host) ? socialHosts[host] : undefined;
        if (platform && !socialLinks[platform]) socialLinks[platform] = url.href.slice(0, 1000);
      } catch { /* Unusable source link. */ }
    });

    // 7. Links and Page Structure
    let internalLinksCount = 0;
    let externalLinksCount = 0;
    let emptyLinksCount = 0;
    const baseHostname = new URL(fetchResult.finalUrl).hostname.replace(/^www\./, '');

    $('a').each((_, el) => {
      const href = $(el).attr('href')?.trim();
      if (!href || href === '#' || href === 'javascript:void(0)') {
        emptyLinksCount++;
      } else if (href.startsWith('/') || href.startsWith('#') || href.includes(baseHostname)) {
        internalLinksCount++;
      } else if (href.startsWith('http://') || href.startsWith('https://')) {
        externalLinksCount++;
      }
    });

    const pageStructure = {
      hasHeader: $('header').length > 0,
      hasMain: $('main').length > 0,
      hasFooter: $('footer').length > 0,
      hasSection: $('section').length > 0,
      hasArticle: $('article').length > 0,
      hasAside: $('aside').length > 0,
    };

    // 8. Accessibility & Performance Signs
    const totalImagesCount = $('img').length;
    let imagesMissingAltCount = 0;
    let lazyLoadedImagesCount = 0;

    $('img').each((_, el) => {
      const alt = $(el).attr('alt');
      if (alt === undefined || alt === null || alt.trim() === '') {
        imagesMissingAltCount++;
      }
      const loadingAttr = $(el).attr('loading');
      if (loadingAttr === 'lazy') {
        lazyLoadedImagesCount++;
      }
    });

    const htmlLangValue = $('html').attr('lang') || null;
    const hasHtmlLang = Boolean(htmlLangValue && htmlLangValue.trim().length > 0);
    const hasAriaAttributes = $('[aria-label], [role], [aria-hidden], [aria-expanded]').length > 0;

    const scriptTags = $('script');
    let externalScriptsCount = 0;
    let inlineScriptsCount = 0;

    scriptTags.each((_, el) => {
      if ($(el).attr('src')) externalScriptsCount++;
      else inlineScriptsCount++;
    });

    const stylesheetCount = $('link[rel="stylesheet"]').length;
    const hasFavicon = $('link[rel*="icon"]').length > 0;

    // 9. Tech Detection
    const detectedTech: string[] = [];
    const scriptsConcat = scriptTags
      .map((_, el) => $(el).attr('src') || $(el).html() || '')
      .get()
      .join(' ')
      .toLowerCase();

    const metaGenerator = $('meta[name="generator"]').attr('content')?.toLowerCase() || '';

    if (metaGenerator.includes('wordpress') || scriptsConcat.includes('wp-content') || html.includes('wp-includes')) {
      detectedTech.push('WordPress');
    }
    if (scriptsConcat.includes('shopify') || html.includes('cdn.shopify.com')) {
      detectedTech.push('Shopify');
    }
    if (metaGenerator.includes('wix') || html.includes('wix.com')) {
      detectedTech.push('Wix');
    }
    if (metaGenerator.includes('squarespace') || html.includes('squarespace.com')) {
      detectedTech.push('Squarespace');
    }
    if (html.includes('__next') || $('div#__next').length > 0) {
      detectedTech.push('Next.js');
    } else if (scriptsConcat.includes('react') || $('[data-reactroot]').length > 0) {
      detectedTech.push('React');
    }
    if (html.includes('__nuxt') || scriptsConcat.includes('vue')) {
      detectedTech.push('Vue.js / Nuxt');
    }
    if (scriptsConcat.includes('jquery')) {
      detectedTech.push('jQuery');
    }
    if (scriptsConcat.includes('bootstrap') || html.includes('bootstrap')) {
      detectedTech.push('Bootstrap');
    }
    if (scriptsConcat.includes('tailwind') || html.includes('tailwind')) {
      detectedTech.push('Tailwind CSS');
    }
    if (scriptsConcat.includes('google-analytics') || scriptsConcat.includes('gtag') || scriptsConcat.includes('googletagmanager')) {
      detectedTech.push('Google Analytics');
    }
    if (scriptsConcat.includes('facebook') || scriptsConcat.includes('fbevents')) {
      detectedTech.push('Meta Pixel');
    }
    if (scriptsConcat.includes('razorpay')) {
      detectedTech.push('Razorpay Gateway');
    }
    if (scriptsConcat.includes('stripe')) {
      detectedTech.push('Stripe Gateway');
    }

    const commerceIndicators = [
      ['product catalogue link', $('a[href*="/products"], a[href*="/catalogue"], a[href*="/catalog"]').length],
      ['shopping cart link', $('a[href*="/cart"]').length],
      ['checkout link', $('a[href*="/checkout"]').length],
    ].flatMap(([label, count]) => Number(count) > 0 ? [String(label)] : []);

    // Meaningful body sample
    $('script, style, noscript, svg, nav, footer, iframe').remove();
    const bodySample = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 1500);

    return {
      url: fetchResult.url,
      finalUrl: fetchResult.finalUrl,
      isHttps: fetchResult.isHttps,
      hasSsl: fetchResult.isHttps,
      hadHttpsRedirect: fetchResult.hadHttpsRedirect,
      statusCode: fetchResult.statusCode,
      loadTimeMs: fetchResult.loadTimeMs,
      htmlSizeBytes: fetchResult.contentLength,
      htmlSizeKb: Math.round((fetchResult.contentLength / 1024) * 10) / 10,

      pageTitle,
      pageTitleLength,
      pageTitleStatus,
      metaDescription,
      metaDescriptionLength,
      metaDescriptionStatus,
      canonicalUrl,
      openGraph,
      hasTwitterCards,

      hasViewport,
      viewportContent,
      hasDeviceWidth,
      hasInitialScale,
      isResponsiveReady,

      h1Count: h1List.length,
      h1List,
      h2Count: h2List.length,
      h2List,
      h3Count,
      hasNavigation,
      navLinksCount: navTags.find('a').length,
      navItems,
      emptyNavLinksCount,

      emailsFound,
      phonesFound,
      hasContactForm,
      hasWhatsApp,
      socialLinks,

      totalLinksCount: $('a').length,
      internalLinksCount,
      externalLinksCount,
      emptyLinksCount,
      pageStructure,

      totalImagesCount,
      imagesMissingAltCount,
      imagesWithAltCount: totalImagesCount - imagesMissingAltCount,
      hasHtmlLang,
      htmlLangValue,
      hasAriaAttributes,

      scriptTagsCount: scriptTags.length,
      externalScriptsCount,
      inlineScriptsCount,
      stylesheetCount,
      lazyLoadedImagesCount,
      hasFavicon,

      detectedTech: Array.from(new Set(detectedTech)),
      bodySample,
      commerceIndicators,
    };
  }
}

export const scraperService = new ScraperService();

export async function safeScrapeWebsite(targetUrl: string): Promise<WebsiteEvidence> {
  return scraperService.scrapeUrl(targetUrl);
}
