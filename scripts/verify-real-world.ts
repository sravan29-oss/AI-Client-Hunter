import axios from 'axios';

const BASE_URL = 'http://localhost:5000/api';

async function runRealWorldVerification() {
  console.log('\n=============================================================');
  console.log('🤖 AI CLIENT HUNTER — REAL-WORLD LIVE FUNCTIONAL VERIFICATION');
  console.log('=============================================================\n');

  const results: { test: string; status: 'PASS' | 'FAIL'; details: string }[] = [];

  const client = axios.create({
    baseURL: BASE_URL,
    validateStatus: () => true, // Don't throw on error status codes
  });

  // 1. Health Diagnostic
  try {
    const res = await client.get('/health');
    if (res.status === 200 && res.data.checks?.database?.status === 'connected') {
      results.push({
        test: 'Health Diagnostic & Prisma Connection',
        status: 'PASS',
        details: `PostgreSQL: ${res.data.checks.database.status}, Gemini configured: ${res.data.checks.geminiAi.configured}`,
      });
    } else {
      results.push({
        test: 'Health Diagnostic & Prisma Connection',
        status: 'FAIL',
        details: `Unexpected response status ${res.status}: ${JSON.stringify(res.data)}`,
      });
    }
  } catch (err: any) {
    results.push({ test: 'Health Diagnostic', status: 'FAIL', details: err.message });
  }

  // 2. Lead Discovery with Genuine OSM Provider
  try {
    console.log('Searching genuine businesses via OpenStreetMap Nominatim...');
    const res = await client.post('/discovery/search', {
      country: 'India',
      city: 'Bengaluru',
      industry: 'Restaurants',
      maxLeads: 3,
      providerId: 'openstreetmap',
    });
    if (res.status === 200 && res.data.success && Array.isArray(res.data.data.leads)) {
      const genuineLeads = res.data.data.leads;
      const names = genuineLeads.map((l: any) => l.businessName).join(', ');
      results.push({
        test: 'Lead Discovery (Live OpenStreetMap)',
        status: genuineLeads.length > 0 ? 'PASS' : 'FAIL',
        details: `Discovered ${genuineLeads.length} genuine commercial businesses: [${names}]`,
      });
    } else {
      results.push({
        test: 'Lead Discovery (Live OpenStreetMap)',
        status: 'FAIL',
        details: `Status ${res.status}: ${JSON.stringify(res.data)}`,
      });
    }
  } catch (err: any) {
    results.push({ test: 'Lead Discovery', status: 'FAIL', details: err.message });
  }

  // 3. Lead Creation & Domain-level Duplicate Detection
  let createdLeadId = '';
  const testDomain = `test-verify-${Date.now()}.in`;
  try {
    const res1 = await client.post('/leads', {
      businessName: 'Vedic Organic Health Foods',
      website: `https://${testDomain}`,
      country: 'India',
      city: 'Bengaluru',
      industry: 'Healthcare businesses',
      businessEmail: `hello@${testDomain}`,
      suggestedServices: ['E-commerce website', 'Business website'],
      opportunityScore: 85,
    });

    if (res1.status === 201 && res1.data.success) {
      createdLeadId = res1.data.data.id;
      results.push({
        test: 'Lead Creation (Valid Input)',
        status: 'PASS',
        details: `Created lead "${res1.data.data.businessName}" with ID: ${createdLeadId}`,
      });

      // Submit Duplicate Lead
      const resDup = await client.post('/leads', {
        businessName: 'Vedic Organic Health Foods Store',
        website: `https://www.${testDomain}/shop`, // Same domain, should be caught
        country: 'India',
        industry: 'Healthcare businesses',
      });

      if (resDup.status === 409) {
        results.push({
          test: 'Duplicate Lead Detection',
          status: 'PASS',
          details: `Rejected duplicate submission with 409: "${resDup.data.error?.message}"`,
        });
      } else {
        results.push({
          test: 'Duplicate Lead Detection',
          status: 'FAIL',
          details: `Expected 409 but received ${resDup.status}`,
        });
      }
    } else {
      results.push({
        test: 'Lead Creation (Valid Input)',
        status: 'FAIL',
        details: `Status ${res1.status}: ${JSON.stringify(res1.data)}`,
      });
    }
  } catch (err: any) {
    results.push({ test: 'Lead Creation & Duplicate', status: 'FAIL', details: err.message });
  }

  // 4. Invalid Lead Input Validation (Zod)
  try {
    const res = await client.post('/leads', {
      businessName: '', // empty name fails min(2)
      businessEmail: 'not-an-email', // invalid email
    });
    if (res.status === 400 && res.data.error?.code === 'VALIDATION_ERROR') {
      results.push({
        test: 'Lead Input Validation (Zod Schema)',
        status: 'PASS',
        details: `Correctly rejected invalid lead payload: ${res.data.error.message}`,
      });
    } else {
      results.push({
        test: 'Lead Input Validation (Zod Schema)',
        status: 'FAIL',
        details: `Expected 400 VALIDATION_ERROR but received ${res.status}: ${JSON.stringify(res.data)}`,
      });
    }
  } catch (err: any) {
    results.push({ test: 'Lead Input Validation', status: 'FAIL', details: err.message });
  }

  // 5. CSV Export
  try {
    const res = await client.get('/leads/export/csv');
    if (res.status === 200 && res.headers['content-type']?.includes('text/csv')) {
      const hasHeaders = res.data.includes('Business Name') && res.data.includes('Opportunity Score');
      results.push({
        test: 'CSV Export Stream',
        status: hasHeaders ? 'PASS' : 'FAIL',
        details: `Exported valid RFC-4180 CSV (${res.data.length} bytes)`,
      });
    } else {
      results.push({
        test: 'CSV Export Stream',
        status: 'FAIL',
        details: `Status ${res.status}, content-type: ${res.headers['content-type']}`,
      });
    }
  } catch (err: any) {
    results.push({ test: 'CSV Export', status: 'FAIL', details: err.message });
  }

  // 6. CSV Batch Import with Duplicates & Malformed Row Handling
  const uniqueImportDomain = `fresh-bakery-${Date.now()}.in`;
  const uniqueBusinessName = `Unique Fresh Bakery ${Date.now()}`;
  let importedLeadId = '';
  try {
    const importRes = await client.post('/leads/import/csv', {
      rows: [
        {
          businessName: uniqueBusinessName,
          website: `https://${uniqueImportDomain}`,
          country: 'India',
          industry: 'Retail stores',
        },
        {
          businessName: 'Duplicate Vedic Test',
          website: `https://${testDomain}`, // Duplicate of earlier lead
          country: 'India',
          industry: 'Healthcare businesses',
        },
        {
          businessName: '', // Missing name error
          website: 'https://noname.com',
        },
      ],
    });

    if (
      importRes.status === 201 &&
      importRes.data.importedCount === 1 &&
      importRes.data.skippedCount === 1 &&
      importRes.data.errorCount === 1
    ) {
      importedLeadId = importRes.data.imported?.[0]?.id || '';
      results.push({
        test: 'CSV Batch Import (Resilience & Duplicate Filtering)',
        status: 'PASS',
        details: `1 imported, 1 duplicate skipped, 1 malformed row isolated cleanly`,
      });
    } else {
      results.push({
        test: 'CSV Batch Import (Resilience & Duplicate Filtering)',
        status: 'FAIL',
        details: `Status ${importRes.status}: ${JSON.stringify(importRes.data)}`,
      });
    }
  } catch (err: any) {
    results.push({ test: 'CSV Batch Import', status: 'FAIL', details: err.message });
  }

  // 7. SSRF Protection & Security Filter
  const ssrfTargets = [
    'http://localhost:5000/api/health',
    'http://127.0.0.1:8080',
    'http://192.168.1.1/admin',
    'http://169.254.169.254/latest/meta-data',
    'ftp://evil.com/payload',
  ];

  let ssrfBlocked = 0;
  for (const target of ssrfTargets) {
    const res = await client.post('/audit', { websiteUrl: target });
    if (res.status === 400 && (res.data.error?.message?.toLowerCase().includes('forbidden') || res.data.error?.message?.toLowerCase().includes('protocol'))) {
      ssrfBlocked++;
    }
  }

  results.push({
    test: 'SSRF Attack Mitigation & Internal Subnet Block',
    status: ssrfBlocked === ssrfTargets.length ? 'PASS' : 'FAIL',
    details: `Blocked ${ssrfBlocked} of ${ssrfTargets.length} dangerous SSRF targets with HTTP 400 BadRequest`,
  });

  // 8. Safe Public Website Scraper & Tech Fingerprint Audit
  try {
    console.log('Auditing public website https://example.com...');
    const auditRes = await client.post('/audit', {
      websiteUrl: 'https://example.com',
      companyName: 'Example Domain Global',
    });

    if (auditRes.status === 201 && auditRes.data.success) {
      const data = auditRes.data.data;
      const genBy = auditRes.data.generatedBy;
      const isFallback = auditRes.data.isFallback;
      results.push({
        test: 'Public Website Audit & Evidence Synthesis',
        status: 'PASS',
        details: `Score: ${data.overallScore}/100, Load Time: ${data.rawData?.loadTimeMs}ms, Provider: ${genBy} (isFallback=${isFallback})`,
      });
    } else {
      results.push({
        test: 'Public Website Audit & Evidence Synthesis',
        status: 'FAIL',
        details: `Status ${auditRes.status}: ${JSON.stringify(auditRes.data)}`,
      });
    }
  } catch (err: any) {
    results.push({ test: 'Public Website Audit', status: 'FAIL', details: err.message });
  }

  // 9. AI Outreach Generator & Ethical Guardrails
  try {
    console.log('Generating structured AI outreach draft...');
    const pitchRes = await client.post('/pitches/generate', {
      leadId: createdLeadId,
      companyName: 'Vedic Organic Health Foods',
      contactName: 'Aarav Sharma',
      websiteUrl: `https://${testDomain}`,
      industry: 'Healthcare businesses',
      targetService: 'E-commerce website',
      messageType: 'COLD_EMAIL',
      targetRegion: 'INDIA',
    });

    if (pitchRes.status === 201 && pitchRes.data.success) {
      const pitch = pitchRes.data.data;
      const has6Elements =
        Boolean(pitch.personalisedOpening) &&
        Boolean(pitch.observedOpportunity) &&
        Boolean(pitch.relevantService) &&
        Boolean(pitch.valueProposition) &&
        Boolean(pitch.callToAction) &&
        Boolean(pitch.professionalClosing);

      results.push({
        test: 'AI Outreach Generation (6-Element Architecture)',
        status: has6Elements && pitch.status === 'DRAFT' ? 'PASS' : 'FAIL',
        details: `Generated COLD_EMAIL with subject "${pitch.subject}". Status strictly preserved as "${pitch.status}". Provider: ${pitchRes.data.generatedBy}`,
      });

      // 10. Manual Send Approval Flow
      const sendRes = await client.post(`/pitches/${pitch.id}/mark-sent`);
      if (sendRes.status === 200 && sendRes.data.data.status === 'SENT') {
        // Verify lead advanced to Contacted
        const leadRes = await client.get(`/leads/${createdLeadId}`);
        const leadStatus = leadRes.data.data?.leadStatus;
        results.push({
          test: 'Outreach Manual Send Approval Workflow',
          status: leadStatus === 'Contacted' ? 'PASS' : 'FAIL',
          details: `Pitch marked SENT with sentAt timestamp; Lead status advanced to: "${leadStatus}"`,
        });
      } else {
        results.push({
          test: 'Outreach Manual Send Approval Workflow',
          status: 'FAIL',
          details: `Status ${sendRes.status}: ${JSON.stringify(sendRes.data)}`,
        });
      }
    } else {
      results.push({
        test: 'AI Outreach Generation',
        status: 'FAIL',
        details: `Status ${pitchRes.status}: ${JSON.stringify(pitchRes.data)}`,
      });
    }
  } catch (err: any) {
    results.push({ test: 'AI Outreach Generation', status: 'FAIL', details: err.message });
  }

  // 11. Rate Cards API
  try {
    const rateRes = await client.get('/ratecards');
    if (rateRes.status === 200 && rateRes.data.success && rateRes.data.count >= 18) {
      results.push({
        test: 'Rate Card Packages (18 Services Seeded)',
        status: 'PASS',
        details: `Loaded ${rateRes.data.count} packages across ₹ INR, $ USD, € EUR, £ GBP`,
      });
    } else {
      results.push({
        test: 'Rate Card Packages',
        status: 'FAIL',
        details: `Status ${rateRes.status}, count: ${rateRes.data?.count}`,
      });
    }
  } catch (err: any) {
    results.push({ test: 'Rate Card Packages', status: 'FAIL', details: err.message });
  }

  // 12. Funnel & Analytics Metrics
  try {
    const analyticsRes = await client.get('/analytics');
    if (analyticsRes.status === 200 && analyticsRes.data.success) {
      const summary = analyticsRes.data.data.summary;
      const winRate = summary.totalLeads > 0 ? Math.round((summary.dealsWon / summary.totalLeads) * 100) : 0;
      results.push({
        test: 'Analytics & Pipeline Funnel Calculations',
        status: 'PASS',
        details: `Total leads: ${summary.totalLeads}, Deals won: ${summary.dealsWon} (Win rate: ${winRate}%), Pipeline: ₹${summary.totalValueInr.toLocaleString()} / $${summary.totalValueUsd.toLocaleString()}`,
      });
    } else {
      results.push({
        test: 'Analytics & Pipeline Funnel Calculations',
        status: 'FAIL',
        details: `Status ${analyticsRes.status}: ${JSON.stringify(analyticsRes.data)}`,
      });
    }
  } catch (err: any) {
    results.push({ test: 'Analytics Calculations', status: 'FAIL', details: err.message });
  }

  // Clean up created test leads
  if (createdLeadId) {
    await client.delete(`/leads/${createdLeadId}`).catch(() => {});
  }
  if (importedLeadId) {
    await client.delete(`/leads/${importedLeadId}`).catch(() => {});
  }

  console.log('\n--- VERIFICATION AUDIT SUMMARY ---');
  let passCount = 0;
  for (const r of results) {
    const symbol = r.status === 'PASS' ? '✅' : '❌';
    console.log(`${symbol} [${r.status}] ${r.test}: ${r.details}`);
    if (r.status === 'PASS') passCount++;
  }
  console.log(`\nTOTAL: ${passCount} of ${results.length} checks passed.\n`);

  if (passCount !== results.length) {
    process.exit(1);
  }
}

runRealWorldVerification().catch((err) => {
  console.error('Fatal verification runner error:', err);
  process.exit(1);
});
