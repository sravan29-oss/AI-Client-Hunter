import {
  ISearchProvider,
  DiscoveryFilter,
  SearchProviderResult,
  DiscoveredLead,
  ProviderStatus,
  ContactVerificationStatus,
} from '../types';
import { scraperService } from '../../scraper';
import { logger } from '../../../utils/logger';
import { safeFetchHtml, validatePublicUrl, WebsiteHttpError } from '../../../utils/ssrfProtection';

export class ManualInputProvider implements ISearchProvider {
  readonly id = 'manual_input';
  readonly name = 'Manual Website / Domain Verification';
  readonly description = 'Directly inspects genuine business domains respecting robots.txt and privacy rules.';

  isConfigured(): boolean {
    return true; // Always available as reliable fallback
  }

  getStatus(): ProviderStatus {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      configured: true,
      requiresApiKey: false,
      configurationKind: 'none',
      connectionState: 'ready',
      statusMessage: 'Ready. Inspect any live business domain or website URL directly.',
      isHealthy: true,
      error: null,
    };
  }

  async checkHealth(): Promise<ProviderStatus> {
    return this.getStatus();
  }

  async search(filters: DiscoveryFilter): Promise<SearchProviderResult> {
    const rawTarget = filters.domain || (filters as any).websiteUrl || (filters as any).searchQuery;
    if (!rawTarget) {
      return {
        providerId: this.id,
        providerName: this.name,
        leads: [],
        errors: 'Please specify a website URL or business domain to inspect.',
        totalFound: 0,
        timestamp: new Date().toISOString(),
      };
    }

    let url = rawTarget.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    try {
      const validated = await validatePublicUrl(url);
      const parsed = new URL(validated.normalizedUrl);
      const domain = parsed.hostname.replace(/^www\./, '');

      // 1. Check robots.txt (respect website terms and robots.txt)
      let robotsAllowed = true;
      try {
        const robots = await safeFetchHtml(new URL('/robots.txt', parsed).href);
        robotsAllowed = !robots.html.split(/\r?\n/).some((line) => /^\s*disallow\s*:\s*\/\s*(?:#.*)?$/i.test(line));
      } catch (error) {
        if (!(error instanceof WebsiteHttpError && [404, 410].includes(error.upstreamStatus))) throw error;
      }

      if (!robotsAllowed) {
        return {
          providerId: this.id,
          providerName: this.name,
          leads: [],
          errors: `Inspection blocked: ${domain}/robots.txt explicitly disallows automated inspection. Privacy and terms respected.`,
          totalFound: 0,
          timestamp: new Date().toISOString(),
        };
      }

      // 2. Scrape public homepage
      const scraped = await scraperService.scrapeUrl(validated.normalizedUrl);

      const businessName =
        filters.businessName ||
        scraped.pageTitle.split(/[-–|]/)[0].trim() ||
        domain.split('.')[0];

      const detectedProblems: string[] = [];
      let score = 70;

      if (!scraped.hasViewport) {
        detectedProblems.push('Missing mobile viewport (not mobile-responsive)');
        score += 15;
      }
      if (!scraped.hasSsl) {
        detectedProblems.push('Insecure connection (Missing SSL / HTTPS)');
        score += 15;
      }
      if (scraped.loadTimeMs > 2500) {
        detectedProblems.push(`High load latency (${scraped.loadTimeMs}ms) impacting Google PageSpeed & conversions`);
        score += 10;
      }
      if (scraped.detectedTech.length === 0) {
        detectedProblems.push('Legacy web architecture lacking modern component framework');
      }

      const verifiedEmail = scraped.emailsFound?.[0] || null;
      const verifiedPhone = scraped.phonesFound?.[0] || null;

      const contactStatus: ContactVerificationStatus = {
        websiteStatus: 'verified',
        phoneStatus: verifiedPhone ? 'verified' : 'unavailable',
        emailStatus: verifiedEmail ? 'verified' : 'unavailable',
      };

      const lead: DiscoveredLead = {
        businessName,
        website: scraped.url,
        country: filters.country,
        city: filters.city || null,
        industry: filters.industry || 'Technology',
        businessEmail: verifiedEmail,
        contactName: null,
        publicBusinessPhone: verifiedPhone,
        source: `Direct Domain Inspection (${domain})`,
        providerId: this.id,
        providerName: this.name,
        discoveryDate: new Date().toISOString(),
        detectedProblems,
        suggestedServices: filters.servicesRequired?.length
          ? filters.servicesRequired
          : ['Business website', 'React Native mobile application'],
        opportunityScore: Math.min(98, score),
        businessDescription: scraped.metaDescription || `Directly audited website: ${scraped.url}. Title: ${scraped.pageTitle}`,
        notes: `Load Time: ${scraped.loadTimeMs}ms. Tech: ${scraped.detectedTech.join(', ') || 'Custom Web'}.`,
        contactStatus,
        metadata: {
          loadTimeMs: scraped.loadTimeMs,
          techStack: scraped.detectedTech,
          hasSsl: scraped.hasSsl,
        },
      };

      return {
        providerId: this.id,
        providerName: this.name,
        leads: [lead],
        totalFound: 1,
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      logger.error('Manual domain inspection failed:', err.message);
      return {
        providerId: this.id,
        providerName: this.name,
        leads: [],
        errors: `Domain inspection failed: ${err.message}`,
        totalFound: 0,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
