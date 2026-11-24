import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { discoveryService } from '../services/discovery/discoveryService';
import { validateRequest } from '../middleware/validate';
import { BadRequestError } from '../utils/errors';
import { osmTagFilters } from '../services/discovery/providers/overpassQuery';

const router = Router();

const searchSchema = z.object({
  country: z.string().trim().min(2, 'Country is required').max(120),
  city: z.string().trim().max(120).optional(),
  industry: z.string().trim().min(2, 'Industry is required').max(120),
  businessSize: z.string().optional(),
  websiteAvailability: z.enum(['has_website', 'no_website', 'any']).optional().default('any'),
  servicesRequired: z.array(z.string().max(120)).max(20).default([]),
  maxLeads: z.number().int().min(1).max(50).default(10),
  providerId: z.string().optional().default('overpass'),
  osmTags: osmTagFilters.optional(),
  // Manual input support
  domain: z.string().trim().max(2048).optional(),
  businessName: z.string().trim().max(180).optional(),
});

const geocodeSchema = z.object({ address: z.string().trim().min(3).max(200), limit: z.number().int().min(1).max(5).default(3) });

router.post('/geocode', validateRequest({ body: geocodeSchema }), async (req, res, next) => {
  try {
    const input: z.infer<typeof geocodeSchema> = req.body;
    res.json({ success: true, data: await discoveryService.geocodeAddress(input.address, input.limit) });
  } catch (error) {
    next(error);
  }
});

// GET /api/discovery/providers - List available search providers and their connection status
router.get('/providers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const checkHealth = req.query.checkHealth === 'true' || req.query.checkHealth === '1';
    let providers;
    if (checkHealth) {
      providers = await discoveryService.checkAllProvidersHealth(req.query.force === 'true');
    } else {
      providers = discoveryService.getProviders();
    }
    res.json({
      success: true,
      data: await discoveryService.withLastSuccessfulSearch(providers),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/discovery/providers/:id/health - Test actual live connectivity for a provider
router.post('/providers/:id/health', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const [status] = await discoveryService.withLastSuccessfulSearch([await discoveryService.checkProviderHealth(id, true)]);
    res.json({
      success: true,
      data: status,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/discovery/search - Execute genuine business search across providers
router.post('/search', validateRequest({ body: searchSchema }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = req.body;
    const result = await discoveryService.search(filters);
    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/discovery/history - Retrieve discovery search history
router.get('/history', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const history = await discoveryService.getHistory();
    res.json({
      success: true,
      count: history.length,
      data: history,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/discovery/history/:id - Delete a search history entry
router.delete('/history/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    await discoveryService.deleteHistory(id);
    res.json({
      success: true,
      message: 'Search history record deleted.',
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/discovery/presets - High-converting market niches for freelance acquisition
router.get('/presets', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      india: [
        {
          industry: 'Restaurants',
          recommendedServices: ['Business website', 'React Native mobile application'],
          hubs: ['Bengaluru', 'Mumbai', 'Delhi-NCR', 'Hyderabad', 'Pune'],
          pitchStrategy: 'Direct ordering system, QR menu, and UPI/Razorpay payment gateway.',
        },
        {
          industry: 'Healthcare businesses',
          recommendedServices: ['React Native mobile application', 'Admin dashboard'],
          hubs: ['Bengaluru', 'Chennai', 'Mumbai', 'Kolkata'],
          pitchStrategy: 'Cross-platform patient booking and diagnostic lab portal.',
        },
        {
          industry: 'Retail stores',
          recommendedServices: ['E-commerce website', 'AI application and integration'],
          hubs: ['Surat', 'Mumbai', 'Delhi-NCR', 'Jaipur'],
          pitchStrategy: 'Omnichannel D2C storefront with WhatsApp abandoned cart recovery.',
        },
        {
          industry: 'Real estate',
          recommendedServices: ['Business website', 'AI application and integration'],
          hubs: ['Gurugram', 'Noida', 'Bengaluru', 'Thane'],
          pitchStrategy: 'Interactive virtual project tours and AI-assisted lead capture.',
        },
      ],
      international: [
        {
          industry: 'Startups',
          recommendedServices: ['Admin dashboard', 'Backend API development', 'AI application and integration'],
          hubs: ['San Francisco', 'London', 'Berlin', 'New York', 'Austin'],
          pitchStrategy: 'Scaling microservice APIs, internal ops tooling, and embedded LLM features.',
        },
        {
          industry: 'Professional services',
          recommendedServices: ['Business website', 'Admin dashboard'],
          hubs: ['London', 'New York', 'Frankfurt', 'Zurich', 'Singapore'],
          pitchStrategy: 'Ultra-fast corporate branding, client portal, and compliance audit.',
        },
        {
          industry: 'E-commerce',
          recommendedServices: ['E-commerce website', 'React Native mobile application'],
          hubs: ['Los Angeles', 'London', 'Amsterdam', 'Toronto'],
          pitchStrategy: 'Sub-second headless Next.js storefronts and native customer loyalty apps.',
        },
        {
          industry: 'Travel agencies',
          recommendedServices: ['Business website', 'AI application and integration'],
          hubs: ['London', 'Dubai', 'Sydney', 'Paris'],
          pitchStrategy: 'Bespoke itinerary builder, dynamic booking engine, and multilingual support.',
        },
      ],
    },
  });
});

export default router;
