import test, { describe, it } from 'node:test';
import assert from 'node:assert';
import { qualificationService } from '../services/qualificationService';
import { extractDomain } from '../utils/domain';
import { notificationService } from '../services/notificationService';
import { dailyReportService } from '../services/dailyReportService';
import { schedulerService } from '../services/schedulerService';

describe('Phase 9: AI Client Qualification Engine', () => {
  it('should qualify a business without a website as high opportunity with website development', async () => {
    const result = await qualificationService.qualifyLead({
      businessName: 'Apex Health Clinic',
      website: '',
      industry: 'Healthcare businesses',
      country: 'India',
      city: 'Bengaluru',
    });

    assert.ok(result.opportunityScore >= 70, `Score ${result.opportunityScore} should be >= 70`);
    assert.strictEqual(result.isEstimateOnly, true);
    assert.ok(result.suggestedServices.includes('Website development'));
    assert.ok(result.businessNeeds.length > 0);
    assert.ok(result.reasonForQualification.includes('Apex Health Clinic'));
    assert.ok(['Low', 'Medium', 'High'].includes(result.estimatedComplexity));
  });

  it('should evaluate technical DOM findings (missing SSL & mobile viewport) into evidence-based score', async () => {
    const result = await qualificationService.qualifyLead({
      businessName: 'Heritage Bakery Store',
      website: 'http://heritagebakery.local',
      industry: 'Retail stores',
      country: 'United Kingdom',
      city: 'London',
      evidence: {
        url: 'http://heritagebakery.local',
        finalUrl: 'http://heritagebakery.local',
        isHttps: false,
        hasSsl: false,
        hadHttpsRedirect: false,
        statusCode: 200,
        loadTimeMs: 1400,
        htmlSizeBytes: 24000,
        htmlSizeKb: 24,
        pageTitle: 'Heritage Bakery',
        pageTitleLength: 15,
        pageTitleStatus: 'optimal',
        metaDescription: '',
        metaDescriptionLength: 0,
        metaDescriptionStatus: 'missing',
        canonicalUrl: null,
        openGraph: {},
        hasTwitterCards: false,
        hasViewport: false, // Fails mobile responsiveness
        viewportContent: null,
        hasDeviceWidth: false,
        hasInitialScale: false,
        isResponsiveReady: false,
        h1Count: 1,
        h1List: ['Welcome'],
        h2Count: 0,
        h2List: [],
        h3Count: 0,
        hasNavigation: false,
        navLinksCount: 0,
        navItems: [],
        emptyNavLinksCount: 0,
        emailsFound: [],
        phonesFound: [],
        hasContactForm: false,
        hasWhatsApp: false,
        socialLinks: {},
        totalLinksCount: 2,
        internalLinksCount: 2,
        externalLinksCount: 0,
        emptyLinksCount: 0,
        pageStructure: {
          hasHeader: false,
          hasMain: false,
          hasFooter: false,
          hasSection: false,
          hasArticle: false,
          hasAside: false,
        },
        totalImagesCount: 5,
        imagesMissingAltCount: 4,
        imagesWithAltCount: 1,
        hasHtmlLang: true,
        htmlLangValue: 'en',
        hasAriaAttributes: false,
        scriptTagsCount: 1,
        externalScriptsCount: 0,
        inlineScriptsCount: 1,
        stylesheetCount: 1,
        lazyLoadedImagesCount: 0,
        hasFavicon: false,
        detectedTech: ['Apache'],
        bodySample: 'Bakery in central london',
      },
    });

    assert.ok(result.opportunityScore >= 75, `Expected score >= 75 for multiple technical flaws, got ${result.opportunityScore}`);
    assert.ok(result.businessNeeds.some((n) => n.toLowerCase().includes('https') || n.toLowerCase().includes('ssl')));
    assert.ok(result.businessNeeds.some((n) => n.toLowerCase().includes('viewport') || n.toLowerCase().includes('mobile')));
    assert.ok(result.evidence.includes('HTTP without HTTPS') || result.evidence.includes('Missing viewport'));
  });
});

describe('Phase 9: Domain Normalization & Duplicate Prevention', () => {
  it('should accurately normalize domains across varied URL formats', () => {
    assert.strictEqual(extractDomain('https://www.example.com/about/contact'), 'example.com');
    assert.strictEqual(extractDomain('http://example.com/'), 'example.com');
    assert.strictEqual(extractDomain('WWW.SHOP-EXAMPLE.CO.UK/products?id=12'), 'shop-example.co.uk');
    assert.strictEqual(extractDomain('subdomain.techcorp.io/app'), 'subdomain.techcorp.io');
    assert.strictEqual(extractDomain(''), '');
    assert.strictEqual(extractDomain(null), '');
    assert.strictEqual(extractDomain(undefined), '');
  });
});

describe('Phase 9: In-App & Multi-Channel Notification Service', () => {
  it('should create and retrieve in-app notifications', async () => {
    const created = await notificationService.createInAppNotification({
      title: 'Test Lead Alert',
      message: 'Discovered high-value startup in Bengaluru',
      type: 'LEAD_QUALIFIED',
      metadata: { score: 90 },
    });

    assert.ok(created);
    assert.strictEqual(created.title, 'Test Lead Alert');

    const unread = await notificationService.getUnreadCount();
    assert.ok(unread >= 1);

    if (created.id) {
      const updated = await notificationService.markAsRead(created.id);
      assert.ok(updated);
      assert.strictEqual(updated.read, true);
    }
  });

  it('should gracefully handle unconfigured SMTP email without throwing', async () => {
    const sent = await notificationService.sendEmailNotification(
      'client@example.com',
      'Test Alert',
      '<p>Test</p>'
    );
    // When SMTP credentials are not set in .env, it safely logs simulation and returns false
    assert.strictEqual(typeof sent, 'boolean');
  });

  it('should gracefully handle unconfigured Telegram without throwing', async () => {
    const sent = await notificationService.sendTelegramNotification('Test alert message');
    // When TELEGRAM_BOT_TOKEN is not set in .env, it safely skips and returns false
    assert.strictEqual(sent, false);
  });
});

describe('Phase 9: Daily Lead Reports & CSV Export', () => {
  it('should generate a structured daily acquisition report', async () => {
    const report = await dailyReportService.generateDailyReport(new Date());

    assert.ok(report);
    assert.strictEqual(typeof report.businessesDiscovered, 'number');
    assert.strictEqual(typeof report.qualifiedLeads, 'number');
    assert.strictEqual(typeof report.highOpportunityLeads, 'number');
    assert.strictEqual(typeof report.websitesAnalyzed, 'number');
    assert.strictEqual(typeof report.duplicatesSkipped, 'number');
    assert.strictEqual(typeof report.failedSearches, 'number');
    assert.ok(report.summary.length > 10);
  });

  it('should export daily report as CSV with summary and header metadata', async () => {
    const report = await dailyReportService.generateDailyReport(new Date());
    assert.ok(report.id);

    const { filename, csv } = await dailyReportService.exportDailyReportCsv(report.id);

    assert.ok(filename.endsWith('.csv'));
    assert.ok(csv.includes('AI CLIENT HUNTER DAILY REPORT SUMMARY'));
    assert.ok(csv.includes('Total Businesses Discovered'));
    assert.ok(csv.includes('Qualified Leads'));
    assert.ok(csv.includes('Business Name,Website,Country'));
  });
});

describe('Phase 9: Autonomous Search Scheduler', () => {
  it('should load and update configuration with valid defaults', async () => {
    const config = await schedulerService.getConfig();
    assert.ok(config);
    assert.ok(Array.isArray(config.targetCountries));
    assert.ok(Array.isArray(config.targetIndustries));
    assert.strictEqual(typeof config.minOpportunityScore, 'number');

    const updated = await schedulerService.updateConfig({
      scheduledTime: '10:30',
      minOpportunityScore: 65,
    });

    assert.strictEqual(updated.scheduledTime, '10:30');
    assert.strictEqual(updated.minOpportunityScore, 65);
  });

  it('should return operational status with lock and schedule timestamps', async () => {
    const status = await schedulerService.getStatus();
    assert.strictEqual(typeof status.isRunning, 'boolean');
    assert.strictEqual(typeof status.enabled, 'boolean');
    assert.strictEqual(typeof status.scheduleMode, 'string');
    assert.strictEqual(typeof status.scheduledTime, 'string');
    assert.strictEqual(typeof status.unreadNotifications, 'number');
  });

  it('should support safe stop / abort mechanism', () => {
    const stopped = schedulerService.stopCurrentRun();
    // When no cycle is running, returns false safely without error
    assert.strictEqual(typeof stopped, 'boolean');
  });
});
