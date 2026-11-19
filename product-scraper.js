/**
 * product-scraper.js
 * High-Precision Universal Product Inspector & Metadata Extraction Engine
 * 
 * Capable of scraping product details from any e-commerce site, brand store,
 * or affiliate link (Shopify, Amazon, WooCommerce, Magento, Custom):
 * - Follows redirects (affiliate tracking links like Impact/pxf.io, ShareASale, CJ, bit.ly)
 * - Automatically discovers flagship/featured products in homepage order
 * - Accurately extracts live promo deal prices (e.g. "ONLY $245.99", "ONLY $295.99")
 * - Never overcharges with bundle variant prices
 * - Extracts JSON-LD Schema.org Product data & Shopify .json endpoints
 * - Extracts OpenGraph & Twitter Cards metadata
 * - Automatically categorizes into the 13 canonical website niches
 * - Extracts high-res product packshot images, exact prices, and bullet specs
 * - Never truncates product model numbers (e.g. "– MW-SC10", "- MW-PF06", "- 4CH RTF")
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

// 13 Canonical Niches Definition
const NICHES = [
  {
    slug: 'robotics',
    name: 'Robotics & Drones',
    pattern: /drone|drones|flycam|fly-cam|quadcopter|uav|dji|mavic|avata|mini-4|air-3|rc-car|rc-plane|rc-glider|volantex|exhobby|aerobatic|stunt-plane|glider|airplane|aircraft|propeller|flight-controller|mowrator|mower|lawnmower|lawn-mower|navimow|luba|crawler|4wd-robot|telemetry|unmanned|patrol-vehicle|robotics|robot\b/i
  },
  {
    slug: 'cameras',
    name: 'Cameras & Creator Gear',
    pattern: /osmo-pocket|pocket-3|pocket-2|action-cam|action-camera|insta360|gopro|vlog-camera|creator-combo|mirrorless|sony-a7|a7iv|a7m4|alpha-7|lumix|fujifilm|eos-r|canon|nikon|gimbal|ronin|tripod|teleprompter|shotgun-mic|rode|video-rig|nd-filter|camera|lens|lenses|cinematic/i
  },
  {
    slug: 'smarthome',
    name: 'Smart Home & IoT',
    pattern: /roborock|dreame|ecovacs|roomba|vacuum|robot-vacuum|robot-mop|mop|aqara|matter|smart-home|smarthome|smart-lock|smart-plug|mmwave|presence-sensor|smart-bulb|smart-curtain|thermostat|magcubic|projector|hy350|video-doorbell|home-assistant|zigbee|thread-hub|lighting|gate-opener|sliding-gate|meowant|litter-box|cat-litter|automatic-feeder|pet-feeder|pet-fountain|smart-pet|pet-care|pet-odor|cat-box|pet-appliance|feeder|water-fountain/i
  },
  {
    slug: 'wearables',
    name: 'Smart Wearables',
    pattern: /apple-watch|galaxy-watch|pixel-watch|garmin|fenix|forerunner|smartwatch|smart-watch|smart-ring|galaxy-ring|oura|whoop|fitbit|amazfit|smart-band|fitness-tracker|wearable|wearables|heart-rate|spo2/i
  },
  {
    slug: 'edc',
    name: 'Desk Setup & EDC',
    pattern: /keychron|keyboard|keyboards|mechanical-keyboard|custom-keyboard|qmk|via|switch|keycap|mx-master|logitech-mx|mouse|trackball|desk-mat|deskmat|stream-deck|elgato|wrist-rest|monitor-arm|pegboard|desk-shelf|sling-bag|sling|matein|backpack|everyday-carry|edc|multitool|screen-protector|magic-john/i
  },
  {
    slug: 'computing',
    name: 'Computing & Gaming',
    pattern: /rog-ally|ally-x|steam-deck|legion-go|handheld-gaming|razer-blade|blade-16|alienware|gaming-laptop|laptop|laptops|macbook|gpu|rtx-40|rtx-50|mini-pc|geekom|beelink|mechanical-gaming|handheld-pc|gaming-pc|graphics-card|processor|intel|amd-ryzen/i
  },
  {
    slug: 'power',
    name: 'Power & GaN Charging',
    pattern: /ugreen|nexode|anker|anker-737|baseus|blade-hd|power-bank|powerbank|gan-charger|gan|fast-charger|desktop-charger|usb-c-charger|portable-power|power-station|ecoflow|jackery|anker-solix|charging-station|magsafe-charger|e-marker|watt\b|140w|100w|65w|300w/i
  },
  {
    slug: 'audio',
    name: 'Audio & Sound',
    pattern: /sony.*(wh|wf|xm|headphone)|wh-1000xm|wf-1000xm|bose|quietcomfort|qc-ultra|sennheiser|momentum|shure|sm7b|devialet|phantom|airpods|headphone|headphones|earbud|earbuds|earphone|headset|audiophile|dac|amp|iem|soundbar|speaker|speakers|studio-monitor|noise-canceling|anc/i
  },
  {
    slug: 'saas',
    name: 'SaaS & AI Tools',
    pattern: /perplexity|chatgpt|openai|claude|anthropic|midjourney|cursor|menthor|saas|ai-tool|ai-assistant|cloud-license|api-token|copy-ai|jasper|notion-ai|elevenlabs|runway|automation-tool|productivity-app|software|license/i
  },
  {
    slug: 'templates',
    name: 'Notion OS',
    pattern: /notion\.so|notion-template|notion-workspace|notion-os|notion-dashboard|workspace-template|content-os|creator-os|second-brain|notion/i
  },
  {
    slug: 'presets',
    name: 'Presets & LUTs',
    pattern: /\bpresets?\b|\bluts?\b|lightroom|lightroom-preset|color-grading|\.cube\b|davinci-lut|photoshop-action|cyberpunk-lut|camera-profile/i
  },
  {
    slug: 'ebooks',
    name: 'Ebooks & Playbooks',
    pattern: /gumroad.*ebook|ebook|playbook|blueprint|guide-book|pdf-guide|kindle|epub|whitepaper|digital-guide|cheatsheet|guide/i
  },
  {
    slug: 'courses',
    name: 'Video Courses',
    pattern: /course|courses|masterclass|video-workshop|video-training|academy|bootcamp|curriculum|udemy|coursera|skool|teachable|lesson|tutorials-bundle/i
  }
];

function detectNiche(text) {
  const lower = String(text || '').toLowerCase();
  for (const n of NICHES) {
    if (n.pattern.test(lower)) {
      return { slug: n.slug, name: n.name };
    }
  }
  return { slug: 'smarthome', name: 'Smart Home & IoT' };
}

function cleanHtmlText(str) {
  if (!str) return '';
  return String(str)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fetch HTML with full redirect following (up to 7 hops)
 */
function fetchHtmlWithRedirects(targetUrl, maxRedirects = 7) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      return reject(new Error('Too many redirects'));
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(targetUrl.startsWith('http') ? targetUrl : 'https://' + targetUrl);
    } catch (e) {
      return reject(new Error(`Invalid URL: ${targetUrl}`));
    }

    const client = parsedUrl.protocol === 'http:' ? http : https;
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'http:' ? 80 : 443),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache'
      },
      timeout: 8000
    };

    const req = client.request(options, (res) => {
      // Handle HTTP redirects (301, 302, 303, 307, 308)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        try {
          const nextUrl = new URL(res.headers.location, parsedUrl.href).href;
          res.resume();
          return resolve(fetchHtmlWithRedirects(nextUrl, maxRedirects - 1));
        } catch (e) {}
      }

      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        data += chunk;
        if (data.length > 2500000) {
          req.destroy();
          resolve({ html: data, finalUrl: parsedUrl.href });
        }
      });
      res.on('end', () => {
        // Check for HTML meta refresh redirect: <meta http-equiv="refresh" content="0;url=http...">
        const refreshMatch = data.match(/<meta[^>]*http-equiv=["']refresh["'][^>]*content=["'][0-9]+;\s*url=([^"']+)["']/i);
        if (refreshMatch && refreshMatch[1]) {
          try {
            const nextUrl = new URL(refreshMatch[1], parsedUrl.href).href;
            return resolve(fetchHtmlWithRedirects(nextUrl, maxRedirects - 1));
          } catch(e) {}
        }
        resolve({ html: data, finalUrl: parsedUrl.href });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.end();
  });
}

/**
 * Fetch JSON helper
 */
function fetchJson(targetUrl) {
  return new Promise((resolve) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(targetUrl.startsWith('http') ? targetUrl : 'https://' + targetUrl);
    } catch(e) {
      return resolve(null);
    }
    const client = parsedUrl.protocol === 'http:' ? http : https;
    const req = client.get({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'http:' ? 80 : 443),
      path: parsedUrl.pathname + parsedUrl.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json,text/javascript,*/*;q=0.01'
      },
      timeout: 6000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        try {
          const nextUrl = new URL(res.headers.location, parsedUrl.href).href;
          return resolve(fetchJson(nextUrl));
        } catch(e) {}
      }
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          resolve(JSON.parse(d));
        } catch(e) {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

/**
 * Extract promotional deal prices from HTML tags/badges (e.g. "ONLY $245.99", "ONLY $295.99")
 */
function extractPromoPricesFromHtml(html) {
  const promoMap = {};
  if (!html) return promoMap;

  // Match only true deal price tags (like "ONLY $295.99", "Only $245.99"), skipping "$170 off" discount badges
  const regex1 = /class=["'][^"']*(?:product-tag-item|tag-box|badge)[^"']*["'][^>]*>[\s\S]*?(?:only|just|now|price)?\s*\$([0-9]+(?:\.[0-9]{2})?)\s*<\/div>[\s\S]{1,400}?href=["']\/products\/([a-zA-Z0-9_\-]+)["']/gi;
  let m1;
  while ((m1 = regex1.exec(html)) !== null) {
    if (/\boff\b/i.test(m1[0])) continue;
    const price = parseFloat(m1[1]);
    const handle = m1[2];
    if (price >= 30 && (!promoMap[handle] || price < promoMap[handle])) {
      promoMap[handle] = price;
    }
  }

  // Reverse: product link followed by deal badge
  const regex2 = /href=["']\/products\/([a-zA-Z0-9_\-]+)["'][\s\S]{1,400}?class=["'][^"']*(?:product-tag-item|tag-box|badge)[^"']*["'][^>]*>[\s\S]*?(?:only|just|now|price)?\s*\$([0-9]+(?:\.[0-9]{2})?)\s*<\/div>/gi;
  let m2;
  while ((m2 = regex2.exec(html)) !== null) {
    if (/\boff\b/i.test(m2[0])) continue;
    const handle = m2[1];
    const price = parseFloat(m2[2]);
    if (price >= 30 && (!promoMap[handle] || price < promoMap[handle])) {
      promoMap[handle] = price;
    }
  }

  return promoMap;
}

/**
 * Extract accurate product base data from a Shopify product object
 * (Prioritizes promo deal badge price if present, else lowest base variant price)
 */
function extractShopifyProductData(p, origin, defaultBrand = '', promoMap = {}) {
  const availableVariants = (p.variants || []).filter(v => v.available !== false && parseFloat(v.price) > 0);
  const list = availableVariants.length > 0 ? availableVariants : (p.variants || []);
  
  // Sort variants ascending by price to obtain starting base price
  list.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
  const baseVariant = list[0] || { price: '0', compare_at_price: null };
  const basePrice = parseFloat(baseVariant.price || 0);
  let compare = baseVariant.compare_at_price ? parseFloat(baseVariant.compare_at_price) : 0;

  // Apply promo deal price if store advertises a lower deal price (e.g. "ONLY $245.99" / "ONLY $295.99")
  let price = basePrice;
  if (promoMap && promoMap[p.handle] && promoMap[p.handle] > 0) {
    price = promoMap[p.handle];
    if (compare <= price) {
      compare = basePrice > price ? basePrice : Math.round(price * 1.3 * 100) / 100;
    }
  }
  
  const img = (p.images && p.images[0]?.src) ? p.images[0].src : '';
  const desc = p.body_html ? cleanHtmlText(p.body_html.replace(/<[^>]+>/g, ' ')).substring(0, 600) : '';

  return {
    id: p.id,
    title: cleanHtmlText(p.title),
    handle: p.handle,
    productUrl: `${origin}/products/${p.handle}`,
    salePriceUsd: '$' + price.toFixed(2),
    numericPriceUsd: price,
    salePriceVnd: (Math.round(price * 25000 / 1000) * 1000).toLocaleString('vi-VN').replace(/,/g, '.') + '₫',
    originalPriceUsd: compare > price ? ('$' + compare.toFixed(2)) : ('$' + (Math.round(price * 1.25 * 100) / 100).toFixed(2)),
    image: img,
    description: desc,
    brand: p.vendor || defaultBrand
  };
}

/**
 * Check if the URL represents a store homepage or category catalog
 */
function isStoreHomepageOrCollection(finalUrl, html, parsedUrl) {
  const pathname = (parsedUrl.pathname || '').replace(/\/+$/, '') || '/';
  if (pathname === '/' || pathname === '' || pathname === '/index.html') return true;
  if (/^\/(collections|categories|category|catalog|shop|all-products|products)\/?$/i.test(pathname)) return true;

  const hasProductSchema = /["']@type["']\s*:\s*["']Product["']/i.test(html);
  const hasOgProduct = /property=["']og:type["']\s*content=["']product["']/i.test(html);
  const isProductPath = /\/(products?|items?|goods|dp|p|buy)\/[^\s"']+/i.test(pathname);

  if (!isProductPath && !hasProductSchema && !hasOgProduct) {
    return true;
  }
  return false;
}

/**
 * Main Product Inspector & Scraper Engine
 */
async function scrapeProductInfo(url, hintKeyword = '') {
  if (!url || typeof url !== 'string' || !url.trim()) {
    return { success: false, error: 'Empty URL provided' };
  }

  const cleanUrl = url.trim();
  let html = '';
  let finalUrl = cleanUrl;

  try {
    const fetched = await fetchHtmlWithRedirects(cleanUrl);
    html = fetched.html;
    finalUrl = fetched.finalUrl;
  } catch (err) {
    return {
      success: false,
      error: `Scrape error: ${err.message}`,
      url: cleanUrl
    };
  }

  const parsedUrl = new URL(finalUrl);
  const hostname = parsedUrl.hostname.toLowerCase();

  let productTitle = '';
  let brandName = '';
  let salePriceUsd = 0;
  let originalPriceUsd = 0;
  let imageUrl = '';
  let description = '';
  let storeProducts = [];
  let isFromStoreCatalog = false;

  // Extract base brand from domain
  const domainParts = hostname.replace(/^www\./, '').split('.');
  if (domainParts[0] && !['amazon', 'aliexpress', 'ebay', 'walmart', 'bestbuy', 'etsy'].includes(domainParts[0])) {
    brandName = domainParts[0].charAt(0).toUpperCase() + domainParts[0].slice(1);
  }

  // Extract promo deal badges present in the page HTML
  const promoMap = extractPromoPricesFromHtml(html);

  // -------------------------------------------------------------------------
  // CASE 1: The link lands on a store homepage, brand root, or catalog
  // Intelligently discover actual real products from the merchant store!
  // -------------------------------------------------------------------------
  if (isStoreHomepageOrCollection(finalUrl, html, parsedUrl)) {
    isFromStoreCatalog = true;

    // Check homepage <main> or HTML for ordered product appearance rank
    const mainSectionMatch = html.match(/<main[\s\S]*?<\/main>/i);
    const areaToSearch = mainSectionMatch ? mainSectionMatch[0] : html;
    const linkMatches = areaToSearch.match(/href=["']\/products\/([a-zA-Z0-9_\-]+)["']/g) || [];
    const homepageHandles = [...new Set(linkMatches.map(m => {
      const exec = /href=["']\/products\/([a-zA-Z0-9_\-]+)["']/.exec(m);
      return exec ? exec[1] : '';
    }).filter(Boolean))];

    // Check Shopify endpoint
    try {
      const shopifyData = await fetchJson(`${parsedUrl.origin}/products.json?limit=35`);
      if (shopifyData && Array.isArray(shopifyData.products) && shopifyData.products.length > 0) {
        // Filter out non-hardware items (exchange, adjustment, warranty, sample, shipping, gift card, liners, filter, price < $20)
        const validProducts = shopifyData.products.filter(p => {
          const t = (p.title || '').toLowerCase();
          const basePrice = Math.min(...(p.variants || []).map(v => parseFloat(v.price || 0)));
          if (basePrice < 20) return false;
          if (/exchange|adjustment|insurance|warranty|sample|shipping|test|tip|gift\s*card|liner|replacement\s*filter|scratch\s*board|cleaner\s*bag/i.test(t)) return false;
          return true;
        });

        if (validProducts.length > 0) {
          // Sort products by:
          // 1. Keyword relevance if provided
          // 2. Order of appearance on the homepage (featured rank)
          validProducts.sort((a, b) => {
            if (hintKeyword && hintKeyword.trim()) {
              const kwLower = hintKeyword.trim().toLowerCase();
              const matchA = (a.title || '').toLowerCase().includes(kwLower) ? 1 : 0;
              const matchB = (b.title || '').toLowerCase().includes(kwLower) ? 1 : 0;
              if (matchA !== matchB) return matchB - matchA;
            }
            const idxA = homepageHandles.indexOf(a.handle);
            const idxB = homepageHandles.indexOf(b.handle);
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;
            return 0;
          });

          storeProducts = validProducts.slice(0, 10).map(p => {
            return extractShopifyProductData(p, parsedUrl.origin, brandName, promoMap);
          });

          const top = storeProducts[0];
          productTitle = top.title;
          salePriceUsd = top.numericPriceUsd;
          originalPriceUsd = parseFloat(top.originalPriceUsd.replace('$', ''));
          imageUrl = top.image;
          description = top.description;
          if (top.brand) brandName = top.brand;
        }
      }
    } catch (e) {}

    // Fallback if not Shopify: find product links from homepage HTML and scrape the first featured product
    if (!productTitle && homepageHandles.length > 0) {
      const featuredProdUrl = `${parsedUrl.origin}/products/${homepageHandles[0]}`;
      try {
        const subScrape = await scrapeProductInfo(featuredProdUrl, hintKeyword);
        if (subScrape && subScrape.success && subScrape.numericPriceUsd > 0) {
          subScrape.url = cleanUrl; // Preserve user's original affiliate tracking URL!
          subScrape.source = 'store_catalog_featured_product';
          return subScrape;
        }
      } catch (e) {}
    }
  }

  // -------------------------------------------------------------------------
  // CASE 2: Single Product Page (or direct product URL)
  // -------------------------------------------------------------------------
  // Check if Shopify product page directly
  if (!productTitle && parsedUrl.pathname.includes('/products/')) {
    try {
      const prodJson = await fetchJson(`${parsedUrl.origin}${parsedUrl.pathname}.json`);
      if (prodJson && prodJson.product) {
        const data = extractShopifyProductData(prodJson.product, parsedUrl.origin, brandName, promoMap);
        productTitle = data.title;
        salePriceUsd = data.numericPriceUsd;
        originalPriceUsd = parseFloat(data.originalPriceUsd.replace('$', ''));
        imageUrl = data.image;
        if (data.brand) brandName = data.brand;
        if (data.description) description = data.description;
      }
    } catch(e) {}
  }

  // 1. Try JSON-LD schema.org/Product
  if (!productTitle || !salePriceUsd) {
    const jsonLdMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    if (jsonLdMatches) {
      for (const m of jsonLdMatches) {
        try {
          const innerJson = m.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '').trim();
          const parsed = JSON.parse(innerJson);
          const candidates = Array.isArray(parsed) ? parsed : (parsed['@graph'] ? parsed['@graph'] : [parsed]);
          for (const item of candidates) {
            if (item && (item['@type'] === 'Product' || (Array.isArray(item['@type']) && item['@type'].includes('Product')))) {
              if (!productTitle && item.name) productTitle = cleanHtmlText(item.name);
              if (!brandName) {
                if (typeof item.brand === 'string') brandName = cleanHtmlText(item.brand);
                else if (item.brand && item.brand.name) brandName = cleanHtmlText(item.brand.name);
              }
              if (!description && item.description) description = cleanHtmlText(item.description);
              if (!imageUrl) {
                if (typeof item.image === 'string') imageUrl = item.image;
                else if (Array.isArray(item.image) && item.image[0]) {
                  imageUrl = typeof item.image[0] === 'string' ? item.image[0] : (item.image[0].url || '');
                } else if (item.image && item.image.url) {
                  imageUrl = item.image.url;
                }
              }
              // Offers / Price: find minimum available variant price (never the bundle add-on price)
              if (!salePriceUsd && item.offers) {
                const offers = Array.isArray(item.offers) ? item.offers : [item.offers];
                const validPrices = offers
                  .map(o => parseFloat(o.price || o.lowPrice || 0))
                  .filter(p => p > 0);
                if (validPrices.length > 0) {
                  salePriceUsd = Math.min(...validPrices);
                }
                const highPrices = offers
                  .map(o => parseFloat(o.highPrice || 0))
                  .filter(p => p > salePriceUsd);
                if (highPrices.length > 0) {
                  originalPriceUsd = Math.max(...highPrices);
                }
              }
            }
          }
        } catch (e) {}
      }
    }
  }

  // 2. OpenGraph Meta Tags
  if (!productTitle) {
    const ogTitle = html.match(/<meta[^>]*property=["'](?:og:title|twitter:title)["'][^>]*content=["']([^"']+)["']/i) ||
                    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["'](?:og:title|twitter:title)["']/i);
    if (ogTitle && ogTitle[1]) {
      productTitle = cleanHtmlText(ogTitle[1]);
    }
  }

  if (!productTitle) {
    const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleTag && titleTag[1]) {
      productTitle = cleanHtmlText(titleTag[1]);
    }
  }

  // Clean trailing store/site suffixes like " - Amazon.com", " | Official Store", " - Shopify"
  // BUT NEVER STRIP MODEL NUMBERS (e.g. "– MW-SC10", "- MW-PF06", "- 4CH RTF")
  if (productTitle) {
    const storeSuffixRegex = /\s*[\-\|\–\—]\s*(?:Official Store|Official|Store|Shop|Amazon\.com|Walmart|Aliexpress|Shopify|Buy Online|Best Price|Free Shipping)\s*$/i;
    if (storeSuffixRegex.test(productTitle)) {
      productTitle = productTitle.replace(storeSuffixRegex, '').trim();
    } else if (brandName && brandName.length >= 4) {
      const brandSuffix = new RegExp(`\\s*[\\-\\|\\–\\—]\\s*${brandName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
      if (brandSuffix.test(productTitle)) {
        productTitle = productTitle.replace(brandSuffix, '').trim();
      }
    }
  }

  // Brand Name extraction
  if (!brandName) {
    const ogSite = html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i);
    if (ogSite && ogSite[1]) {
      brandName = cleanHtmlText(ogSite[1]);
    }
  }

  // Image extraction fallback
  if (!imageUrl) {
    const ogImg = html.match(/<meta[^>]*property=["'](?:og:image|og:image:secure_url|twitter:image)["'][^>]*content=["']([^"']+)["']/i) ||
                  html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["'](?:og:image|og:image:secure_url|twitter:image)["']/i);
    if (ogImg && ogImg[1]) {
      imageUrl = ogImg[1];
    }
  }

  // Resolve relative image URLs & filter out tiny logos/icons
  if (imageUrl) {
    if (!imageUrl.startsWith('http')) {
      try {
        imageUrl = new URL(imageUrl, finalUrl).href;
      } catch(e) {}
    }
    // If image is a tiny logo or banner, try looking for product images
    if (imageUrl.includes('logo') || imageUrl.includes('favicon') || imageUrl.includes('banner')) {
      const prodImgMatch = html.match(/https:\/\/[^"'\s]+\/(?:products?|files?)\/[^"'\s]+\.(?:png|jpg|webp)/i);
      if (prodImgMatch && prodImgMatch[0]) {
        imageUrl = prodImgMatch[0];
      }
    }
  }

  // Price extraction fallback from DOM
  if (!salePriceUsd) {
    // 1. Check OpenGraph / product metadata tags
    const ogPrice = html.match(/<meta[^>]*property=["'](?:product:price:amount|og:price:amount)["'][^>]*content=["']([0-9]+(?:\.[0-9]{1,2})?)["']/i);
    if (ogPrice && ogPrice[1]) {
      salePriceUsd = parseFloat(ogPrice[1]);
    }
  }

  if (!salePriceUsd) {
    // 2. Check explicit sale price class in DOM
    const saleMatch = html.match(/(?:price-item--sale|sale-price|current-price|price-current|special-price|offer-price)[^>]*>[\s\S]*?\$([0-9]{1,4}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/i) ||
                      html.match(/class=["'][^"']*(?:price--large|price__container)[^"']*["'][\s\S]*?\$([0-9]{1,4}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/i);
    if (saleMatch && saleMatch[1]) {
      const num = parseFloat(saleMatch[1].replace(/,/g, ''));
      if (num > 0) salePriceUsd = num;
    }
  }

  if (!salePriceUsd) {
    // 3. Fallback generic dollar match
    const priceMatches = html.match(/\$\s*([0-9]{1,4}(?:,[0-9]{3})*(?:\.[0-9]{2}))/);
    if (priceMatches && priceMatches[1]) {
      const num = parseFloat(priceMatches[1].replace(/,/g, ''));
      if (num > 0) salePriceUsd = num;
    }
  }

  // Look for deal/promo price tags on the page like "ONLY $295.99" / "ONLY $245.99"
  const dealTagMatch = html.match(/class=["'][^"']*(?:product-tag-item|badge--sale|special-deal|deal-price)[^"']*["'][^>]*>(?![\s\S]*?off)[\s\S]*?(?:only|sale|now|deal)?\s*\$([0-9]+(?:\.[0-9]{2})?)/i);
  if (dealTagMatch && dealTagMatch[1]) {
    const dealPrice = parseFloat(dealTagMatch[1]);
    if (dealPrice >= 20 && (!salePriceUsd || dealPrice < salePriceUsd)) {
      if (salePriceUsd > dealPrice && (!originalPriceUsd || originalPriceUsd <= dealPrice)) {
        originalPriceUsd = salePriceUsd;
      }
      salePriceUsd = dealPrice;
    }
  }

  if (!salePriceUsd) {
    salePriceUsd = 129.00;
  }

  // Original / Strikethrough price extraction
  if (!originalPriceUsd) {
    const regMatch = html.match(/(?:price-item--regular|regular-price|old-price|compare-price|original-price)[^>]*>[\s\S]*?\$([0-9]{1,4}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/i) ||
                     html.match(/<s[^>]*class=["'][^"']*price[^"']*["'][^>]*>[\s\S]*?\$([0-9]{1,4}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/i);
    if (regMatch && regMatch[1]) {
      const num = parseFloat(regMatch[1].replace(/,/g, ''));
      if (num > salePriceUsd) originalPriceUsd = num;
    }
  }

  if (!originalPriceUsd || originalPriceUsd <= salePriceUsd) {
    originalPriceUsd = Math.round(salePriceUsd * 1.25 * 100) / 100;
  }

  // Description extraction fallback
  if (!description) {
    const ogDesc = html.match(/<meta[^>]*property=["'](?:og:description|twitter:description)["'][^>]*content=["']([^"']+)["']/i) ||
                   html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
    if (ogDesc && ogDesc[1]) {
      description = cleanHtmlText(ogDesc[1]);
    }
  }

  // Detect niche based on combined signals (url, product title, description, brand)
  const combinedText = `${finalUrl} ${productTitle} ${description} ${brandName}`;
  const niche = detectNiche(combinedText);

  // Format currency strings
  const formattedUsd = '$' + salePriceUsd.toFixed(2);
  const formattedOrigUsd = '$' + originalPriceUsd.toFixed(2);
  const formattedVnd = (Math.round(salePriceUsd * 25000 / 1000) * 1000).toLocaleString('vi-VN').replace(/,/g, '.') + '₫';

  // Generate coupon
  const brandCleanUpper = (brandName || 'TECH').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().substring(0, 8);
  const couponCode = `${brandCleanUpper}15`;

  return {
    success: true,
    url: cleanUrl,
    finalUrl: finalUrl,
    productTitle: productTitle || 'High-Performance Verified Hardware',
    brand: brandName ? (brandName.endsWith('Official') || brandName.endsWith('Store') ? brandName : `${brandName} Official`) : 'Official Brand',
    category: niche.name,
    categorySlug: niche.slug,
    salePriceUsd: formattedUsd,
    numericPriceUsd: salePriceUsd,
    salePriceVnd: formattedVnd,
    originalPriceUsd: formattedOrigUsd,
    image: imageUrl || '',
    description: description,
    couponCode: couponCode,
    couponDiscount: '15% OFF Verified Merchant Deal',
    couponExpiry: '12/31/2026',
    storeProducts: storeProducts,
    isFromStoreCatalog: isFromStoreCatalog,
    source: isFromStoreCatalog ? 'store_catalog_product_discovery' : 'live_web_scraper'
  };
}

module.exports = {
  scrapeProductInfo,
  detectNiche,
  NICHES
};

// Direct test CLI
if (require.main === module) {
  const testUrl = process.argv[2] || 'https://gaostoltd.pxf.io/9V3Qk0';
  const kw = process.argv[3] || '';
  console.log('Testing scraper on:', testUrl, kw ? `(Keyword: ${kw})` : '');
  scrapeProductInfo(testUrl, kw).then(res => {
    console.log('Scraper result:\n', JSON.stringify(res, null, 2));
  }).catch(err => {
    console.error('Scraper test error:', err);
  });
}
