import { discoveryService } from '../services/discovery/discoveryService';

async function verifyProviders() {
  console.log('====================================================');
  console.log('AI CLIENT HUNTER - PROVIDER INTEGRATION VERIFICATION');
  console.log('====================================================\n');

  // 1. Health Checks
  console.log('[1] PROBING ALL PROVIDER HEALTH STATUSES...');
  const providers = await discoveryService.checkAllProvidersHealth(true);
  for (const p of providers) {
    console.log(
      `  • [${p.id.toUpperCase()}] "${p.name}" => Configured: ${p.configured} | Healthy: ${p.isHealthy} | Latency: ${p.latencyMs ?? 'N/A'}ms | Error: ${p.error ?? 'None'}`
    );
  }

  // 2. Test OpenStreetMap Live Search (Real Businesses, No Fabrication)
  console.log('\n[2] TESTING REAL OPENSTREETMAP NOMINATIM SEARCH...');
  const osmResult = await discoveryService.search({
    country: 'India',
    city: 'Bengaluru',
    industry: 'Bakery',
    maxLeads: 3,
    providerId: 'openstreetmap',
  });

  console.log(`  Provider Name: ${osmResult.providerName}`);
  console.log(`  Fallback Occurred: ${osmResult.fallbackOccurred}`);
  console.log(`  Leads Discovered: ${osmResult.leads.length}`);
  
  for (const lead of osmResult.leads) {
    console.log(`    - Name: ${lead.businessName}`);
    console.log(`      Website: ${lead.website || 'Unavailable in OSM'}`);
    console.log(`      Contact Status: Website=${lead.contactStatus?.websiteStatus}, Phone=${lead.contactStatus?.phoneStatus}, Email=${lead.contactStatus?.emailStatus}`);
    console.log(`      Address: ${lead.city}, ${lead.country}`);
    console.log(`      Source: ${lead.source}`);
  }

  // 3. Test Automatic Fallback (When requested provider is unconfigured)
  console.log('\n[3] TESTING AUTOMATIC FALLBACK WHEN REQUESTING UNCONFIGURED PROVIDER (google_places)...');
  const fallbackResult = await discoveryService.search({
    country: 'United Kingdom',
    city: 'London',
    industry: 'Cafe',
    maxLeads: 2,
    providerId: 'google_places',
  });

  console.log(`  Original Requested Provider: ${fallbackResult.primaryProviderName}`);
  console.log(`  Fallback Occurred: ${fallbackResult.fallbackOccurred}`);
  console.log(`  Active Provider Used: ${fallbackResult.providerName}`);
  console.log(`  Fallback Reason: ${fallbackResult.fallbackReason}`);
  console.log(`  Leads Returned via Fallback: ${fallbackResult.leads.length}`);
  for (const lead of fallbackResult.leads) {
    console.log(`    - Lead: ${lead.businessName} (${lead.city}, ${lead.country})`);
    console.log(`      Attribution: Source="${lead.source}"`);
  }

  console.log('\n====================================================');
  console.log('PROVIDER ARCHITECTURE VERIFICATION COMPLETE');
  console.log('====================================================');
}

verifyProviders().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
