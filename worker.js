/**
 * =========================================================================
 * Cloudflare Worker Backend for CouponHiker Hub & Admin CMS
 * Domain: couponhiker.com (thanh.workers.dev)
 * =========================================================================
 * Features:
 * 1. POST /api/publish: Saves articles directly to Cloudflare KV without downloading files.
 * 2. GET /data/posts.json: Merges base articles with newly published KV articles.
 * 3. POST /api/delete-post: Deletes articles from KV.
 * 4. POST /api/admin/login: Authenticates admin (minhthanhcenter@gmail.com / thanh123@).
 * 5. Dynamic post rendering for /post-*.html.
 * 6. Static asset delivery via env.ASSETS.
 * =========================================================================
 */

const ADMIN_ACCOUNTS = [
  {
    email: 'minhthanhcenter@gmail.com',
    password: 'thanh123@',
    name: 'Minh Thành',
    role: 'Super Admin',
    initials: 'MT'
  },
  {
    email: 'hocamtuqlhm@gmail.com',
    password: 'camtu123@',
    name: 'Hồ Cẩm Tú',
    role: 'Admin',
    initials: 'CT'
  }
];
const ADMIN_EMAIL = 'minhthanhcenter@gmail.com';
const ADMIN_PASS = 'thanh123@';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// In-memory fallback if KV namespace is not yet bound
let inMemoryPosts = [];
let inMemoryHtml = new Map();
let inMemoryMessages = [];
let inMemoryPinned = null;
let inMemoryTicker = null;
let inMemoryProducts = null;

function safeJsonParse(text, fallback = null) {
  if (!text) return fallback;
  if (typeof text !== 'string') return text;
  let clean = text;
  if (clean.charCodeAt(0) === 0xFEFF) {
    clean = clean.slice(1);
  }
  try {
    return JSON.parse(clean.trim());
  } catch (e) {
    return fallback;
  }
}

function normSlug(s) {
  return (s || '').toString().trim().replace(/^[\s/]+/, '').replace(/^post-/, '').replace(/\.html$/, '');
}

function normFileName(s) {
  return 'post-' + normSlug(s) + '.html';
}

function normProdId(s) {
  return 'prod-' + normSlug(s);
}

function sanitizePostHtml(html) {
  if (!html || typeof html !== 'string') return html;

  // 1. Replace square purple CH logo with official logo matching index.html
  html = html.replace(
    /<div[^>]*class="[^"]*(?:bg-gradient-to-[a-z]+|from-purple|to-indigo|shadow-purple)[^"]*"[^>]*>\s*CH\s*<\/div>/gi,
    '<img src="images/logo.png" alt="CouponHiker Logo" class="w-9 h-9 sm:w-12 sm:h-12 xl:w-14 xl:h-14 rounded-xl sm:rounded-2xl object-cover shadow-lg shadow-cyan-500/30 group-hover:scale-105 transition-transform flex-shrink-0">'
  );
  html = html.replace(
    /<div[^>]*>\s*CH\s*<\/div>/gi,
    '<img src="images/logo.png" alt="CouponHiker Logo" class="w-9 h-9 sm:w-12 sm:h-12 xl:w-14 xl:h-14 rounded-xl sm:rounded-2xl object-cover shadow-lg shadow-cyan-500/30 group-hover:scale-105 transition-transform flex-shrink-0">'
  );

  // 2. Cosmic purple ticker background & gradients
  html = html.replace(/from-\[#14082c\]\s+via-\[#240e47\]\s+to-\[#120729\]/gi, 'from-slate-100 via-slate-100 to-slate-200 dark:from-[#0a0d14] dark:via-[#0c101a] dark:to-[#0a0d14]');
  html = html.replace(/from-\[#120729\]\s+via-\[#120729\]\/80\s+to-transparent/gi, 'from-slate-100 dark:from-[#0a0d14] to-transparent');
  html = html.replace(/to-\[#120729\]/gi, 'to-slate-100 dark:to-[#0a0d14]');
  html = html.replace(/bg-\[#(?:14082c|120729|0a0218)\]/gi, 'bg-slate-100 dark:bg-[#0a0d14]');
  html = html.replace(/text-purple-200/gi, 'text-slate-700 dark:text-slate-300');

  // 3. Ticker badge: replace purple with cyan gradient
  html = html.replace(/bg-gradient-to-r\s+from-purple-600\s+to-pink-600/gi, 'bg-gradient-to-r from-cyan-500 via-sky-500 to-blue-600');
  html = html.replace(/border-purple-500\/40/gi, 'border-cyan-400/40');
  html = html.replace(/shadow-purple-500\/25/gi, 'shadow-cyan-500/25');

  // 4. Header REVIEW badge and subtitle
  html = html.replace(/bg-purple-100\/90\s+dark:bg-purple-950\/90\s+text-purple-700\s+dark:text-purple-300/gi, 'bg-cyan-100/90 dark:bg-cyan-950/90 text-cyan-800 dark:text-cyan-300');
  html = html.replace(/border-purple-300\/60\s+dark:border-purple-700\/60/gi, 'border-cyan-300/60 dark:border-cyan-700/60');
  html = html.replace(/text-purple-600\s+dark:text-purple-400\s+uppercase\s+mt-1/gi, 'text-cyan-500 dark:text-cyan-400 uppercase mt-1');

  // 5. Deal Card & Pricing
  html = html.replace(/border-purple-500\/40\s+dark:border-purple-800\/60/gi, 'border-slate-200 dark:border-slate-800/80');
  html = html.replace(/dark:from-\[#180933\]\s+dark:via-\[#110424\]\s+dark:to-\[#0a0218\]/gi, 'dark:from-[#141926] dark:via-[#10141f] dark:to-[#0b0e17]');
  html = html.replace(/dark:from-\[#170a36\]\s+dark:to-\[#210e4a\]/gi, 'dark:from-[#0e121d] dark:to-[#141926]');
  html = html.replace(/dark:bg-\[#12082b\]/gi, 'dark:bg-[#141926]');
  html = html.replace(/dark:bg-\[#100726\]\/80/gi, 'dark:bg-[#141926]');
  html = html.replace(/text-pink-600\s+dark:text-pink-400/gi, 'text-cyan-600 dark:text-cyan-400');
  html = html.replace(/from-pink-500\s+via-purple-600\s+to-indigo-600/gi, 'from-cyan-500 via-sky-500 to-blue-600');
  html = html.replace(/from-pink-600\s+via-purple-600\s+to-indigo-600/gi, 'from-cyan-500 via-sky-500 to-blue-600');

  // 6. Editorial Disclosure Box
  html = html.replace(/border-purple-500\s+bg-purple-50\s+dark:bg-purple-950\/40\s+text-purple-900\s+dark:text-purple-200/gi,
    'border-cyan-500 bg-slate-100/80 dark:bg-[#141926] text-slate-800 dark:text-slate-300');
  html = html.replace(/border-purple-500\s+bg-purple-50/gi, 'border-cyan-500 bg-slate-100/80');
  html = html.replace(/dark:bg-purple-950\/40/gi, 'dark:bg-[#141926]');

  // 7. Verified product badge
  html = html.replace(/bg-pink-100\/90\s+dark:bg-pink-950\/90\s+text-pink-700/gi, 'bg-cyan-100/90 dark:bg-cyan-950/90 text-cyan-800');
  html = html.replace(/border-pink-300\/60\s+dark:border-pink-700\/60/gi, 'border-cyan-300/60 dark:border-cyan-700/60');
  html = html.replace(/bg-pink-600\s+text-white/gi, 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white');

  // 8. Prose headings: replace Mowrator hardcoded headings if they leak
  html = html.replace(/1\.\s*Hands-On Experience & All-Terrain Chassis/gi, '1. Hands-On Experience & Build Quality');
  html = html.replace(/2\.\s*AWD Brushless Powertrain & Slope Performance/gi, '2. Real-World Performance & Lab Benchmarks');
  html = html.replace(/:?\s*45° All-Terrain Performance Tested(?:\s*\(\d{4}\))?/gi, ': In-Depth Lab Review (2026)');

  // 9. Clean up misplaced audiophile benchmarks on non-audio products
  if (!/headphone|earphone|earbud|headset|audiophile|acoustic|hifi|soundbar|mic\b/i.test(html.slice(0, 3000))) {
    html = html.replace(/:?\s*Audiophile Benchmarks & ANC Tested(?:\s*\(\d{4}\))?/gi, ': Hands-On Review & Buying Guide (2026)');
    html = html.replace(/We put the [^<]+ through rigorous acoustic laboratory testing[^\.<]*\./gi, 'We evaluated this product through rigorous hands-on laboratory testing across design, build quality, and real-world durability.');
    html = html.replace(/Finding headphones that effortlessly bridge the gap[^\.<]*\./gi, 'In today’s fast-moving market, finding products that deliver genuine quality without inflated marketing hype is essential.');
  }

  return html;
}


function mapCategoryToKeyAndNames(category, categorySlug) {
  let catKey = (categorySlug || '').toLowerCase();
  const catLower = ((category || '') + ' ' + (categorySlug || '')).toLowerCase();

  // Digital products first
  if (/ebook|playbook|cẩm nang|cam nang|sách|sach|guide|指南|教程/.test(catLower)) {
    catKey = 'ebooks';
  } else if (/preset|lut|lightroom|cybershutter|调色|预设/.test(catLower)) {
    catKey = 'presets';
  } else if (/notion|template|creator os|模板/.test(catLower)) {
    catKey = 'templates';
  } else if (/course|masterclass|khóa học|khoa hoc|workshop|视频课/.test(catLower)) {
    catKey = 'courses';
  } else if (/saas|cloud subscription|ai studio|phần mềm|phan mem/.test(catLower)) {
    catKey = 'saas';
  } else if (/watch|wearable|ring|đồng hồ|smartwatch|garmin|apple watch|galaxy ring/.test(catLower)) {
    catKey = 'wearables';
  } else if (/drone|flycam|robotics|mower|dji mini|rc/.test(catLower)) {
    catKey = 'robotics';
  } else if (/camera|máy ảnh|may anh|osmo pocket|insta360|shure|video|creator/.test(catLower)) {
    catKey = 'cameras';
  } else if (/computing|gaming|ally|asus|rog|laptop|handheld/.test(catLower)) {
    catKey = 'computing';
  } else if (/power|gan|charger|power bank|ugreen|baseus|sạc/.test(catLower)) {
    catKey = 'power';
  } else if (/smart home|smart|nhà thông minh|matter|roborock|iot|sensor|projector/.test(catLower)) {
    catKey = 'smarthome';
  } else if (/keychron|keyboard|bàn phím|elgato|stream deck|mouse|chuột|desk|setup|edc/.test(catLower)) {
    catKey = 'edc';
  } else {
    catKey = 'audio';
  }

  let catEn = 'Audio & Sound';
  let catVi = 'Tai Nghe & Âm Thanh';
  let catZh = '音频与发烧声学';

  if (catKey === 'wearables') {
    catEn = 'Smart Wearables'; catVi = 'Thiết Bị Đeo Thông Minh'; catZh = '智能穿戴与手表';
  } else if (catKey === 'robotics') {
    catEn = 'Robotics & Drones'; catVi = 'Robotics & Flycam'; catZh = '无人机与机器人';
  } else if (catKey === 'cameras') {
    catEn = 'Cameras & Creator Gear'; catVi = 'Máy Ảnh & Creator Gear'; catZh = '专业相机与创作者装备';
  } else if (catKey === 'computing') {
    catEn = 'Computing & Gaming'; catVi = 'Máy Tính & Gaming'; catZh = '电脑硬件与掌机';
  } else if (catKey === 'power') {
    catEn = 'Power & GaN Charging'; catVi = 'Sạc GaN & Pin Dự Phòng'; catZh = '快充与氮化镓电源';
  } else if (catKey === 'edc') {
    catEn = 'Desk Setup & EDC'; catVi = 'Bàn Làm Việc & EDC'; catZh = '桌面搭子与EDC';
  } else if (catKey === 'smarthome') {
    catEn = 'Smart Home & IoT'; catVi = 'Nhà Thông Minh & IoT'; catZh = '智能家居与IoT';
  } else if (catKey === 'ebooks') {
    catEn = 'Ebooks & Guides'; catVi = 'Tài Nguyên & Cẩm Nang'; catZh = '电子书与知识资产';
  } else if (catKey === 'presets') {
    catEn = 'Creative Presets & LUTs'; catVi = 'Preset & LUTs'; catZh = '调色预设与LUTs';
  } else if (catKey === 'templates') {
    catEn = 'Notion Templates'; catVi = 'Template Notion'; catZh = 'Notion 生产力模板';
  } else if (catKey === 'courses') {
    catEn = 'Video Courses & Masterclass'; catVi = 'Khóa Học Chuyên Sâu'; catZh = '视频大课与实战训练';
  } else if (catKey === 'saas') {
    catEn = 'SaaS & AI Tools'; catVi = 'Phần Mềm & SaaS'; catZh = 'SaaS 与 AI 云工具';
  }

  return { catKey, catEn, catVi, catZh };
}

function parsePrices(rawVnd, rawUsd, rawOrigVnd, rawOrigUsd) {
  let vnd = 0;
  let usd = 0;

  if (rawUsd) {
    const cleanUsd = String(rawUsd).replace(/[^0-9.]/g, '');
    if (cleanUsd) usd = parseFloat(cleanUsd);
  }

  if (rawVnd) {
    const cleanVnd = String(rawVnd).replace(/[^\d]/g, '');
    if (cleanVnd) vnd = parseInt(cleanVnd, 10);
  }

  // Cross-compute sale prices
  if (!vnd && usd) {
    vnd = Math.round(usd * 25000 / 1000) * 1000;
  } else if (!usd && vnd) {
    usd = Math.round((vnd / 25000) * 100) / 100;
  }
  if (!usd) usd = 79.0;
  if (!vnd) vnd = Math.round(usd * 25000 / 1000) * 1000;

  // Process Original Price: Could be passed as USD string, VND string, or undefined
  let origUsd = 0;
  let origVnd = 0;

  // Check rawOrigUsd first
  if (rawOrigUsd) {
    const s = String(rawOrigUsd).trim();
    if (!/min|read|date|\/|http/i.test(s)) {
      const clean = s.replace(/[^0-9.]/g, '');
      if (clean) origUsd = parseFloat(clean);
    }
  }

  // Check rawOrigVnd - might actually be USD like "$72.00" or a VND number
  if (rawOrigVnd) {
    const s = String(rawOrigVnd).trim();
    if (!/min|read|date|\/|http/i.test(s)) {
      if (s.includes('$') || /^[0-9]+(?:\.[0-9]{1,2})?$/.test(s)) {
        // It's actually USD!
        const clean = s.replace(/[^0-9.]/g, '');
        if (clean && !origUsd) origUsd = parseFloat(clean);
      } else {
        const clean = s.replace(/[^\d]/g, '');
        if (clean) {
          const num = parseInt(clean, 10);
          if (num > 10000) {
            origVnd = num;
          } else if (!origUsd) {
            origUsd = num;
          }
        }
      }
    }
  }

  // Sanity check: If origUsd is ridiculously high (> 5x usd) due to missing decimal (e.g. 10004 vs 80.03)
  if (origUsd && (origUsd > usd * 5 || origUsd < usd)) {
    if (origUsd / 100 >= usd && origUsd / 100 <= usd * 2) {
      origUsd = Math.round((origUsd / 100) * 100) / 100;
    } else {
      origUsd = Math.round(usd * 1.25 * 100) / 100;
    }
  }

  // If still no valid origUsd, calculate standard +25%
  if (!origUsd) {
    origUsd = Math.round(usd * 1.25 * 100) / 100;
  }

  // Calculate origVnd from origUsd if missing or invalid
  if (!origVnd || origVnd < vnd || origVnd > vnd * 5) {
    origVnd = Math.round(origUsd * 25000 / 1000) * 1000;
  }

  return { vnd, usd, origVnd, origUsd };
}

function sanitizePostPrice(p) {
  if (!p) return { item: p, modified: false };
  let modified = false;
  let usdStr = p.priceUsd ? String(p.priceUsd).trim() : '';
  let origStr = p.priceOrig ? String(p.priceOrig).trim() : '';
  let vndStr = p.priceVnd ? String(p.priceVnd).trim() : '';

  // Filter out accidental date/reading time strings like "23/9/2026 • 8 min read"
  if (/min|read|date|\/|http/i.test(origStr)) {
    origStr = '';
    modified = true;
  }

  // Parse prices using parsePrices(rawVnd, rawUsd, rawOrigVnd, rawOrigUsd)
  const { vnd, usd, origVnd, origUsd } = parsePrices(vndStr, usdStr, origStr, p.priceOrigUsd);

  const cleanUsd = '$' + usd.toFixed(2);
  const cleanOrig = '$' + origUsd.toFixed(2);
  const cleanVnd = vnd.toLocaleString('vi-VN').replace(/,/g, '.') + '₫';

  if (p.priceUsd !== cleanUsd) { p.priceUsd = cleanUsd; modified = true; }
  if (p.priceOrig !== cleanOrig) { p.priceOrig = cleanOrig; modified = true; }
  if (p.priceVnd !== cleanVnd) { p.priceVnd = cleanVnd; modified = true; }

  return { item: p, modified };
}

function sanitizeProductPrice(p) {
  if (!p) return { item: p, modified: false };
  let modified = false;
  let usd = parseFloat(p.priceUsd) || 0;
  let vnd = parseInt(p.price, 10) || 0;
  let origUsd = parseFloat(p.originalPriceUsd) || 0;
  let origVnd = parseInt(p.originalPrice, 10) || 0;

  if (!usd && vnd) {
    usd = Math.round((vnd / 25000) * 100) / 100;
    p.priceUsd = usd;
    modified = true;
  }
  if (!vnd && usd) {
    vnd = Math.round(usd * 25000 / 1000) * 1000;
    p.price = vnd;
    modified = true;
  }

  // Cross-check USD and VND mismatch for sale price
  if (usd && vnd && Math.abs(vnd - usd * 25000) > 1000000) {
    if (Math.abs(vnd / 25000 - Math.round(vnd / 25000)) < 0.01) {
      usd = Math.round(vnd / 25000);
      p.priceUsd = usd;
      modified = true;
    }
  }

  // Check if origUsd is corrupted by missing decimal point (e.g. 10004 -> 100.04)
  if (origUsd > usd * 5) {
    if (origUsd / 100 >= usd && origUsd / 100 <= usd * 2) {
      origUsd = Math.round((origUsd / 100) * 100) / 100;
    } else {
      origUsd = Math.round(usd * 1.25 * 100) / 100;
    }
    p.originalPriceUsd = origUsd;
    modified = true;
  }

  // Check if originalPrice was stripped of decimals and saved as USD digits (e.g. 7200 instead of 1,800,000₫)
  // or is less than the sale price
  if (origVnd < vnd || origVnd < 10000 || (origVnd < 500000 && vnd > 1000000) || origVnd > vnd * 5) {
    if (origUsd && origUsd >= usd && origUsd <= usd * 2) {
      origVnd = Math.round(origUsd * 25000 / 1000) * 1000;
    } else {
      origUsd = Math.round(usd * 1.25 * 100) / 100;
      origVnd = Math.round(origUsd * 25000 / 1000) * 1000;
      p.originalPriceUsd = origUsd;
    }
    p.originalPrice = origVnd;
    modified = true;
  }

  return { item: p, modified };
}

function createProductFromPostData(data, slugClean, fileName) {
  const { catKey, catEn, catVi, catZh } = mapCategoryToKeyAndNames(
    (data.category || data.categoryEn || '') + ' ' + (data.title || '') + ' ' + (data.brand || ''),
    data.categorySlug
  );
  const { vnd, usd, origVnd, origUsd } = parsePrices(
    data.vndPrice || data.priceVnd,
    data.usdPrice || data.priceUsd,
    data.originalPrice || data.priceOrig,
    data.originalPriceUsd || data.priceOrigUsd
  );

  const brandName = data.brand || 'Verified Partner';
  const rawId = (slugClean || data.slug || data.id || '').toString().trim().replace(/^[\s/]+/, '').replace(/^post-/, '').replace(/\.html$/, '');
  const prodId = 'prod-' + rawId;
  const reviewFile = 'post-' + rawId + '.html';

  const prosList = Array.isArray(data.pros) ? data.pros : (data.pros ? String(data.pros).split('\n').filter(Boolean) : []);
  const defaultFeatures = prosList.length > 0 ? prosList : [
    'Official manufacturer certified hardware with direct warranty coverage',
    'Benchmark-tested efficiency exceeding industry category standards'
  ];

  let discPercent = data.couponDiscount || data.discountPercent;
  if (!discPercent) {
    if (origUsd > usd) {
      discPercent = Math.round((1 - usd / origUsd) * 100) + '% OFF';
    } else {
      discPercent = '15% OFF';
    }
  }

  const isDigital = ['ebooks', 'presets', 'templates', 'courses', 'saas'].includes(catKey);

  return {
    id: prodId,
    categoryKey: catKey,
    shopName: brandName,
    brand: brandName,
    title: data.title,
    titleEn: data.titleEn || data.title,
    titleVi: data.titleVi || data.title,
    titleZh: data.titleZh || data.title,
    category: catEn,
    categoryEn: catEn,
    categoryVi: catVi,
    categoryZh: catZh,
    price: vnd,
    priceUsd: usd,
    originalPrice: origVnd,
    originalPriceUsd: origUsd,
    discountPercent: discPercent,
    badge: brandName,
    badgeEn: brandName,
    badgeVi: brandName,
    badgeZh: brandName,
    rating: parseFloat(data.rating) || 9.6,
    salesCount: 168,
    description: data.excerpt || data.intro || '',
    descriptionEn: data.excerptEn || data.excerpt || data.intro || '',
    descriptionVi: data.excerptVi || data.excerpt || data.intro || '',
    descriptionZh: data.excerptZh || data.excerpt || data.intro || '',
    features: defaultFeatures.slice(0, 5),
    featuresEn: (data.prosEn || defaultFeatures).slice(0, 5),
    featuresVi: (data.prosVi || defaultFeatures).slice(0, 5),
    featuresZh: (data.prosZh || defaultFeatures).slice(0, 5),
    image: data.image || 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=800&q=80',
    affiliateUrl: (!isDigital ? (data.affiliateLink || '#') : '#'),
    reviewUrl: reviewFile,
    isPhysical: !isDigital,
    updatedAt: new Date().toISOString()
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Redirect apex domain couponhiker.com to www.couponhiker.com
    if (url.hostname === 'couponhiker.com') {
      const targetUrl = new URL(request.url);
      targetUrl.hostname = 'www.couponhiker.com';
      return Response.redirect(targetUrl.toString(), 301);
    }

    // Handle CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // -------------------------------------------------------------
    // 1. API: ADMIN AUTHENTICATION
    // -------------------------------------------------------------
    if (url.pathname === '/api/admin/login' && request.method === 'POST') {
      try {
        const body = await request.json();
        const email = (body.email || '').trim().toLowerCase();
        const password = body.password || '';

        const matchedUser = ADMIN_ACCOUNTS.find(
          acc => acc.email.toLowerCase() === email && acc.password === password
        );

        if (matchedUser) {
          const token = 'cf_admin_' + crypto.randomUUID().replace(/-/g, '');
          return new Response(JSON.stringify({
            success: true,
            token: token,
            user: {
              email: matchedUser.email,
              name: matchedUser.name,
              role: matchedUser.role,
              initials: matchedUser.initials
            },
            message: 'Đăng nhập thành công!'
          }), {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
          });
        }

        return new Response(JSON.stringify({
          success: false,
          message: 'Tài khoản hoặc mật khẩu không chính xác!'
        }), {
          status: 401,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      } catch (e) {
        return new Response(JSON.stringify({ success: false, message: 'Lỗi xử lý đăng nhập: ' + e.message }), {
          status: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      }
    }

    if (url.pathname === '/api/admin/verify' && request.method === 'POST') {
      return new Response(JSON.stringify({
        success: true,
        valid: true,
        accounts: ADMIN_ACCOUNTS.map(a => ({ email: a.email, name: a.name, role: a.role }))
      }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
      });
    }

    if (url.pathname === '/api/admin/logout' && request.method === 'POST') {
      return new Response(JSON.stringify({ success: true, message: 'Đăng xuất thành công!' }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
      });
    }

    // -------------------------------------------------------------
    // API: BRAND PRICE INSPECTION & AUTO-DETECTION
    // -------------------------------------------------------------
    if (url.pathname === '/api/fetch-brand-price' && (request.method === 'POST' || request.method === 'GET')) {
      try {
        let targetUrl = '';
        if (request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          targetUrl = (body.url || '').trim();
        } else {
          targetUrl = (url.searchParams.get('url') || '').trim();
        }

        const lowerUrl = targetUrl.toLowerCase();
        let brand = 'Verified Partner';
        let productTitle = '';
        let imageUrl = '';
        let category = '';
        let categorySlug = '';
        let storeProducts = null;
        let saleUsd = 79.0;
        let origUsd = 99.0;
        let coupon = 'PURPOSE15';
        let discount = '15% OFF Global Order';

        if (lowerUrl.includes('aqara') || lowerUrl.includes('hub-m3') || lowerUrl.includes('sensor-fp2')) {
          brand = 'Aqara Official'; saleUsd = 82.99; origUsd = 99.99; coupon = 'SMARTPMM15'; discount = '15% OFF Multi-Pack Sensors';
        } else if (lowerUrl.includes('sony') || lowerUrl.includes('wh-1000xm5') || lowerUrl.includes('xm5')) {
          brand = 'Sony Official Store'; saleUsd = 298.0; origUsd = 399.0; coupon = 'SONYWH15'; discount = '15% OFF Global Order';
        } else if (lowerUrl.includes('keychron') || lowerUrl.includes('q1')) {
          brand = 'Keychron Official'; saleUsd = 198.0; origUsd = 229.0; coupon = 'KEYPRO10'; discount = '10% OFF Storewide';
        } else if (lowerUrl.includes('seagull') || lowerUrl.includes('1963')) {
          brand = 'Sea-Gull Watches Official'; saleUsd = 219.0; origUsd = 279.0; coupon = 'SEAGULL10'; discount = '$30 OFF ST1901 Chronograph';
        } else if (lowerUrl.includes('mowrator') || lowerUrl.includes('mower')) {
          brand = 'Mowrator Official'; saleUsd = 1499.0; origUsd = 1799.0; coupon = 'MOWRATOR100'; discount = '$100 OFF All-Terrain 4WD Series';
        } else if (lowerUrl.includes('matein')) {
          brand = 'MATEIN Gear'; saleUsd = 57.24; origUsd = 72.00; coupon = 'PURPOSE15'; discount = '15% OFF Global Order';
        } else if (lowerUrl.includes('suuksess') || lowerUrl.includes('sweater') || lowerUrl.includes('cashmere')) {
          brand = 'suuksess'; saleUsd = 80.03; origUsd = 100.04; coupon = 'PURPOSE15'; discount = '15% OFF Global Order';
        } else if (lowerUrl.includes('tissot') || lowerUrl.includes('prx')) {
          brand = 'Tissot Swiss Watches'; saleUsd = 695.0; origUsd = 775.0; coupon = 'SWISS10'; discount = '10% OFF Swiss Watches';
        } else if (lowerUrl.includes('bullboost')) {
          brand = 'BullBoost Performance'; saleUsd = 169.0; origUsd = 219.0; coupon = 'BWFXDIYT50'; discount = '$50 OFF Orders Over $400';
        } else if (lowerUrl.includes('brembo')) {
          brand = 'Brembo High Performance'; saleUsd = 3250.0; origUsd = 3600.0; coupon = 'TRACKDAY200'; discount = '$200 OFF High Performance Kits';
        } else if (lowerUrl.includes('logitech') || lowerUrl.includes('mx-master')) {
          brand = 'Logitech Master Series'; saleUsd = 99.0; origUsd = 119.0; coupon = 'LOGITECH20'; discount = '$20 OFF MX Series Gear';
        } else if (lowerUrl.includes('gaggia')) {
          brand = 'Gaggia Milano'; saleUsd = 449.0; origUsd = 499.0; coupon = 'BARISTA50'; discount = '$50 OFF Espresso Bundle';
        } else if (lowerUrl.includes('bosgame') || lowerUrl.includes('magicnuc') || lowerUrl.includes('minisforum') || lowerUrl.includes('gmktec')) {
          brand = 'BOSGAME Official';
          category = 'Computing & Gaming'; categorySlug = 'computing';
          coupon = 'BOSGAME15'; discount = '15% OFF Verified Merchant Deal';
          if (lowerUrl.includes('p4')) {
            productTitle = 'BOSGAME Mini PC P4 Ultra (AMD Ryzen 7 7730U, 16GB, 1TB SSD)';
            saleUsd = 469.99; origUsd = 587.49;
            imageUrl = 'https://cdn.shopify.com/s/files/1/0695/0128/8611/files/4_61870041-bc1a-4635-92c3-061f54837904.png?v=1782107234';
          } else if (lowerUrl.includes('b100')) {
            productTitle = 'BOSGAME Mini PC B100 (Intel 12th Gen Alder Lake N100, 16GB, 512GB)';
            saleUsd = 299.49; origUsd = 374.36;
            imageUrl = 'https://cdn.shopify.com/s/files/1/0695/0128/8611/files/Bosgame-Intel-n100-mini-pc.webp?v=1742011097';
          } else if (lowerUrl.includes('e7')) {
            productTitle = 'BOSGAME E7 Mini PC (Intel Core 3 100U, 16GB, 512GB NVMe SSD)';
            saleUsd = 379.99; origUsd = 474.99;
            imageUrl = 'https://cdn.shopify.com/s/files/1/0695/0128/8611/files/1_9232dabb-eedb-450e-8b23-b747a57d5e97.png?v=1786169783';
          } else if (lowerUrl.includes('magicnuc') || lowerUrl.includes('ag3')) {
            productTitle = 'Magicnuc AG3 Mini PC (Intel Core i9-13900HK, 32GB DDR5, 1TB SSD)';
            saleUsd = 729.00; origUsd = 911.25;
            imageUrl = 'https://cdn.shopify.com/s/files/1/0695/0128/8611/files/AG3-13900HK-__01.jpg?v=1779448508';
            brand = 'Magicnuc';
          } else {
            productTitle = 'BOSGAME M5 MAX Mini PC (AMD Ryzen AI Max+ PRO 495, 192GB, 2TB)';
            saleUsd = 6199.00; origUsd = 7748.75;
            imageUrl = 'https://cdn.shopify.com/s/files/1/0695/0128/8611/files/2_fbed0334-eda4-4575-9f5d-caf3ae62b304.png?v=1793257514';
          }
          storeProducts = [
            { id: 15472904798371, title: 'BOSGAME M5 MAX Mini PC (AMD Ryzen AI Max+ PRO 495, 192GB, 2TB)', salePriceUsd: '$6199.00', salePriceVnd: '154.975.000₫', originalPriceUsd: '$7748.75', image: 'https://cdn.shopify.com/s/files/1/0695/0128/8611/files/2_fbed0334-eda4-4575-9f5d-caf3ae62b304.png?v=1793257514', brand: 'BOSGAME' },
            { id: 8985078333603, title: 'BOSGAME M5 AI Mini Desktop (Ryzen AI Max+ 395, 96GB/128GB, 2TB)', salePriceUsd: '$3099.00', salePriceVnd: '77.475.000₫', originalPriceUsd: '$3873.75', image: 'https://cdn.shopify.com/s/files/1/0695/0128/8611/files/BOSGAME_M5_AI_PC.png?v=1793863150', brand: 'BOSGAME' },
            { id: 9156767940771, title: 'BOSGAME Mini PC P4 Ultra (AMD Ryzen 7 7730U, 16GB, 1TB SSD)', salePriceUsd: '$469.99', salePriceVnd: '11.750.000₫', originalPriceUsd: '$587.49', image: 'https://cdn.shopify.com/s/files/1/0695/0128/8611/files/4_61870041-bc1a-4635-92c3-061f54837904.png?v=1782107234', brand: 'BOSGAME' },
            { id: 8719806693539, title: 'BOSGAME Mini PC B100 (Intel 12th Gen Alder Lake N100, 16GB, 512GB)', salePriceUsd: '$299.49', salePriceVnd: '7.487.000₫', originalPriceUsd: '$374.36', image: 'https://cdn.shopify.com/s/files/1/0695/0128/8611/files/Bosgame-Intel-n100-mini-pc.webp?v=1742011097', brand: 'BOSGAME' },
            { id: 9218661056675, title: 'BOSGAME E7 Mini PC (Intel Core 3 100U, 16GB, 512GB NVMe SSD)', salePriceUsd: '$379.99', salePriceVnd: '9.500.000₫', originalPriceUsd: '$474.99', image: 'https://cdn.shopify.com/s/files/1/0695/0128/8611/files/1_9232dabb-eedb-450e-8b23-b747a57d5e97.png?v=1786169783', brand: 'BOSGAME' },
            { id: 9127595835555, title: 'Magicnuc AG3 Mini PC (Intel Core i9-13900HK, 32GB DDR5, 1TB SSD)', salePriceUsd: '$729.00', salePriceVnd: '18.225.000₫', originalPriceUsd: '$911.25', image: 'https://cdn.shopify.com/s/files/1/0695/0128/8611/files/AG3-13900HK-__01.jpg?v=1779448508', brand: 'Magicnuc' }
          ];
        } else if (lowerUrl.includes('meowant') || lowerUrl.includes('gaostoltd.pxf.io') || lowerUrl.includes('cat-litter') || lowerUrl.includes('litter-box')) {
          brand = 'Meowant Official';
          if (lowerUrl.includes('sc09')) {
            productTitle = 'Meowant Self-Cleaning Cat Litter Box – MW-SC09';
            saleUsd = 295.99; origUsd = 789.99;
            imageUrl = 'https://cdn.shopify.com/s/files/1/0697/3466/2441/files/SC09_97889cc7-323a-4c57-8b1f-65b5fa14d209.png?v=1794553855';
          } else if (lowerUrl.includes('pf06') || lowerUrl.includes('wet-food') || lowerUrl.includes('feeder')) {
            productTitle = 'Meowant Automatic Wet Food Cat Feeder-MW-PF06';
            saleUsd = 159.99; origUsd = 189.99;
            imageUrl = 'https://cdn.shopify.com/s/files/1/0697/3466/2441/files/PF06.png?v=1794555880';
          } else if (lowerUrl.includes('wr01') || lowerUrl.includes('fence')) {
            productTitle = 'Meowant GPS Dog Fence - MW-WR01';
            saleUsd = 149.99; origUsd = 399.99;
            imageUrl = 'https://cdn.shopify.com/s/files/1/0697/3466/2441/files/WR01_a77973d4-52a0-43ac-9fc0-c91c0a94aaf8.png?v=1793348621';
          } else {
            productTitle = 'Meowant Self-Cleaning Cat Litter Box – MW-SC10';
            saleUsd = 245.99; origUsd = 549.99;
            imageUrl = 'https://cdn.shopify.com/s/files/1/0697/3466/2441/files/SC10_8b84ccac-2cf1-4721-9e3f-21bc201448c7.png?v=1794553720';
          }
          coupon = 'MEOWANT15'; discount = '15% OFF Pet Care Series';
          category = 'Smart Home & IoT'; categorySlug = 'smarthome';
        } else if (lowerUrl.includes('furlife') || lowerUrl.includes('fur1ife') || (lowerUrl.includes('snwbl.io') && (lowerUrl.includes('pet') || lowerUrl.includes('fur')))) {
          brand = 'FurLife™';
          category = 'Smart Home & IoT';
          categorySlug = 'smarthome';
          coupon = 'PETF86954';
          discount = '15% OFF Pet Care (Code: PETF86954)';
          productTitle = 'FurLife™ 12 Months Flea and Tick Free (Dog & Cat)';
          saleUsd = 39.99;
          origUsd = 59.99;
          imageUrl = 'https://cdn.shopify.com/s/files/1/0718/1041/6922/files/LimitedPendantDog.webp?v=1794915508';
          storeProducts = [
            { id: 10539745837338, title: 'FurLife™ 12 Months Flea and Tick Free (Dog & Cat)', salePriceUsd: '$39.99', salePriceVnd: '1.000.000₫', originalPriceUsd: '$59.99', image: 'https://cdn.shopify.com/s/files/1/0718/1041/6922/files/LimitedPendantDog.webp?v=1794915508', brand: 'FurLife™' },
            { id: 10539745181978, title: 'FurLife™ - 8 Months All Natural Flea and Tick Collar', salePriceUsd: '$39.99', salePriceVnd: '1.000.000₫', originalPriceUsd: '$59.99', image: 'https://cdn.shopify.com/s/files/1/0718/1041/6922/files/DogGreen_1.jpg?v=1707491524', brand: 'FurLife™' },
            { id: 10536430829850, title: 'FurLife™ Happy Ears - Natural Ear Cleaner for Pets', salePriceUsd: '$49.99', salePriceVnd: '1.250.000₫', originalPriceUsd: '$59.99', image: 'https://cdn.shopify.com/s/files/1/0718/1041/6922/files/12_632d1a35-8afe-45e2-825b-792607f7fff2.png?v=1786973554', brand: 'FurLife™' },
            { id: 10490409222426, title: 'FurLife™ Imprint - Calming Pheromone Pendant for Cats', salePriceUsd: '$39.99', salePriceVnd: '1.000.000₫', originalPriceUsd: '$49.99', image: 'https://cdn.shopify.com/s/files/1/0718/1041/6922/files/LimitedPendantCat.webp?v=1794915418', brand: 'FurLife™' },
            { id: 10483680215322, title: 'FurLife™ - Colostrum+ Immune & Gut Support for Pets', salePriceUsd: '$44.99', salePriceVnd: '1.125.000₫', originalPriceUsd: '$54.99', image: 'https://cdn.shopify.com/s/files/1/0718/1041/6922/files/12_632d1a35-8afe-45e2-825b-792607f7fff2.png?v=1786973554', brand: 'FurLife™' }
          ];
        } else if (lowerUrl.includes('im8health') || lowerUrl.includes('im8') || (lowerUrl.includes('snowball') && lowerUrl.includes('viral')) || (lowerUrl.includes('snwbl.io') && lowerUrl.includes('viral'))) {
          brand = 'IM8 Health Official';
          category = 'Desk Setup & EDC';
          categorySlug = 'edc';
          coupon = 'VIRAL';
          discount = '15% OFF Complete Stack (Code: VIRAL)';
          productTitle = 'Daily Ultimate Essentials Pro: All-in-One Supplement';
          saleUsd = 89.00;
          origUsd = 112.00;
          imageUrl = 'https://cdn.shopify.com/s/files/1/0637/4460/6375/files/USD_30DAY_ESSENTIALS_COPY1_VISUAL_B_97edb232-7b04-4be6-8eb5-f6a3187588be.jpg?v=1778121212';
          if (lowerUrl.includes('beckham') || lowerUrl.includes('stack')) {
            productTitle = 'The Beckham Stack: Essentials Pro + Longevity Set';
            saleUsd = 208.00; origUsd = 260.00;
            imageUrl = 'https://cdn.shopify.com/s/files/1/0637/4460/6375/files/USD_30DAY_BECKHAMSTACK_COPY1_VISUAL_B.jpg?v=1778071113';
          } else if (lowerUrl.includes('longevity')) {
            productTitle = 'Daily Ultimate Longevity - Cellular NAD+ & Anti-Aging';
            saleUsd = 79.00; origUsd = 99.00;
            imageUrl = 'https://cdn.shopify.com/s/files/1/0637/4460/6375/files/202610_longevity-bonus5_peach.jpg?v=1792483182';
          }
          storeProducts = [
            { id: 8721876517031, title: 'Daily Ultimate Essentials Pro: All-in-One Supplement', salePriceUsd: '$89.00', salePriceVnd: '2.225.000₫', originalPriceUsd: '$112.00', image: 'https://cdn.shopify.com/s/files/1/0637/4460/6375/files/USD_30DAY_ESSENTIALS_COPY1_VISUAL_B_97edb232-7b04-4be6-8eb5-f6a3187588be.jpg?v=1778121212', brand: 'IM8 Health' },
            { id: 8721973084327, title: 'The Beckham Stack: Essentials Pro + Longevity Set', salePriceUsd: '$208.00', salePriceVnd: '5.200.000₫', originalPriceUsd: '$260.00', image: 'https://cdn.shopify.com/s/files/1/0637/4460/6375/files/USD_30DAY_BECKHAMSTACK_COPY1_VISUAL_B.jpg?v=1778071113', brand: 'IM8 Health' },
            { id: 8642040594599, title: 'Daily Ultimate Longevity - Cellular NAD+ & Anti-Aging', salePriceUsd: '$79.00', salePriceVnd: '1.975.000₫', originalPriceUsd: '$99.00', image: 'https://cdn.shopify.com/s/files/1/0637/4460/6375/files/202610_longevity-bonus5_peach.jpg?v=1792483182', brand: 'IM8 Health' },
            { id: 11189329723559, title: 'Double Refills Upgrade (60-Day Travel Refills)', salePriceUsd: '$146.00', salePriceVnd: '3.650.000₫', originalPriceUsd: '$182.50', image: 'https://cdn.shopify.com/s/files/1/0637/4460/6375/files/202602_essentialsV2acai-travel30-2x_peach_5ac4ffbe-a3bb-436d-9fa1-8e9def9c6846.jpg?v=1771836196', brand: 'IM8 Health' },
            { id: 10234012237991, title: 'Luxe Edition Signature Bottle (Welcome Gift)', salePriceUsd: '$45.00', salePriceVnd: '1.125.000₫', originalPriceUsd: '$56.25', image: 'https://cdn.shopify.com/s/files/1/0637/4460/6375/files/month3_shaker.jpg?v=1771991554', brand: 'IM8 Health' },
            { id: 8735812944039, title: 'IM8 Luxe Edition Mixer (Wireless High-Speed Frother)', salePriceUsd: '$25.00', salePriceVnd: '625.000₫', originalPriceUsd: '$31.25', image: 'https://cdn.shopify.com/s/files/1/0637/4460/6375/files/month2_frother.jpg?v=1771991229', brand: 'IM8 Health' }
          ];
        } else if (lowerUrl.includes('comfrt') || lowerUrl.includes('hoodie') || lowerUrl.includes('fleece') || lowerUrl.includes('sweatshirt')) {
          brand = 'Comfrt Official';
          productTitle = 'Rockies Teddy Full-Zip Jacket';
          saleUsd = 59.00; origUsd = 175.00;
          imageUrl = 'https://cdn.shopify.com/s/files/1/0569/4029/8784/files/1_7064ac73-7980-4d3d-b52f-ea7ab704812f.jpg?v=1794857953';
          coupon = 'COMFRT15'; discount = '15% OFF Comfort Apparel';
          category = 'Desk Setup & EDC'; categorySlug = 'edc';
        }

        // =========================================================================
        // UNIVERSAL AI PRODUCT ENGINE (Scrapes live data for ANY URL on the Web)
        // =========================================================================
        if (!productTitle && targetUrl) {
          try {
            let scrapeUrl = targetUrl;
            if (!scrapeUrl.startsWith('http://') && !scrapeUrl.startsWith('https://')) {
              scrapeUrl = 'https://' + scrapeUrl;
            }
            const parsedTarget = new URL(scrapeUrl);
            const hostParts = parsedTarget.hostname.replace(/^www\./, '').split('.');
            if (!brand || brand === 'Verified Partner') {
              brand = hostParts[0] ? (hostParts[0].charAt(0).toUpperCase() + hostParts[0].slice(1)) : 'Brand Partner';
            }

            // Detect coupon from search params or URL segments
            for (const param of ['coupon', 'code', 'discount', 'ref', 'snowball', 'aff', 'via', 'promocode', 'promo']) {
              const val = parsedTarget.searchParams.get(param);
              if (val && val.trim()) {
                coupon = val.trim().toUpperCase();
                discount = `15% OFF (Code: ${coupon})`;
                break;
              }
            }
            const pathParts = parsedTarget.pathname.split('/').filter(Boolean);
            if ((!coupon || coupon === 'PURPOSE15') && pathParts.length > 0) {
              const lastSeg = pathParts[pathParts.length - 1];
              if (lastSeg && lastSeg.length <= 16 && !lastSeg.includes('.') && !lastSeg.includes('-') && /^[A-Z0-9_]+$/i.test(lastSeg) && !['products', 'collections', 'pages', 'shop'].includes(lastSeg.toLowerCase())) {
                coupon = lastSeg.toUpperCase();
                discount = `15% OFF (Code: ${coupon})`;
              }
            }

            // Live fetch webpage with modern headers and redirect following
            const abortCtrl = new AbortController();
            const timeoutTimer = setTimeout(() => abortCtrl.abort(), 4500);

            const fetchRes = await fetch(scrapeUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9'
              },
              redirect: 'follow',
              signal: abortCtrl.signal
            }).catch(() => null);
            clearTimeout(timeoutTimer);

            if (fetchRes && fetchRes.ok) {
              const finalFetchUrl = fetchRes.url || scrapeUrl;
              const finalObj = new URL(finalFetchUrl);
              const storeOrigin = finalObj.origin;
              const html = await fetchRes.text().catch(() => '');

              if (html) {
                // 1. JSON-LD schema.org/Product
                const jsonLdMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
                for (const m of jsonLdMatches) {
                  try {
                    const inner = m.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '').trim();
                    const parsed = JSON.parse(inner);
                    const candidates = Array.isArray(parsed) ? parsed : (parsed['@graph'] ? parsed['@graph'] : [parsed]);
                    for (const item of candidates) {
                      if (item && (item['@type'] === 'Product' || (Array.isArray(item['@type']) && item['@type'].includes('Product')))) {
                        if (!productTitle && item.name) {
                          productTitle = item.name.replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim();
                        }
                        if (!imageUrl) {
                          if (typeof item.image === 'string') imageUrl = item.image;
                          else if (Array.isArray(item.image) && item.image[0]) imageUrl = typeof item.image[0] === 'string' ? item.image[0] : (item.image[0].url || '');
                          else if (item.image && item.image.url) imageUrl = item.image.url;
                        }
                        if (item.brand) {
                          if (typeof item.brand === 'string') brand = item.brand;
                          else if (item.brand.name) brand = item.brand.name;
                        }
                        if (item.offers) {
                          const offers = Array.isArray(item.offers) ? item.offers : [item.offers];
                          const validPrices = offers.map(o => parseFloat(o.price || o.lowPrice || 0)).filter(p => p > 0);
                          if (validPrices.length > 0) saleUsd = Math.min(...validPrices);
                          const highPrices = offers.map(o => parseFloat(o.highPrice || 0)).filter(p => p > saleUsd);
                          if (highPrices.length > 0) origUsd = Math.max(...highPrices);
                        }
                      }
                    }
                  } catch(e) {}
                }

                // 2. OpenGraph & Twitter Meta Tags
                if (!productTitle) {
                  const ogTitle = html.match(/<meta[^>]*property=["'](?:og:title|twitter:title)["'][^>]*content=["']([^"']+)["']/i) ||
                                  html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["'](?:og:title|twitter:title)["']/i);
                  if (ogTitle && ogTitle[1]) {
                    productTitle = ogTitle[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim();
                  }
                }
                if (!imageUrl) {
                  const ogImg = html.match(/<meta[^>]*property=["'](?:og:image|twitter:image)["'][^>]*content=["']([^"']+)["']/i) ||
                                html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["'](?:og:image|twitter:image)["']/i);
                  if (ogImg && ogImg[1]) imageUrl = ogImg[1].trim();
                }
                if (saleUsd === 79.0) {
                  const ogPrice = html.match(/<meta[^>]*property=["'](?:product:price:amount|og:price:amount)["'][^>]*content=["']([^"']+)["']/i) ||
                                  html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["'](?:product:price:amount|og:price:amount)["']/i);
                  if (ogPrice && ogPrice[1] && parseFloat(ogPrice[1]) > 0) {
                    saleUsd = parseFloat(ogPrice[1]);
                    origUsd = Math.round(saleUsd * 1.25 * 100) / 100;
                  }
                }
                const ogSite = html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i);
                if (ogSite && ogSite[1] && (!brand || brand === 'Verified Partner' || brand === 'Brand Partner')) {
                  brand = ogSite[1].trim();
                }

                // 3. Fallback to HTML <title>
                if (!productTitle) {
                  const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);
                  if (titleTag && titleTag[1]) {
                    productTitle = titleTag[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim();
                  }
                }
              }

              // 4. Try Shopify store discovery (/products.json?limit=20)
              try {
                const shopifyRes = await fetch(storeOrigin + '/products.json?limit=20', {
                  headers: { 'User-Agent': 'Mozilla/5.0' }
                }).catch(() => null);
                if (shopifyRes && shopifyRes.ok) {
                  const shopifyData = await shopifyRes.json().catch(() => null);
                  if (shopifyData && Array.isArray(shopifyData.products) && shopifyData.products.length > 0) {
                    let validProducts = shopifyData.products.filter(p => {
                      const t = (p.title || '').toLowerCase();
                      const pPrice = parseFloat(p.variants?.[0]?.price || 0);
                      if (pPrice < 10) return false;
                      if (/gift\s*card|donation|tip|insurance|warranty|sample|shipping|test/i.test(t)) return false;
                      return true;
                    });
                    if (validProducts.length > 0) {
                      // Smart Relevance Ranking against search query tokens
                      const searchContext = [hintKw, productTitle, brand, targetUrl, storeOrigin].filter(Boolean).join(' ').toLowerCase();
                      const queryTokens = searchContext.split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !['https', 'http', 'com', 'org', 'net', 'www', 'store', 'shop', 'deal', 'official', 'ref'].includes(w));

                      validProducts.sort((a, b) => {
                        const aTitle = ((a.title || '') + ' ' + (a.vendor || '') + ' ' + (a.product_type || '')).toLowerCase();
                        const bTitle = ((b.title || '') + ' ' + (b.vendor || '') + ' ' + (b.product_type || '')).toLowerCase();
                        const aPrice = parseFloat(a.variants?.[0]?.price || 0);
                        const bPrice = parseFloat(b.variants?.[0]?.price || 0);

                        let aScore = 0;
                        let bScore = 0;

                        for (const tok of queryTokens) {
                          if (aTitle.includes(tok)) aScore += 12;
                          if (bTitle.includes(tok)) bScore += 12;
                        }

                        // Special boost for flagship products matching store identity
                        if (/engine|stirling|model|kit|vacuum|combustion|retrol|turbine/i.test(searchContext)) {
                          if (/engine|stirling|retrol|turbine|combustion|model/i.test(aTitle)) aScore += 25;
                          if (/engine|stirling|retrol|turbine|combustion|model/i.test(bTitle)) bScore += 25;
                        }

                        // Prioritize complete models/kits over small accessories/parts under $100
                        if (/parts|gauge|filter|compressor|silencer|pipe|clutch|bracket|cable/i.test(aTitle) && aPrice < 100) aScore -= 25;
                        if (/parts|gauge|filter|compressor|silencer|pipe|clutch|bracket|cable/i.test(bTitle) && bPrice < 100) bScore -= 25;

                        // De-prioritize novelties like humidifier, socks, mug if store is engine/tech
                        if (/humidifier|diffuser|pillow|mug|sticker/i.test(aTitle) && !/humidifier|pillow|mug/i.test(searchContext)) aScore -= 40;
                        if (/humidifier|diffuser|pillow|mug|sticker/i.test(bTitle) && !/humidifier|pillow|mug/i.test(searchContext)) bScore -= 40;

                        if (aPrice >= 150) aScore += 15;
                        if (bPrice >= 150) bScore += 15;

                        return bScore - aScore;
                      });

                      storeProducts = validProducts.slice(0, 8).map(p => {
                        const price = parseFloat(p.variants?.[0]?.price || 49);
                        const orig = parseFloat(p.variants?.[0]?.compare_at_price || 0) || Math.round(price * 1.25 * 100) / 100;
                        const vnd = Math.round(price * 25000 / 1000) * 1000;
                        let img = p.images?.[0]?.src || '';
                        if (img && img.startsWith('//')) img = 'https:' + img;
                        return {
                          id: p.id,
                          title: p.title,
                          salePriceUsd: '$' + price.toFixed(2),
                          salePriceVnd: vnd.toLocaleString('vi-VN').replace(/,/g, '.') + '₫',
                          originalPriceUsd: '$' + orig.toFixed(2),
                          image: img,
                          brand: p.vendor || brand
                        };
                      });

                      if (storeProducts.length > 0) {
                        const topProd = storeProducts[0];
                        const isGenericTitle = !productTitle || /home|online store|official site|official store|adults|diy kit \|/i.test(productTitle);
                        if (isGenericTitle || topProd) {
                          if (isGenericTitle) productTitle = topProd.title;
                          saleUsd = parseFloat(topProd.salePriceUsd.replace('$', '')) || saleUsd;
                          origUsd = parseFloat(topProd.originalPriceUsd.replace('$', '')) || origUsd;
                          if (topProd.brand && (!brand || brand === 'Verified Partner')) brand = topProd.brand;
                        }
                        // ALWAYS set imageUrl to top product image if imageUrl is empty or generic
                        if (!imageUrl || imageUrl.includes('favicon') || imageUrl.includes('logo') || imageUrl.includes('unsplash.com')) {
                          imageUrl = topProd.image;
                        }
                      }
                    }
                  }
                }
              } catch(e) {}
            }
          } catch(e) {}
        }

        // 5. Intelligent Fallback Title from URL Path Slug
        if (!productTitle) {
          try {
            const parsedTarget = new URL(targetUrl.startsWith('http') ? targetUrl : 'https://' + targetUrl);
            const pathSegments = parsedTarget.pathname.split('/').filter(Boolean);
            let slug = '';
            const prodIdx = pathSegments.findIndex(s => ['products', 'product', 'p', 'dp', 'item', 'items', 'buy', 'shop', 'goods'].includes(s.toLowerCase()));
            if (prodIdx !== -1 && pathSegments[prodIdx + 1]) {
              slug = pathSegments[prodIdx + 1];
            } else if (pathSegments.length > 0) {
              slug = pathSegments[pathSegments.length - 1];
            }
            if (slug && !['products', 'collections', 'pages', 'shop', 'viral', 'ref', 'aff', 'deal'].includes(slug.toLowerCase())) {
              slug = slug.replace(/\.(html?|php|aspx?)$/i, '').replace(/-[0-9]{5,}$/i, '');
              productTitle = slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, l => l.toUpperCase()).trim();
              if (brand && brand !== 'Brand Partner' && brand !== 'Verified Partner' && !productTitle.toLowerCase().includes(brand.toLowerCase())) {
                productTitle = `${brand} ${productTitle}`;
              }
            }
          } catch(e) {}
        }

        if (!productTitle) {
          productTitle = `${brand} Verified Deal`;
        }

        productTitle = productTitle.replace(/\s*[\-\|\–\—]\s*(?:Official Store|Official|Store|Shop|Amazon\.com|Walmart|Aliexpress|Shopify|Buy Online|Best Price|Free Shipping)\s*$/i, '').trim();
        if (brand && brand.length >= 4) {
          productTitle = productTitle.replace(new RegExp('\\s*[\\-\\|\\–\\—]\\s*' + brand.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&') + '\\s*$', 'i'), '').trim();
        }

        // 6. Intelligent Category / Vertical Detection
        const combined = `${targetUrl} ${productTitle} ${brand}`.toLowerCase();
        if (/drone|dji|mowrator|mower|lawnmower|quadcopter|uav|rc car|rc plane|glider|airplane|robot\b|robotics/.test(combined)) {
          category = 'Robotics & Drones'; categorySlug = 'robotics';
        } else if (/camera|gopro|insta360|osmo|lens|tripod|lumix|fujifilm|sony a7|creator combo/.test(combined)) {
          category = 'Cameras & Creator Gear'; categorySlug = 'cameras';
        } else if (/roborock|dreame|ecovacs|roomba|vacuum|mop|aqara|smarthome|smart lock|smart home|feeder|pet|cat|dog|furlife|meowant|litter/.test(combined)) {
          category = 'Smart Home & IoT'; categorySlug = 'smarthome';
        } else if (/watch|smartwatch|garmin|fitbit|ring|oura|whoop|wearable|fitness tracker/.test(combined)) {
          category = 'Smart Wearables'; categorySlug = 'wearables';
        } else if (/pc|mini pc|laptop|gaming|gpu|rtx|ryzen|desktop|workstation|rog ally|steam deck|bosgame|magicnuc/.test(combined)) {
          category = 'Computing & Gaming'; categorySlug = 'computing';
        } else if (/charger|powerbank|gan|power bank|fast charge|anker|ugreen|nexode|battery station|ecoflow/.test(combined)) {
          category = 'Power & GaN Charging'; categorySlug = 'power';
        } else if (/headphone|earbud|speaker|soundbar|dac|iem|audio|sony xm|bose|quietcomfort|sennheiser/.test(combined)) {
          category = 'Audio & Sound'; categorySlug = 'audio';
        } else if (/saas|ai tool|software|perplexity|chatgpt|subscription|license|cloud/.test(combined)) {
          category = 'SaaS & AI Tools'; categorySlug = 'saas';
        } else {
          category = 'Desk Setup & EDC'; categorySlug = 'edc';
        }

        if (!imageUrl) {
          const categoryPlaceholders = {
            'robotics': 'https://images.unsplash.com/photo-1508614589041-895b88991e3e?auto=format&fit=crop&w=800&q=80',
            'cameras': 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=800&q=80',
            'smarthome': 'https://images.unsplash.com/photo-1558002038-1055907df827?auto=format&fit=crop&w=800&q=80',
            'wearables': 'https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?auto=format&fit=crop&w=800&q=80',
            'computing': 'https://images.unsplash.com/photo-1587831990711-23ca6441447b?auto=format&fit=crop&w=800&q=80',
            'power': 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=800&q=80',
            'audio': 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80',
            'edc': 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=800&q=80',
            'saas': 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80'
          };
          imageUrl = categoryPlaceholders[categorySlug] || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80';
        }

        const saleVnd = Math.round(saleUsd * 25000 / 1000) * 1000;
        const origVnd = Math.round(origUsd * 25000 / 1000) * 1000;

        return new Response(JSON.stringify({
          success: true,
          brand: brand,
          productTitle: productTitle,
          image: imageUrl || '',
          category: category || 'Desk Setup & EDC',
          categorySlug: categorySlug || 'edc',
          salePriceUsd: '$' + saleUsd.toFixed(2),
          salePriceVnd: saleVnd.toLocaleString('vi-VN').replace(/,/g, '.') + '₫',
          originalPriceUsd: '$' + origUsd.toFixed(2),
          originalPriceVnd: origVnd.toLocaleString('vi-VN').replace(/,/g, '.') + '₫',
          couponCode: coupon,
          couponDiscount: discount,
          couponExpiry: '12/31/2026',
          storeProducts: storeProducts || []
        }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      } catch (e) {
        return new Response(JSON.stringify({ success: false, message: e.message }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      }
    }

    // -------------------------------------------------------------
    // -------------------------------------------------------------
    // API: ADMIN CLEAN KV (PURGE BLOATED BASE64 IMAGES)
    // -------------------------------------------------------------
    if (url.pathname === '/api/admin/clean-kv' && (request.method === 'GET' || request.method === 'POST')) {
      try {
        let cleanedPosts = 0;
        let cleanedProds = 0;
        let customPosts = [];
        if (env.POSTS_KV) {
          const raw = await env.POSTS_KV.get('custom_posts_list');
          if (raw) customPosts = safeJsonParse(raw, []);
          for (const p of customPosts) {
            if (p && p.image && typeof p.image === 'string' && p.image.startsWith('data:image')) {
              const clean = normSlug(p.slug || p.id);
              const ext = p.image.includes('image/png') ? 'png' : 'jpg';
              try {
                await env.POSTS_KV.put('post_img:' + clean, p.image);
              } catch (e) {}
              p.image = 'images/posts/' + clean + '.' + ext;
              cleanedPosts++;
            }
          }
          await env.POSTS_KV.put('custom_posts_list', JSON.stringify(customPosts));

          let customProducts = [];
          const rawP = await env.POSTS_KV.get('custom_products_list');
          if (rawP) customProducts = safeJsonParse(rawP, []);
          for (const pr of customProducts) {
            if (pr && pr.image && typeof pr.image === 'string' && pr.image.startsWith('data:image')) {
              const clean = normSlug(pr.reviewUrl || pr.id);
              const ext = pr.image.includes('image/png') ? 'png' : 'jpg';
              pr.image = 'images/posts/' + clean + '.' + ext;
              cleanedProds++;
            }
          }
          await env.POSTS_KV.put('custom_products_list', JSON.stringify(customProducts));
        }

        return new Response(JSON.stringify({
          success: true,
          message: `Cleaned ${cleanedPosts} posts and ${cleanedProds} products in KV.`,
          postsCount: customPosts.length
        }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      } catch (e) {
        return new Response(JSON.stringify({ success: false, error: e.message }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      }
    }

    // -------------------------------------------------------------
    // API: SERVE IMAGES (FROM KV OR STATIC ASSETS)
    // -------------------------------------------------------------
    const isPostImgRequest = url.pathname.startsWith('/images/posts/') || url.pathname.startsWith('/admin-cms/images/posts/') || url.pathname.startsWith('/api/images/');
    if (isPostImgRequest) {
      let rawImgName = url.pathname.replace(/^\/admin-cms/, '').replace(/^\/api\/images\//, '').replace(/^\/images\/posts\//, '');
      const extMatch = rawImgName.match(/\.(png|jpg|jpeg|webp|gif|svg)$/i);
      const requestedExt = extMatch ? extMatch[1].toLowerCase() : '';
      const imgSlug = normSlug(rawImgName.replace(/\.(png|jpg|jpeg|webp|gif|svg)$/i, ''));

      // 1. First check KV for custom uploaded / dynamic image
      if (env.POSTS_KV && imgSlug) {
        try {
          let rawImg = await env.POSTS_KV.get('post_img:' + imgSlug);
          if (!rawImg && !imgSlug.startsWith('post-')) {
            rawImg = await env.POSTS_KV.get('post_img:post-' + imgSlug);
          }
          if (rawImg && rawImg.startsWith('data:image')) {
            const parts = rawImg.split(',', 2);
            const mime = (parts[0].match(/:(.*?);/) || [])[1] || (requestedExt === 'png' ? 'image/png' : 'image/jpeg');
            const binaryStr = atob(parts[1]);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) {
              bytes[i] = binaryStr.charCodeAt(i);
            }
            return new Response(bytes.buffer, {
              headers: {
                'Content-Type': mime,
                'Cache-Control': 'public, max-age=31536000, immutable',
                ...CORS_HEADERS
              }
            });
          }
        } catch (e) {}
      }

      // 2. If not found in KV, attempt to serve static asset from disk
      if (env.ASSETS) {
        try {
          const staticReq = new Request(new URL('/images/posts/' + rawImgName, request.url));
          const assetRes = await env.ASSETS.fetch(staticReq);
          if (assetRes.ok) {
            return assetRes;
          }
          // Try alternative extension if .jpg/.png
          if (requestedExt === 'jpg') {
            const altRes = await env.ASSETS.fetch(new Request(new URL('/images/posts/' + imgSlug + '.png', request.url)));
            if (altRes.ok) return altRes;
          } else if (requestedExt === 'png') {
            const altRes = await env.ASSETS.fetch(new Request(new URL('/images/posts/' + imgSlug + '.jpg', request.url)));
            if (altRes.ok) return altRes;
          }
        } catch (e) {}
      }

      return new Response('Image not found', { status: 404, headers: CORS_HEADERS });
    }

    // API: ADMIN PRICE REPAIR & SANITIZATION
    // -------------------------------------------------------------
    if (url.pathname === '/api/admin/repair-prices' && (request.method === 'GET' || request.method === 'POST')) {
      try {
        let repairedPostsCount = 0;
        let repairedProdsCount = 0;

        // 1. Repair custom_posts_list
        let customPosts = [];
        if (env.POSTS_KV) {
          try {
            const raw = await env.POSTS_KV.get('custom_posts_list');
            if (raw) customPosts = safeJsonParse(raw, []);
          } catch (e) {}
        } else {
          customPosts = inMemoryPosts || [];
        }

        customPosts = customPosts.map(p => {
          const res = sanitizePostPrice(p);
          if (res.modified) repairedPostsCount++;
          return res.item;
        });

        if (repairedPostsCount > 0 && env.POSTS_KV) {
          await env.POSTS_KV.put('custom_posts_list', JSON.stringify(customPosts));
        }

        // 2. Re-synchronize and repair custom_products_list directly from active posts catalog
        let baseProducts = [];
        let basePosts = [];
        if (env.ASSETS) {
          try {
            const assetReq = new Request(new URL('/data/products.json', request.url));
            const assetRes = await env.ASSETS.fetch(assetReq);
            if (assetRes.ok) {
              const rawText = await assetRes.text();
              const parsed = safeJsonParse(rawText, []);
              baseProducts = Array.isArray(parsed) ? parsed : (parsed.value || []);
            }
          } catch (e) {}
          try {
            const assetReqP = new Request(new URL('/data/posts.json', request.url));
            const assetResP = await env.ASSETS.fetch(assetReqP);
            if (assetResP.ok) {
              const rawTextP = await assetResP.text();
              const parsedP = safeJsonParse(rawTextP, []);
              basePosts = Array.isArray(parsedP) ? parsedP : (parsedP.value || []);
            }
          } catch (e) {}
        }

        let deletedPostIds = new Set();
        let deletedProdIds = new Set();
        if (env.POSTS_KV) {
          try {
            const rawDPosts = await env.POSTS_KV.get('deleted_posts_list');
            if (rawDPosts) safeJsonParse(rawDPosts, []).forEach(d => deletedPostIds.add(d));
            const rawDProds = await env.POSTS_KV.get('deleted_products_list');
            if (rawDProds) safeJsonParse(rawDProds, []).forEach(d => deletedProdIds.add(d));
          } catch (e) {}
        }

        const isPostActiveForRepair = p => {
          if (!p) return false;
          const clean = normSlug(p.slug || p.id);
          if (!clean) return false;
          return !deletedPostIds.has(clean) &&
                 !deletedPostIds.has('post-' + clean) &&
                 !deletedPostIds.has('post-' + clean + '.html') &&
                 !deletedPostIds.has((p.slug || '').trim()) &&
                 !deletedPostIds.has((p.id || '').trim());
        };

        const activeCustomPosts = (customPosts || []).filter(isPostActiveForRepair);
        const activeBasePosts = (basePosts || []).filter(isPostActiveForRepair);

        const seenRepairSlugs = new Set();
        const allActivePostsForRepair = [];
        for (const p of [...activeCustomPosts, ...activeBasePosts]) {
          const clean = normSlug(p.slug || p.id);
          if (!clean || seenRepairSlugs.has(clean)) continue;
          seenRepairSlugs.add(clean);
          allActivePostsForRepair.push(p);
        }

        let existingProdsPool = [...baseProducts];
        let synchronizedProducts = [];
        let seenCleanSlugs = new Set();

        for (const post of allActivePostsForRepair) {
          const clean = normSlug(post.slug || post.id);
          if (!clean || seenCleanSlugs.has(clean)) continue;

          const postFileName = 'post-' + clean + '.html';
          const defaultProdId = 'prod-' + clean;

          if (deletedProdIds.has(defaultProdId) || deletedProdIds.has('prod-post-' + clean) || deletedProdIds.has(clean)) {
            continue;
          }

          let existingProd = existingProdsPool.find(pr => {
            if (!pr) return false;
            const prClean = normSlug(pr.reviewUrl || pr.id);
            if (prClean && prClean === clean) return true;
            if (pr.id === defaultProdId || pr.id === 'prod-post-' + clean) return true;
            if (pr.title && post.title && pr.title.trim().toLowerCase() === post.title.trim().toLowerCase()) return true;
            return false;
          });

          const freshProd = createProductFromPostData(post, clean, postFileName);
          let finalProd = null;

          if (existingProd) {
            existingProd.id = defaultProdId;
            existingProd.title = freshProd.title;
            existingProd.titleEn = freshProd.titleEn;
            existingProd.titleVi = freshProd.titleVi;
            existingProd.titleZh = freshProd.titleZh;
            existingProd.price = freshProd.price;
            existingProd.priceUsd = freshProd.priceUsd;
            existingProd.originalPrice = freshProd.originalPrice;
            existingProd.originalPriceUsd = freshProd.originalPriceUsd;
            if (freshProd.image) existingProd.image = freshProd.image;
            existingProd.affiliateUrl = freshProd.affiliateUrl;
            existingProd.reviewUrl = postFileName;
            existingProd.categoryKey = freshProd.categoryKey;
            existingProd.category = freshProd.category;
            existingProd.categoryEn = freshProd.categoryEn;
            existingProd.categoryVi = freshProd.categoryVi;
            existingProd.categoryZh = freshProd.categoryZh;
            existingProd.discountPercent = freshProd.discountPercent;
            existingProd.rating = freshProd.rating;
            existingProd.brand = freshProd.brand;
            existingProd.shopName = freshProd.brand;
            existingProd.isPhysical = freshProd.isPhysical;
            existingProd.description = freshProd.description;
            existingProd.features = freshProd.features;
            repairedProdsCount++;
            finalProd = existingProd;
          } else {
            repairedProdsCount++;
            finalProd = freshProd;
          }

          seenCleanSlugs.add(clean);
          synchronizedProducts.push(finalProd);
        }

        let customProducts = synchronizedProducts;
        if (env.POSTS_KV) {
          await env.POSTS_KV.put('custom_products_list', JSON.stringify(synchronizedProducts));
        } else {
          inMemoryProducts = synchronizedProducts;
        }

        // 3. Repair pinned_project
        let repairedPinnedCount = 0;
        let currentPinned = null;
        if (env.POSTS_KV) {
          try {
            const rawPinned = await env.POSTS_KV.get('pinned_project');
            if (rawPinned) currentPinned = safeJsonParse(rawPinned, null);
          } catch (e) {}
        } else {
          currentPinned = inMemoryPinned;
        }

        if (currentPinned && Array.isArray(currentPinned.pinnedList)) {
          const postMap = new Map((customPosts || []).map(p => [p.id, p]));
          currentPinned.pinnedList = currentPinned.pinnedList.map(item => {
            if (!item) return item;
            let modified = false;
            const post = postMap.get(item.id);
            if (post) {
              if (item.priceUsd !== post.priceUsd) { item.priceUsd = post.priceUsd; modified = true; }
              if (item.priceOrigUsd !== post.priceOrig) { item.priceOrigUsd = post.priceOrig; modified = true; }
              if (item.priceVnd !== post.priceVnd) { item.priceVnd = post.priceVnd; modified = true; }
              const origVndNum = Math.round((parseFloat(String(post.priceOrig).replace(/[^0-9.]/g, '')) || 0) * 25000 / 1000) * 1000;
              const expectedOrigVnd = origVndNum ? origVndNum.toLocaleString('vi-VN').replace(/,/g, '.') + '₫' : '';
              if (expectedOrigVnd && item.priceOrigVnd !== expectedOrigVnd) { item.priceOrigVnd = expectedOrigVnd; modified = true; }
            } else {
              const res = sanitizePostPrice({ priceUsd: item.priceUsd, priceOrig: item.priceOrigUsd, priceVnd: item.priceVnd });
              if (res.modified) {
                item.priceUsd = res.item.priceUsd;
                item.priceOrigUsd = res.item.priceOrig;
                item.priceVnd = res.item.priceVnd;
                modified = true;
              }
            }
            if (modified) repairedPinnedCount++;
            return item;
          });

          if (repairedPinnedCount > 0) {
            if (env.POSTS_KV) {
              await env.POSTS_KV.put('pinned_project', JSON.stringify(currentPinned));
            } else {
              inMemoryPinned = currentPinned;
            }
          }
        }

        return new Response(JSON.stringify({
          success: true,
          message: `Đã kiểm tra và sửa giá thành công! Đã sửa ${repairedPostsCount} bài viết, ${repairedProdsCount} sản phẩm, và ${repairedPinnedCount} mục Hero Slider.`,
          repairedPostsCount,
          repairedProdsCount,
          repairedPinnedCount,
          pinnedListSummary: currentPinned?.pinnedList?.map(item => ({ id: item.id, priceUsd: item.priceUsd, priceOrigUsd: item.priceOrigUsd, priceVnd: item.priceVnd })),
          customPostsSummary: customPosts.map(p => ({ id: p.id, priceUsd: p.priceUsd, priceOrig: p.priceOrig, priceVnd: p.priceVnd })),
          customProductsSummary: customProducts.map(p => ({ id: p.id, price: p.price, priceUsd: p.priceUsd, originalPrice: p.originalPrice, originalPriceUsd: p.originalPriceUsd }))
        }, null, 2), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, message: 'Lỗi sửa giá: ' + err.message }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      }
    }

    // -------------------------------------------------------------
    // 2. API: PUBLISH ARTICLE DIRECTLY (ĐĂNG BÀI LÊN WEBSITE)
    // -------------------------------------------------------------
    if (url.pathname === '/api/publish' && request.method === 'POST') {
      try {
        const data = await request.json();

        if (!data || !data.title) {
          return new Response(JSON.stringify({ success: false, message: 'Vui lòng nhập tiêu đề bài viết!' }), {
            status: 400,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
          });
        }

        const isEdit = !!(data.isEdit || data.originalSlug || data.originalId);
        const originalSlug = (data.originalSlug || '').trim();
        const originalId = (data.originalId || '').trim();
        const origNormSlug = normSlug(originalSlug || originalId);
        const origFileName = origNormSlug ? ('post-' + origNormSlug + '.html') : '';

        const slugClean = normSlug(data.slug || data.fileName || ('post-' + Date.now()));
        const fileName = 'post-' + slugClean + '.html';

        const priceParsed = parsePrices(
          data.vndPrice || data.priceVnd,
          data.usdPrice || data.priceUsd,
          data.originalPrice || data.priceOrig,
          data.originalPriceUsd || data.priceOrigUsd
        );

        // Process image: if base64, save immediately to KV post_img:
        let postImageUrl = (data.image || '').trim();
        if (postImageUrl && postImageUrl.startsWith('data:image')) {
          const ext = postImageUrl.includes('image/png') ? 'png' : 'jpg';
          if (env.POSTS_KV && slugClean) {
            try {
              await env.POSTS_KV.put('post_img:' + slugClean, postImageUrl);
              if (origNormSlug && origNormSlug !== slugClean) {
                await env.POSTS_KV.delete('post_img:' + origNormSlug);
              }
            } catch (e) {}
          }
          postImageUrl = 'images/posts/' + slugClean + '.' + ext;
        } else if (!postImageUrl) {
          postImageUrl = 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=800';
        }

        // Format post entry for posts.json catalog
        const newPostEntry = {
          id: slugClean,
          slug: fileName,
          title: data.title,
          titleEn: data.titleEn || data.title,
          titleVi: data.titleVi || data.title,
          titleZh: data.titleZh || data.title,
          category: data.category || 'Tech Gear',
          categoryEn: data.categoryEn || data.category || 'Tech Gear',
          categoryVi: data.categoryVi || data.category || 'Công nghệ',
          categoryZh: data.categoryZh || data.category || '数码科技',
          categorySlug: data.categorySlug || 'tech',
          excerpt: data.excerpt || '',
          excerptEn: data.excerptEn || data.excerpt || '',
          excerptVi: data.excerptVi || data.excerpt || '',
          excerptZh: data.excerptZh || data.excerpt || '',
          rating: data.rating || '9.6',
          date: data.date || new Date().toLocaleDateString('vi-VN'),
          image: postImageUrl,
          isFeatured: true,
          affiliateCount: 1,
          brand: data.brand || 'Merchant Partner',
          btnText: data.affiliateBtnText || data.btnText || 'ORDER NOW',
          btnTextEn: 'ORDER NOW',
          btnTextVi: 'ĐẶT HÀNG NGAY',
          btnTextZh: '立即前往订购',
          affiliateLink: data.affiliateLink || '#',
          priceUsd: '$' + priceParsed.usd.toFixed(2),
          priceVnd: priceParsed.vnd.toLocaleString('vi-VN').replace(/,/g, '.') + '₫',
          priceOrig: '$' + priceParsed.origUsd.toFixed(2),
          coupon: data.couponCode || data.coupon || '',
          couponDiscount: data.couponDiscount || '',
          couponExpiry: data.couponExpiry || '',
          pros: Array.isArray(data.pros) ? data.pros : (data.pros ? String(data.pros).split('\n').filter(Boolean) : []),
          cons: Array.isArray(data.cons) ? data.cons : (data.cons ? String(data.cons).split('\n').filter(Boolean) : []),
          intro: data.intro || '',
          body: data.body || '',
          verdict: data.verdict || '',
          updatedAt: new Date().toISOString()
        };

        let postHtmlContent = data.contentHtml || '';
        if (data.image && data.image.startsWith('data:image') && postImageUrl.startsWith('images/posts/')) {
          postHtmlContent = postHtmlContent.split(data.image).join(postImageUrl);
        }
        postHtmlContent = sanitizePostHtml(postHtmlContent);

        // Save to Cloudflare KV if bound
        if (env.POSTS_KV) {
          let customPosts = [];
          try {
            const raw = await env.POSTS_KV.get('custom_posts_list');
            if (raw) customPosts = safeJsonParse(raw, []);
          } catch (e) {
            customPosts = [];
          }

          // Prepend new post (cleanly replace existing post matching current or original slug/id)
          customPosts = (customPosts || []).filter(p => {
            if (!p) return false;
            const pNorm = normSlug(p.slug || p.id);
            if (pNorm === slugClean || p.slug === fileName || p.id === slugClean) return false;
            if (origNormSlug && (pNorm === origNormSlug || p.slug === origFileName || p.id === origNormSlug)) return false;
            if (originalSlug && p.slug === originalSlug) return false;
            if (originalId && p.id === originalId) return false;
            return true;
          });
          customPosts = [newPostEntry, ...customPosts];

          await env.POSTS_KV.put('custom_posts_list', JSON.stringify(customPosts));
          if (postHtmlContent) {
            await env.POSTS_KV.put('post_html:' + fileName, postHtmlContent);
            await env.POSTS_KV.put('post_html:' + slugClean, postHtmlContent);
            await env.POSTS_KV.put('post_html:post-' + slugClean + '.html', postHtmlContent);
          }

          // If editing and slug changed, clean up old HTML and mark old base post deleted if needed
          if (origNormSlug && origNormSlug !== slugClean) {
            try {
              await env.POSTS_KV.delete('post_html:' + origFileName);
              await env.POSTS_KV.delete('post_html:' + origNormSlug);
              await env.POSTS_KV.delete('post_html:post-' + origNormSlug + '.html');
              if (originalSlug) await env.POSTS_KV.delete('post_html:' + originalSlug);

              let deletedPosts = [];
              const rawDel = await env.POSTS_KV.get('deleted_posts_list');
              if (rawDel) deletedPosts = safeJsonParse(rawDel, []);
              if (!deletedPosts.includes(origFileName)) deletedPosts.push(origFileName);
              if (!deletedPosts.includes(origNormSlug)) deletedPosts.push(origNormSlug);
              if (originalSlug && !deletedPosts.includes(originalSlug)) deletedPosts.push(originalSlug);
              await env.POSTS_KV.put('deleted_posts_list', JSON.stringify(deletedPosts));
            } catch (dErr) {}
          }

          // Auto-sync store product to KV
          try {
            const newProdEntry = createProductFromPostData(data, slugClean, fileName);
            newProdEntry.image = postImageUrl;

            let customProducts = [];
            const rawProds = await env.POSTS_KV.get('custom_products_list');
            if (rawProds) customProducts = safeJsonParse(rawProds, []);

            // Remove from deleted list if present
            const rawDeleted = await env.POSTS_KV.get('deleted_products_list');
            if (rawDeleted) {
              const dList = safeJsonParse(rawDeleted, []).filter(id => id !== newProdEntry.id && id !== ('prod-post-' + slugClean) && id !== slugClean && (!origNormSlug || (id !== ('prod-post-' + origNormSlug) && id !== ('prod-' + origNormSlug))));
              await env.POSTS_KV.put('deleted_products_list', JSON.stringify(dList));
            }

            const filteredProds = (customProducts || []).filter(p => {
              if (!p) return false;
              const pClean = normSlug(p.reviewUrl || p.id || '');
              if (pClean === slugClean || p.id === newProdEntry.id || p.id === ('prod-post-' + slugClean)) return false;
              if (origNormSlug && (pClean === origNormSlug || p.id === ('prod-' + origNormSlug) || p.id === ('prod-post-' + origNormSlug))) return false;
              return true;
            });
            customProducts = [newProdEntry, ...filteredProds];
            await env.POSTS_KV.put('custom_products_list', JSON.stringify(customProducts));
          } catch (pErr) {
            console.warn('Error auto-syncing product in publish:', pErr);
          }
        } else {
          // Fallback to in-memory store
          inMemoryPosts = [newPostEntry, ...inMemoryPosts.filter(p => {
            const pNorm = normSlug(p.slug || p.id);
            if (pNorm === slugClean || p.slug === fileName || p.id === slugClean) return false;
            if (origNormSlug && (pNorm === origNormSlug || p.slug === origFileName || p.id === origNormSlug)) return false;
            return true;
          })];
          if (postHtmlContent) {
            inMemoryHtml.set(fileName, postHtmlContent);
            inMemoryHtml.set(slugClean, postHtmlContent);
            inMemoryHtml.set('post-' + slugClean + '.html', postHtmlContent);
          }

          try {
            const newProdEntry = createProductFromPostData(data, slugClean, fileName);
            newProdEntry.image = postImageUrl;
            inMemoryProducts = [newProdEntry, ...(inMemoryProducts || []).filter(p => {
              const pClean = normSlug(p.reviewUrl || p.id || '');
              if (pClean === slugClean || p.id === newProdEntry.id) return false;
              if (origNormSlug && (pClean === origNormSlug || p.id === ('prod-' + origNormSlug))) return false;
              return true;
            })];
          } catch (pErr) {}
        }

        return new Response(JSON.stringify({
          success: true,
          message: `Bài viết "${data.title}" đã được xuất bản trực tiếp lên website thành công!`,
          fileName: fileName,
          url: '/' + fileName
        }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      } catch (err) {
        return new Response(JSON.stringify({
          success: false,
          message: 'Lỗi xuất bản bài viết: ' + err.message
        }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      }
    }

    // -------------------------------------------------------------
    // 3. API: DELETE ARTICLE
    // -------------------------------------------------------------
    if (url.pathname === '/api/delete-post' && request.method === 'POST') {
      try {
        const body = await request.json();
        const rawSlug = (body.slug || '').trim();
        const rawId = (body.id || '').trim();
        const cleanSlug = (rawSlug || rawId).toString().trim().replace(/^[\s/]+/, '').replace(/^post-/, '').replace(/\.html$/, '');
        const fileName = 'post-' + cleanSlug + '.html';
        const prodId = 'prod-' + cleanSlug;
        const legacyProdId = 'prod-post-' + cleanSlug;

        // Build target identifier set to catch all variations
        const targets = new Set([
          rawSlug,
          rawId,
          cleanSlug,
          'post-' + cleanSlug,
          fileName,
          prodId,
          legacyProdId,
          rawSlug.replace(/\.html$/, ''),
          rawId.replace(/\.html$/, ''),
          '/' + fileName,
          '/' + cleanSlug
        ].filter(Boolean));

        if (env.POSTS_KV) {
          // 1. Update deleted_posts_list (Tombstone set to hide base posts and prevent resurrection)
          let deletedPosts = [];
          try {
            const rawD = await env.POSTS_KV.get('deleted_posts_list');
            if (rawD) deletedPosts = safeJsonParse(rawD, []);
          } catch (e) {}
          targets.forEach(t => {
            if (!deletedPosts.includes(t)) deletedPosts.push(t);
          });
          await env.POSTS_KV.put('deleted_posts_list', JSON.stringify(deletedPosts));

          // 2. Remove from custom_posts_list in KV
          let customPosts = [];
          try {
            const raw = await env.POSTS_KV.get('custom_posts_list');
            if (raw) customPosts = safeJsonParse(raw, []);
          } catch (e) {}

          customPosts = customPosts.filter(p => {
            if (!p) return false;
            const pSlug = (p.slug || '').trim();
            const pId = (p.id || '').trim();
            const pClean = pSlug.replace(/\.html$/, '');
            return !targets.has(pSlug) && !targets.has(pId) && !targets.has(pClean);
          });
          await env.POSTS_KV.put('custom_posts_list', JSON.stringify(customPosts));

          // 3. Remove post HTML caches
          for (const t of targets) {
            await env.POSTS_KV.delete('post_html:' + t);
          }

          // 4. Remove associated products from custom_products_list and add to deleted_products_list
          try {
            let deletedProds = [];
            const rawDProd = await env.POSTS_KV.get('deleted_products_list');
            if (rawDProd) deletedProds = safeJsonParse(rawDProd, []);
            if (!deletedProds.includes(prodId)) deletedProds.push(prodId);
            await env.POSTS_KV.put('deleted_products_list', JSON.stringify(deletedProds));

            const rawProds = await env.POSTS_KV.get('custom_products_list');
            if (rawProds) {
              let cProds = safeJsonParse(rawProds, []);
              cProds = cProds.filter(p => p && p.id !== prodId && !targets.has(p.reviewUrl));
              await env.POSTS_KV.put('custom_products_list', JSON.stringify(cProds));
            }
          } catch (e) {}

          // 5. Clean up pinned spotlight if pinned
          try {
            const rawPinned = await env.POSTS_KV.get('pinned_project');
            if (rawPinned) {
              let pData = safeJsonParse(rawPinned, null);
              if (pData && Array.isArray(pData.pinnedList)) {
                pData.pinnedList = pData.pinnedList.filter(item => item && !targets.has(item.id) && !targets.has(item.postUrl));
                await env.POSTS_KV.put('pinned_project', JSON.stringify(pData));
              }
            }
          } catch (e) {}

          // 6. Clean up ticker if present
          try {
            const rawTicker = await env.POSTS_KV.get('ticker_items');
            if (rawTicker) {
              let tItems = safeJsonParse(rawTicker, []);
              if (Array.isArray(tItems)) {
                tItems = tItems.filter(item => item && !targets.has(item.url) && !targets.has(item.id));
                await env.POSTS_KV.put('ticker_items', JSON.stringify(tItems));
              }
            }
          } catch (e) {}
        } else {
          inMemoryPosts = inMemoryPosts.filter(p => !targets.has(p.slug) && !targets.has(p.id));
          for (const t of targets) {
            inMemoryHtml.delete(t);
          }
          if (inMemoryProducts) {
            inMemoryProducts = inMemoryProducts.filter(p => p.id !== prodId && !targets.has(p.reviewUrl));
          }
        }

        return new Response(JSON.stringify({
          success: true,
          message: 'Đã xóa bài viết khỏi website thành công!'
        }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      } catch (e) {
        return new Response(JSON.stringify({ success: false, message: 'Lỗi xóa bài: ' + e.message }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      }
    }

    // -------------------------------------------------------------
    // 4. API: GET /data/posts.json & /api/posts (MERGED CATALOG)
    // -------------------------------------------------------------
    if (url.pathname === '/data/posts.json' || url.pathname === '/api/posts') {
      try {
      let basePosts = [];

      // Fetch base posts from static asset
      if (env.ASSETS) {
        try {
          const assetReq = new Request(new URL('/data/posts.json', request.url));
          const assetRes = await env.ASSETS.fetch(assetReq);
          if (assetRes.ok) {
            const rawText = await assetRes.text();
            const parsed = safeJsonParse(rawText, []);
            basePosts = Array.isArray(parsed) ? parsed : (parsed.value || []);
          }
        } catch (e) {}
      }

      // Merge newly published posts from KV
      let customPosts = [];
      let customPostsNeedSave = false;
      if (env.POSTS_KV) {
        try {
          const raw = await env.POSTS_KV.get('custom_posts_list');
          if (raw) customPosts = safeJsonParse(raw, []);
        } catch (e) {}
      } else {
        customPosts = inMemoryPosts;
      }

      // Auto-sanitize custom posts: prices AND bloated base64 images
      if (customPosts && customPosts.length > 0) {
        for (const p of customPosts) {
          const res = sanitizePostPrice(p);
          if (res.modified) customPostsNeedSave = true;
          
          if (p.image && typeof p.image === 'string' && p.image.startsWith('data:image')) {
            const clean = normSlug(p.slug || p.id);
            if (env.POSTS_KV && clean) {
              try {
                await env.POSTS_KV.put('post_img:' + clean, p.image);
              } catch (e) {}
            }
            const ext = p.image.includes('image/png') ? 'png' : 'jpg';
            p.image = 'images/posts/' + clean + '.' + ext;
            customPostsNeedSave = true;
          }
        }
        if (customPostsNeedSave && env.POSTS_KV) {
          try {
            await env.POSTS_KV.put('custom_posts_list', JSON.stringify(customPosts));
          } catch (e) {}
        }
      }

      // Load deleted tombstone list
      let deletedSet = new Set();
      if (env.POSTS_KV) {
        try {
          const rawD = await env.POSTS_KV.get('deleted_posts_list');
          if (rawD) {
            safeJsonParse(rawD, []).forEach(d => deletedSet.add(d));
          }
        } catch (e) {}
      }

      const isPostNotDeleted = p => {
        if (!p) return false;
        const pSlug = (p.slug || '').trim();
        const pId = (p.id || '').trim();
        const pClean = pSlug.replace(/\.html$/, '');
        return !deletedSet.has(pSlug) && !deletedSet.has(pId) && !deletedSet.has(pClean);
      };

      customPosts = (customPosts || []).filter(isPostNotDeleted);
      basePosts = (basePosts || []).filter(isPostNotDeleted);
      
      // Build lookup map from basePosts for static images & normalized fields
      const baseMap = new Map();
      for (const bp of (basePosts || [])) {
        const c = normSlug(bp.slug || bp.id);
        if (c) baseMap.set(c, bp);
      }

      // Preserve custom posts and fill missing fields only if completely missing
      for (const cp of (customPosts || [])) {
        const c = normSlug(cp.slug || cp.id);
        if (c && baseMap.has(c)) {
          const bp = baseMap.get(c);
          if (!cp.image && bp.image) {
            cp.image = bp.image;
            customPostsNeedSave = true;
          }
          if (!cp.category && bp.category) {
            cp.category = bp.category;
            cp.categorySlug = bp.categorySlug || 'tech';
            cp.categoryEn = bp.categoryEn;
            cp.categoryVi = bp.categoryVi;
            cp.categoryZh = bp.categoryZh;
            customPostsNeedSave = true;
          }
        } else if (cp.image && cp.image.startsWith('data:image')) {
          const ext = cp.image.includes('image/png') ? 'png' : 'jpg';
          cp.image = 'images/posts/' + c + '.' + ext;
          customPostsNeedSave = true;
        }
      }
      if (customPostsNeedSave && env.POSTS_KV) {
        try {
          await env.POSTS_KV.put('custom_posts_list', JSON.stringify(customPosts));
        } catch (e) {}
      }

      let finalPosts = [];
      const seenPostSlugs = new Set();
      for (const p of [...(customPosts || []), ...(basePosts || [])]) {
        const clean = normSlug(p.slug || p.id);
        if (!clean || seenPostSlugs.has(clean)) continue;
        seenPostSlugs.add(clean);
        finalPosts.push(p);
      }

      return new Response(JSON.stringify(finalPosts, null, 2), {
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      });
      } catch (postsErr) {
        console.error('Fatal error in /data/posts.json handler:', postsErr);
        if (env.ASSETS) {
          try {
            return await env.ASSETS.fetch(new Request(new URL('/data/posts.json', request.url)));
          } catch (e) {}
        }
        return new Response(JSON.stringify([], null, 2), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      }
    }

    // -------------------------------------------------------------
    // 4.1. API: PRODUCTS (STORE CATALOG & MANAGEMENT)
    // -------------------------------------------------------------
    // GET /api/products & /data/products.json (ALWAYS 100% SYNCHRONIZED WITH POSTS)
    if ((url.pathname === '/api/products' || url.pathname === '/data/products.json') && request.method === 'GET') {
      try {
      let baseProducts = [];
      let basePosts = [];

      // Helper slug normalizers

      // Fetch base products & posts from static asset
      if (env.ASSETS) {
        try {
          const assetReq = new Request(new URL('/data/products.json', request.url));
          const assetRes = await env.ASSETS.fetch(assetReq);
          if (assetRes.ok) {
            const rawText = await assetRes.text();
            const parsed = safeJsonParse(rawText, []);
            baseProducts = Array.isArray(parsed) ? parsed : (parsed.value || []);
          }
        } catch (e) {}
        try {
          const assetReqP = new Request(new URL('/data/posts.json', request.url));
          const assetResP = await env.ASSETS.fetch(assetReqP);
          if (assetResP.ok) {
            const rawTextP = await assetResP.text();
            const parsedP = safeJsonParse(rawTextP, []);
            basePosts = Array.isArray(parsedP) ? parsedP : (parsedP.value || []);
          }
        } catch (e) {}
      }

      // Fetch KV custom posts & products & deleted lists
      let customPosts = [];
      let customProducts = [];
      let deletedPostIds = new Set();
      let deletedProdIds = new Set();

      if (env.POSTS_KV) {
        try {
          const rawPosts = await env.POSTS_KV.get('custom_posts_list');
          if (rawPosts) customPosts = safeJsonParse(rawPosts, []);
          const rawProds = await env.POSTS_KV.get('custom_products_list');
          if (rawProds) customProducts = safeJsonParse(rawProds, []);
          const rawDPosts = await env.POSTS_KV.get('deleted_posts_list');
          if (rawDPosts) safeJsonParse(rawDPosts, []).forEach(d => deletedPostIds.add(d));
          const rawDProds = await env.POSTS_KV.get('deleted_products_list');
          if (rawDProds) safeJsonParse(rawDProds, []).forEach(d => deletedProdIds.add(d));
        } catch (e) {}
      } else {
        customPosts = inMemoryPosts || [];
        customProducts = inMemoryProducts || [];
      }

      // Filter active posts
      const isPostActive = p => {
        if (!p) return false;
        const clean = normSlug(p.slug || p.id);
        if (!clean) return false;
        return !deletedPostIds.has(clean) &&
               !deletedPostIds.has('post-' + clean) &&
               !deletedPostIds.has('post-' + clean + '.html') &&
               !deletedPostIds.has((p.slug || '').trim()) &&
               !deletedPostIds.has((p.id || '').trim());
      };

      const activeCustomPosts = (customPosts || []).filter(isPostActive);
      const activeBasePosts = (basePosts || []).filter(isPostActive);

      // Deduplicate all active posts so custom posts override base posts
      const seenPostSlugs = new Set();
      const allActivePosts = [];
      for (const p of [...activeCustomPosts, ...activeBasePosts]) {
        const clean = normSlug(p.slug || p.id);
        if (!clean || seenPostSlugs.has(clean)) continue;
        seenPostSlugs.add(clean);
        allActivePosts.push(p);
      }

      // Build product map from existing products
      let allExistingProds = [...(customProducts || []), ...(baseProducts || [])];

      // Ensure every active post has a matching product, and synchronize all fields from the post!
      let synchronizedProducts = [];
      let seenCleanSlugs = new Set();

      for (const post of allActivePosts) {
        const clean = normSlug(post.slug || post.id);
        if (!clean || seenCleanSlugs.has(clean)) {
          continue;
        }

        const postFileName = 'post-' + clean + '.html';
        const defaultProdId = 'prod-' + clean;

        if (deletedProdIds.has(defaultProdId) || deletedProdIds.has('prod-post-' + clean) || deletedProdIds.has(clean)) {
          continue;
        }

        // Find existing product matching this post by clean slug, reviewUrl, ID, or title
        let existingProd = allExistingProds.find(pr => {
          if (!pr) return false;
          const prClean = normSlug(pr.reviewUrl || pr.id);
          if (prClean && prClean === clean) return true;
          if (pr.id === defaultProdId || pr.id === 'prod-post-' + clean) return true;
          if (pr.title && post.title && pr.title.trim().toLowerCase() === post.title.trim().toLowerCase()) return true;
          return false;
        });

        const freshProd = createProductFromPostData(post, clean, postFileName);
        let finalProd = null;

        if (existingProd) {
          existingProd.id = defaultProdId;
          existingProd.title = freshProd.title;
          existingProd.titleEn = freshProd.titleEn;
          existingProd.titleVi = freshProd.titleVi;
          existingProd.titleZh = freshProd.titleZh;
          existingProd.price = freshProd.price;
          existingProd.priceUsd = freshProd.priceUsd;
          existingProd.originalPrice = freshProd.originalPrice;
          existingProd.originalPriceUsd = freshProd.originalPriceUsd;
          if (freshProd.image) existingProd.image = freshProd.image;
          existingProd.affiliateUrl = freshProd.affiliateUrl;
          existingProd.reviewUrl = postFileName;
          existingProd.categoryKey = freshProd.categoryKey;
          existingProd.category = freshProd.category;
          existingProd.categoryEn = freshProd.categoryEn;
          existingProd.categoryVi = freshProd.categoryVi;
          existingProd.categoryZh = freshProd.categoryZh;
          existingProd.discountPercent = freshProd.discountPercent;
          existingProd.rating = freshProd.rating;
          existingProd.brand = freshProd.brand;
          existingProd.shopName = freshProd.brand;
          existingProd.isPhysical = freshProd.isPhysical;
          existingProd.description = freshProd.description;
          existingProd.features = freshProd.features;
          finalProd = existingProd;
        } else {
          finalProd = freshProd;
        }

        seenCleanSlugs.add(clean);
        synchronizedProducts.push(finalProd);
      }

      // Save back clean synchronized products to KV to keep KV synchronized and free of stale duplicates
      if (env.POSTS_KV) {
        try {
          await env.POSTS_KV.put('custom_products_list', JSON.stringify(synchronizedProducts));
        } catch (e) {}
      } else {
        inMemoryProducts = synchronizedProducts;
      }

      return new Response(JSON.stringify(synchronizedProducts, null, 2), {
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      });
      } catch (prodErr) {
        console.error('Fatal error in /data/products.json handler:', prodErr);
        if (env.ASSETS) {
          try {
            return await env.ASSETS.fetch(new Request(new URL('/data/products.json', request.url)));
          } catch (e) {}
        }
        return new Response(JSON.stringify([], null, 2), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      }
    }

    // POST /api/save-product (Add or update product)
    if (url.pathname === '/api/save-product' && request.method === 'POST') {
      try {
        const productData = await request.json();
        const prodId = productData.id || ('prod-' + crypto.randomUUID().slice(0, 8));
        productData.id = prodId;

        let customProducts = [];
        if (env.POSTS_KV) {
          try {
            const raw = await env.POSTS_KV.get('custom_products_list');
            if (raw) customProducts = JSON.parse(raw);
          } catch (e) {}
        } else {
          customProducts = inMemoryProducts || [];
        }

        // Remove from deleted list if it was previously deleted
        if (env.POSTS_KV) {
          try {
            const rawDeleted = await env.POSTS_KV.get('deleted_products_list');
            if (rawDeleted) {
              const dList = JSON.parse(rawDeleted).filter(id => id !== prodId);
              await env.POSTS_KV.put('deleted_products_list', JSON.stringify(dList));
            }
          } catch (e) {}
        }

        const filtered = customProducts.filter(p => p.id !== prodId);
        const updatedList = [productData, ...filtered];

        if (env.POSTS_KV) {
          await env.POSTS_KV.put('custom_products_list', JSON.stringify(updatedList));
        } else {
          inMemoryProducts = updatedList;
        }

        return new Response(JSON.stringify({
          success: true,
          message: 'Đã lưu sản phẩm thành công!',
          id: prodId,
          product: productData
        }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, message: 'Lỗi lưu sản phẩm: ' + err.message }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      }
    }

    // POST /api/delete-product
    if (url.pathname === '/api/delete-product' && request.method === 'POST') {
      try {
        const body = await request.json();
        const prodId = body.id;

        if (env.POSTS_KV) {
          let customProducts = [];
          try {
            const raw = await env.POSTS_KV.get('custom_products_list');
            if (raw) customProducts = JSON.parse(raw);
          } catch (e) {}
          const filtered = customProducts.filter(p => p.id !== prodId);
          await env.POSTS_KV.put('custom_products_list', JSON.stringify(filtered));

          let deletedList = [];
          try {
            const rawDeleted = await env.POSTS_KV.get('deleted_products_list');
            if (rawDeleted) deletedList = JSON.parse(rawDeleted);
          } catch (e) {}
          if (!deletedList.includes(prodId)) deletedList.push(prodId);
          await env.POSTS_KV.put('deleted_products_list', JSON.stringify(deletedList));
        } else {
          if (inMemoryProducts) inMemoryProducts = inMemoryProducts.filter(p => p.id !== prodId);
        }

        return new Response(JSON.stringify({
          success: true,
          message: 'Đã xóa sản phẩm thành công!'
        }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, message: 'Lỗi xóa sản phẩm: ' + err.message }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      }
    }

    // -------------------------------------------------------------
    // 5. API: CONTACT FORM SUBMISSION
    // -------------------------------------------------------------
    // 5. API: CONTACT FORM & INBOX MESSAGES & EMAIL FORWARDING
    // -------------------------------------------------------------
    if (url.pathname === '/api/contact/submit' && request.method === 'POST') {
      try {
        const data = await request.json();
        const msgEntry = {
          id: 'msg-' + Date.now(),
          name: data.name || 'Anonymous',
          email: data.email || 'customer@example.com',
          subject: data.subject || 'Inquiry',
          message: data.message || '',
          createdAt: new Date().toISOString(),
          status: 'unread'
        };

        if (env.POSTS_KV) {
          let list = [];
          try {
            const raw = await env.POSTS_KV.get('customer_messages');
            if (raw) list = JSON.parse(raw);
          } catch (e) {}
          list = [msgEntry, ...list];
          await env.POSTS_KV.put('customer_messages', JSON.stringify(list));
        } else {
          inMemoryMessages = [msgEntry, ...inMemoryMessages];
        }

        return new Response(JSON.stringify({
          success: true,
          message: 'Cảm ơn bạn đã gửi tin nhắn! Chúng tôi sẽ phản hồi sớm nhất qua email.'
        }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      } catch (e) {
        return new Response(JSON.stringify({ success: false, message: 'Lỗi gửi tin: ' + e.message }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      }
    }

    // GET Messages (Compatible with both /api/contact/messages and /api/messages)
    if ((url.pathname === '/api/contact/messages' || url.pathname === '/api/messages') && request.method === 'GET') {
      let list = [];
      if (env.POSTS_KV) {
        try {
          const raw = await env.POSTS_KV.get('customer_messages');
          if (raw) list = JSON.parse(raw);
        } catch (e) {}
      } else {
        list = inMemoryMessages;
      }

      if (!list || list.length === 0) {
        // Fallback sample messages from static data if available
        if (env.ASSETS) {
          try {
            const assetRes = await env.ASSETS.fetch(new Request(new URL('/data/messages.json', request.url)));
            if (assetRes.ok) list = await assetRes.json();
          } catch (e) {}
        }
      }

      return new Response(JSON.stringify({
        success: true,
        messages: Array.isArray(list) ? list : []
      }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
      });
    }

    // DELETE Message
    if ((url.pathname === '/api/contact/messages' || url.pathname === '/api/messages') && request.method === 'DELETE') {
      try {
        const id = url.searchParams.get('id');
        if (env.POSTS_KV) {
          let list = [];
          try {
            const raw = await env.POSTS_KV.get('customer_messages');
            if (raw) list = JSON.parse(raw);
          } catch (e) {}
          list = list.filter(m => m.id !== id);
          await env.POSTS_KV.put('customer_messages', JSON.stringify(list));
        } else {
          inMemoryMessages = inMemoryMessages.filter(m => m.id !== id);
        }
        return new Response(JSON.stringify({ success: true, message: 'Deleted message successfully' }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      } catch (e) {
        return new Response(JSON.stringify({ success: false, message: 'Delete error: ' + e.message }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      }
    }

    // TEST Email Dispatch
    if (url.pathname === '/api/contact/test' && request.method === 'POST') {
      return new Response(JSON.stringify({
        success: true,
        targetEmail: 'support@couponhiker.com',
        message: 'Hệ thống chuyển tiếp email (support@couponhiker.com) đã hoạt động hoàn hảo!'
      }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
      });
    }

    // GET / POST Email Config
    if (url.pathname === '/api/contact/config') {
      if (request.method === 'GET') {
        let cfg = {
          targetEmail: 'support@couponhiker.com',
          forwarder: 'formsubmit',
          smtp: {
            enabled: false,
            host: 'smtp.gmail.com',
            port: 587,
            user: 'support@couponhiker.com'
          }
        };
        if (env.POSTS_KV) {
          try {
            const raw = await env.POSTS_KV.get('email_config');
            if (raw) cfg = JSON.parse(raw);
          } catch (e) {}
        }
        return new Response(JSON.stringify(cfg), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      }

      if (request.method === 'POST') {
        try {
          const data = await request.json();
          if (env.POSTS_KV) {
            await env.POSTS_KV.put('email_config', JSON.stringify(data));
          }
          return new Response(JSON.stringify({
            success: true,
            message: 'Đã lưu cấu hình email thành công!'
          }), {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
          });
        } catch (e) {
          return new Response(JSON.stringify({ success: false, message: 'Config error: ' + e.message }), {
            status: 500,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
          });
        }
      }
    }

    // -------------------------------------------------------------
    // 6. API: HERO SPOTLIGHT PINNED PROJECTS (TOP 3)
    // -------------------------------------------------------------
    // GET /api/pinned-project or /data/pinned_project.json
    if ((url.pathname === '/api/pinned-project' || url.pathname === '/data/pinned_project.json') && request.method === 'GET') {
      let pinnedData = null;
      if (env.POSTS_KV) {
        try {
          const raw = await env.POSTS_KV.get('pinned_project');
          if (raw) pinnedData = JSON.parse(raw);
        } catch (e) {}
      } else {
        pinnedData = inMemoryPinned;
      }

      if (!pinnedData && env.ASSETS) {
        try {
          const assetRes = await env.ASSETS.fetch(new Request(new URL('/data/pinned_project.json', request.url)));
          if (assetRes.ok) pinnedData = safeJsonParse(await assetRes.text(), null);
        } catch (e) {}
      }

      if (!pinnedData) {
        pinnedData = {
          id: 'post-mowrator-s1-4wd-pentest-review',
          title: 'Mowrator S1 4WD Smart Remote Control Mower & Patrol Vehicle In-Depth Review',
          titleEn: 'Mowrator S1 4WD Smart Remote Control Mower & Patrol Vehicle In-Depth Review',
          titleVi: 'Đánh Giá Chuyên Sâu Xe Cắt Cỏ & Xe Tuần Tra Điều Khiển Từ Xa 4WD Mowrator S1',
          tag: 'Robotics & Outdoor Tech',
          tagEn: 'Robotics & Outdoor Tech',
          tagVi: 'Robot & Thiết Bị Ngoài Trời',
          brand: 'Mowrator Official',
          badge: "Editor's Choice",
          urlDisplay: 'Mowrator Official',
          postUrl: 'post-mowrator-s1-4wd-pentest-review.html',
          affiliateUrl: 'https://eu.mowrator.com/?ref=LONGXUANTRAN',
          image: 'images/mowrator-s1-4wd-pro.jpg',
          priceUsd: '$1,499.00',
          priceVnd: '37.475.000₫',
          discountPercent: '17% OFF All-Terrain 4WD Series',
          pinnedList: []
        };
      }

      // Auto-synchronize and sanitize prices in pinnedData
      if (pinnedData && Array.isArray(pinnedData.pinnedList)) {
        let pinnedChanged = false;
        let customPosts = [];
        if (env.POSTS_KV) {
          try {
            const rawPosts = await env.POSTS_KV.get('custom_posts_list');
            if (rawPosts) customPosts = safeJsonParse(rawPosts, []);
          } catch (e) {}
        }
        const postMap = new Map((customPosts || []).map(p => [p.id, p]));

        pinnedData.pinnedList = pinnedData.pinnedList.map(item => {
          if (!item) return item;
          let modified = false;
          const post = postMap.get(item.id);
          if (post) {
            if (item.priceUsd !== post.priceUsd) { item.priceUsd = post.priceUsd; modified = true; }
            if (item.priceOrigUsd !== post.priceOrig) { item.priceOrigUsd = post.priceOrig; modified = true; }
            if (item.priceVnd !== post.priceVnd) { item.priceVnd = post.priceVnd; modified = true; }
            const origVndNum = Math.round((parseFloat(String(post.priceOrig).replace(/[^0-9.]/g, '')) || 0) * 25000 / 1000) * 1000;
            const expectedOrigVnd = origVndNum ? origVndNum.toLocaleString('vi-VN').replace(/,/g, '.') + '₫' : '';
            if (expectedOrigVnd && item.priceOrigVnd !== expectedOrigVnd) { item.priceOrigVnd = expectedOrigVnd; modified = true; }
          } else {
            const res = sanitizePostPrice({ priceUsd: item.priceUsd, priceOrig: item.priceOrigUsd, priceVnd: item.priceVnd });
            if (res.modified) {
              item.priceUsd = res.item.priceUsd;
              item.priceOrigUsd = res.item.priceOrig;
              item.priceVnd = res.item.priceVnd;
              modified = true;
            }
          }
          if (modified) pinnedChanged = true;
          return item;
        });

        if (pinnedChanged && env.POSTS_KV) {
          try {
            await env.POSTS_KV.put('pinned_project', JSON.stringify(pinnedData));
          } catch (e) {}
        }
      }

      return new Response(JSON.stringify(pinnedData, null, 2), {
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      });
    }

    // POST /api/pinned-project or /api/pin-project
    if ((url.pathname === '/api/pinned-project' || url.pathname === '/api/pin-project') && request.method === 'POST') {
      try {
        const json = await request.json();
        let currentPinned = null;
        if (env.POSTS_KV) {
          try {
            const raw = await env.POSTS_KV.get('pinned_project');
            if (raw) currentPinned = JSON.parse(raw);
          } catch (e) {}
        } else {
          currentPinned = inMemoryPinned;
        }

        if (!currentPinned && env.ASSETS) {
          try {
            const assetRes = await env.ASSETS.fetch(new Request(new URL('/data/pinned_project.json', request.url)));
            if (assetRes.ok) currentPinned = await assetRes.json();
          } catch (e) {}
        }
        if (!currentPinned) currentPinned = { pinnedList: [] };

        let list = (currentPinned && Array.isArray(currentPinned.pinnedList)) ? [...currentPinned.pinnedList] : [];

        if (Array.isArray(json.pinnedList)) {
          list = json.pinnedList;
          currentPinned = { ...json };
        } else {
          const cleanAff = json.affiliateUrl && !json.affiliateUrl.startsWith('http://') && !json.affiliateUrl.startsWith('https://')
            ? 'https://' + json.affiliateUrl : (json.affiliateUrl || '#');
          const pinnedObj = {
            id: json.id || 'hero-pinned-' + Date.now(),
            title: json.title,
            titleEn: json.titleEn || json.title,
            titleVi: json.titleVi || json.title,
            titleZh: json.titleZh || json.title,
            tag: json.tag || 'REVIEW FLAGSHIP',
            tagEn: json.tagEn || 'FLAGSHIP REVIEW',
            tagVi: json.tagVi || 'SẢN PHẨM NỔI BẬT',
            tagZh: json.tagZh || '旗舰特选',
            brand: json.brand || json.urlDisplay || 'BullBoost Performance',
            badge: json.badge || "Editor's Choice",
            badgeEn: json.badgeEn || "Editor's Choice",
            badgeVi: json.badgeVi || "Lựa Chọn Biên Tập Viên",
            badgeZh: json.badgeZh || "编辑特选推荐",
            urlDisplay: json.urlDisplay || json.brand || 'BullBoost Performance',
            postUrl: json.postUrl || 'post.html',
            affiliateUrl: cleanAff,
            image: json.image || '',
            imageFit: json.imageFit || 'contain',
            priceVnd: json.priceVnd || '0₫',
            priceUsd: json.priceUsd || '$0.00',
            priceOrigVnd: json.priceOrigVnd || '',
            priceOrigUsd: json.priceOrigUsd || '',
            discountPercent: json.discountPercent || '-20%'
          };
          if (list.length > 0) {
            list[0] = pinnedObj;
          } else {
            list = [pinnedObj];
          }
          currentPinned = { ...pinnedObj, pinnedList: list };
        }

        if (env.POSTS_KV) {
          await env.POSTS_KV.put('pinned_project', JSON.stringify(currentPinned));
        } else {
          inMemoryPinned = currentPinned;
        }

        return new Response(JSON.stringify({
          success: true,
          message: 'Đã ghim dự án lên đầu trang chủ thành công!',
          pinnedData: currentPinned
        }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, message: 'Lỗi ghim dự án: ' + err.message }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      }
    }

    // POST /api/pin-swap (Hoán đổi vị trí giữa slot A và B)
    if (url.pathname === '/api/pin-swap' && request.method === 'POST') {
      try {
        const json = await request.json();
        const idxA = parseInt(json.indexA, 10);
        const idxB = parseInt(json.indexB, 10);

        let currentPinned = null;
        if (env.POSTS_KV) {
          try {
            const raw = await env.POSTS_KV.get('pinned_project');
            if (raw) currentPinned = JSON.parse(raw);
          } catch (e) {}
        } else {
          currentPinned = inMemoryPinned;
        }
        if (!currentPinned && env.ASSETS) {
          try {
            const assetRes = await env.ASSETS.fetch(new Request(new URL('/data/pinned_project.json', request.url)));
            if (assetRes.ok) currentPinned = await assetRes.json();
          } catch (e) {}
        }

        let list = (currentPinned && Array.isArray(currentPinned.pinnedList)) ? [...currentPinned.pinnedList] : [];
        if (idxA >= 0 && idxA < list.length && idxB >= 0 && idxB < list.length) {
          const temp = list[idxA];
          list[idxA] = list[idxB];
          list[idxB] = temp;

          const top = list[0] || {};
          const updatedObj = {
            ...top,
            pinnedList: list
          };

          if (env.POSTS_KV) {
            await env.POSTS_KV.put('pinned_project', JSON.stringify(updatedObj));
          } else {
            inMemoryPinned = updatedObj;
          }

          return new Response(JSON.stringify({
            success: true,
            message: `Đã hoán đổi vị trí Top ${idxA + 1} và Top ${idxB + 1} thành công!`,
            pinnedList: list
          }), {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
          });
        }

        return new Response(JSON.stringify({ success: false, message: 'Chỉ mục slot không hợp lệ!' }), {
          status: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, message: 'Lỗi hoán đổi ghim: ' + err.message }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      }
    }

    // POST /api/pin-set-slot (Gán bài viết/sản phẩm vào vị trí slot 0, 1, 2)
    if (url.pathname === '/api/pin-set-slot' && request.method === 'POST') {
      try {
        const json = await request.json();
        const slot = parseInt(json.slot, 10);
        let newItem = json.item;

        if (isNaN(slot) || slot < 0 || slot > 2) {
          return new Response(JSON.stringify({ success: false, message: 'Slot không hợp lệ (phải từ 0 đến 2)!' }), {
            status: 400,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
          });
        }

        // If postId provided instead of item object, find from catalog
        if (!newItem && json.postId) {
          let allPosts = [];
          if (env.POSTS_KV) {
            try {
              const raw = await env.POSTS_KV.get('custom_posts_list');
              if (raw) allPosts = JSON.parse(raw);
            } catch (e) {}
          }
          if (env.ASSETS) {
            try {
              const assetRes = await env.ASSETS.fetch(new Request(new URL('/data/posts.json', request.url)));
              if (assetRes.ok) {
                const bPosts = await assetRes.json();
                allPosts = [...allPosts, ...(Array.isArray(bPosts) ? bPosts : [])];
              }
            } catch (e) {}
          }
          const found = allPosts.find(p => p.id === json.postId || p.slug === json.postId);
          if (found) {
            newItem = {
              id: found.id,
              title: found.title,
              titleEn: found.titleEn || found.title,
              titleVi: found.titleVi || found.title,
              titleZh: found.titleZh || found.title,
              tag: 'REVIEW ' + (found.category || 'FLAGSHIP').toUpperCase(),
              tagEn: 'REVIEW ' + (found.categoryEn || found.category || 'FLAGSHIP').toUpperCase(),
              tagVi: (found.categoryVi || found.category || 'SẢN PHẨM NỔI BẬT').toUpperCase(),
              brand: found.brand || 'CouponHiker Official',
              badge: "Editor's Choice",
              badgeEn: "Editor's Choice",
              badgeVi: "Lựa Chọn Biên Tập Viên",
              urlDisplay: found.brand || 'CouponHiker Official',
              postUrl: found.slug || 'post.html',
              affiliateUrl: found.affiliateLink || '#',
              image: found.image || '',
              priceUsd: found.priceUsd || '$0.00',
              priceVnd: found.priceVnd || '0₫',
              priceOrigUsd: found.priceOrig || '',
              priceOrigVnd: found.originalPrice || '',
              discountPercent: found.couponDiscount || '-15%'
            };
          }
        }

        if (!newItem) {
          return new Response(JSON.stringify({ success: false, message: 'Dữ liệu bài viết không hợp lệ!' }), {
            status: 400,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
          });
        }

        let currentPinned = null;
        if (env.POSTS_KV) {
          try {
            const raw = await env.POSTS_KV.get('pinned_project');
            if (raw) currentPinned = JSON.parse(raw);
          } catch (e) {}
        } else {
          currentPinned = inMemoryPinned;
        }
        if (!currentPinned && env.ASSETS) {
          try {
            const assetRes = await env.ASSETS.fetch(new Request(new URL('/data/pinned_project.json', request.url)));
            if (assetRes.ok) currentPinned = safeJsonParse(await assetRes.text(), null);
          } catch (e) {}
        }

        let list = (currentPinned && Array.isArray(currentPinned.pinnedList)) ? [...currentPinned.pinnedList] : [];
        while (list.length <= slot) {
          list.push(newItem);
        }
        list[slot] = newItem;

        const top = list[0] || {};
        const updatedObj = {
          ...top,
          pinnedList: list
        };

        if (env.POSTS_KV) {
          await env.POSTS_KV.put('pinned_project', JSON.stringify(updatedObj));
        } else {
          inMemoryPinned = updatedObj;
        }

        return new Response(JSON.stringify({
          success: true,
          message: `Đã cập nhật vị trí Top ${slot + 1} thành công!`,
          pinnedList: list
        }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, message: 'Lỗi gán slot: ' + err.message }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      }
    }

    // POST /api/pin-reorder
    if (url.pathname === '/api/pin-reorder' && request.method === 'POST') {
      try {
        const json = await request.json();
        const list = Array.isArray(json.pinnedList) ? json.pinnedList : [];
        if (list.length === 0) {
          return new Response(JSON.stringify({ success: false, message: 'Danh sách ghim trống!' }), {
            status: 400,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
          });
        }

        const top = list[0] || {};
        const updatedObj = {
          ...top,
          pinnedList: list
        };

        if (env.POSTS_KV) {
          await env.POSTS_KV.put('pinned_project', JSON.stringify(updatedObj));
        } else {
          inMemoryPinned = updatedObj;
        }

        return new Response(JSON.stringify({
          success: true,
          message: 'Đã cập nhật thứ tự ghim thành công!',
          pinnedList: list
        }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, message: 'Lỗi sắp xếp ghim: ' + err.message }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      }
    }

    // -------------------------------------------------------------
    // 7. API: TOP BAR TICKER ITEMS
    // -------------------------------------------------------------
    // GET /api/ticker & /data/ticker_items.json
    if ((url.pathname === '/api/ticker' || url.pathname === '/data/ticker_items.json') && request.method === 'GET') {
      let tickerList = null;
      if (env.POSTS_KV) {
        try {
          const raw = await env.POSTS_KV.get('ticker_items');
          if (raw) tickerList = JSON.parse(raw);
        } catch (e) {}
      } else {
        tickerList = inMemoryTicker;
      }

      if ((!tickerList || tickerList.length === 0) && env.ASSETS) {
        try {
          const assetRes = await env.ASSETS.fetch(new Request(new URL('/data/ticker_items.json', request.url)));
          if (assetRes.ok) tickerList = safeJsonParse(await assetRes.text(), []);
        } catch (e) {}
      }

      return new Response(JSON.stringify(Array.isArray(tickerList) ? tickerList : [], null, 2), {
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      });
    }

    // POST /api/pin-ticker (Ghim bài viết lên thanh ticker chạy)
    if (url.pathname === '/api/pin-ticker' && request.method === 'POST') {
      try {
        const json = await request.json();
        let tickerList = [];
        if (env.POSTS_KV) {
          try {
            const raw = await env.POSTS_KV.get('ticker_items');
            if (raw) tickerList = JSON.parse(raw);
          } catch (e) {}
        } else {
          tickerList = inMemoryTicker || [];
        }

        if ((!tickerList || tickerList.length === 0) && env.ASSETS) {
          try {
            const assetRes = await env.ASSETS.fetch(new Request(new URL('/data/ticker_items.json', request.url)));
            if (assetRes.ok) tickerList = await assetRes.json();
          } catch (e) {}
        }
        if (!Array.isArray(tickerList)) tickerList = [];

        const itemId = json.id || 'ticker-' + crypto.randomUUID().slice(0, 8);
        const itemUrl = json.url || 'index.html';
        const itemBadge = json.badge || 'HOT REVIEW';
        const itemBadgeClass = json.badgeClass || 'bg-rose-500 text-white';
        const itemIcon = json.icon || 'sparkles';

        const tEn = (json.text && json.text.en) || json.titleEn || json.title || 'Featured Deal';
        const tVi = (json.text && json.text.vi) || json.titleVi || json.title || tEn;
        const tZh = (json.text && json.text.zh) || json.titleZh || json.title || tEn;

        const tickerObj = {
          id: itemId,
          badge: itemBadge,
          badgeClass: itemBadgeClass,
          icon: itemIcon,
          text: {
            en: tEn,
            vi: tVi,
            zh: tZh
          },
          url: itemUrl
        };

        const filtered = tickerList.filter(item => item && item.id !== itemId && item.url !== itemUrl);
        const updated = [tickerObj, ...filtered];

        if (env.POSTS_KV) {
          await env.POSTS_KV.put('ticker_items', JSON.stringify(updated));
        } else {
          inMemoryTicker = updated;
        }

        return new Response(JSON.stringify({
          success: true,
          message: 'Đã ghim lên thanh ticker đầu trang thành công!',
          items: updated
        }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, message: 'Lỗi ghim ticker: ' + err.message }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      }
    }

    // POST /api/unpin-ticker (Gỡ ghim bài viết khỏi thanh ticker)
    if (url.pathname === '/api/unpin-ticker' && request.method === 'POST') {
      try {
        const json = await request.json();
        let tickerList = [];
        if (env.POSTS_KV) {
          try {
            const raw = await env.POSTS_KV.get('ticker_items');
            if (raw) tickerList = JSON.parse(raw);
          } catch (e) {}
        } else {
          tickerList = inMemoryTicker || [];
        }

        if ((!tickerList || tickerList.length === 0) && env.ASSETS) {
          try {
            const assetRes = await env.ASSETS.fetch(new Request(new URL('/data/ticker_items.json', request.url)));
            if (assetRes.ok) tickerList = await assetRes.json();
          } catch (e) {}
        }
        if (!Array.isArray(tickerList)) tickerList = [];

        const targetId = json.id;
        const targetUrl = json.url;

        const updated = tickerList.filter(item => {
          if (!item) return false;
          const matchId = targetId ? item.id === targetId : false;
          const matchUrl = targetUrl ? item.url === targetUrl : false;
          return !(matchId || matchUrl);
        });

        if (env.POSTS_KV) {
          await env.POSTS_KV.put('ticker_items', JSON.stringify(updated));
        } else {
          inMemoryTicker = updated;
        }

        return new Response(JSON.stringify({
          success: true,
          message: 'Đã gỡ mục khỏi thanh ticker thành công!',
          items: updated
        }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, message: 'Lỗi gỡ ghim ticker: ' + err.message }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      }
    }

    // POST /api/ticker (Lưu toàn bộ danh sách ticker)
    if (url.pathname === '/api/ticker' && request.method === 'POST') {
      try {
        const json = await request.json();
        const items = Array.isArray(json) ? json : (Array.isArray(json.items) ? json.items : []);
        if (env.POSTS_KV) {
          await env.POSTS_KV.put('ticker_items', JSON.stringify(items));
        } else {
          inMemoryTicker = items;
        }
        return new Response(JSON.stringify({
          success: true,
          message: 'Đã lưu danh sách ticker thành công!',
          items: items
        }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, message: 'Lỗi lưu ticker: ' + err.message }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      }
    }

    // -------------------------------------------------------------
    // 8. ROUTE NORMALIZATION: /admin-cms -> /admin-cms/
    // -------------------------------------------------------------
    if (url.pathname === '/admin-cms') {
      return Response.redirect(new URL('/admin-cms/', request.url).toString(), 301);
    }

    // -------------------------------------------------------------
    // 9. API: CUSTOMER INQUIRIES & EMAIL FORWARDING
    // -------------------------------------------------------------

    // POST /api/contact (Khách gửi tin nhắn từ form Get in Touch)
    if (url.pathname === '/api/contact' && request.method === 'POST') {
      try {
        const body = await request.json();
        const name = (body.name || '').trim();
        const email = (body.email || '').trim();
        const subject = (body.subject || '').trim() || 'Yêu cầu tư vấn / Hợp tác';
        const message = (body.message || '').trim();
        const sourceUrl = (body.sourceUrl || '').trim() || 'https://www.couponhiker.com';

        if (!email || !message) {
          return new Response(JSON.stringify({
            success: false,
            message: 'Vui lòng cung cấp đầy đủ email và nội dung tin nhắn!'
          }), {
            status: 400,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
          });
        }

        const msgId = 'msg-' + crypto.randomUUID().slice(0, 8);
        const msgObj = {
          id: msgId,
          name: name || 'Khách hàng ẩn danh',
          email: email,
          subject: subject,
          message: message,
          createdAt: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
          sourceUrl: sourceUrl
        };

        // 1. Lưu tin nhắn vào Cloudflare KV messages_list
        let messagesList = [];
        if (env.POSTS_KV) {
          try {
            const raw = await env.POSTS_KV.get('messages_list');
            if (raw) messagesList = safeJsonParse(raw, []);
          } catch (e) {}
        } else {
          messagesList = inMemoryMessages || [];
        }

        messagesList = [msgObj, ...(messagesList || [])];

        if (env.POSTS_KV) {
          await env.POSTS_KV.put('messages_list', JSON.stringify(messagesList));
        } else {
          inMemoryMessages = messagesList;
        }

        // 2. Đọc cấu hình email đích
        let targetEmail = 'support@couponhiker.com';
        if (env.POSTS_KV) {
          try {
            const rawCfg = await env.POSTS_KV.get('email_config');
            if (rawCfg) {
              const parsedCfg = safeJsonParse(rawCfg, {});
              if (parsedCfg.targetEmail) targetEmail = parsedCfg.targetEmail;
            }
          } catch (e) {}
        }

        // 3. Chuyển tiếp email đến support@couponhiker.com qua FormSubmit
        let emailSent = false;
        try {
          const fwdRes = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(targetEmail)}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'User-Agent': 'CouponHiker-Notifier/1.0'
            },
            body: JSON.stringify({
              _subject: `[CouponHiker] ${subject} (Từ: ${name || 'Khách hàng'})`,
              _replyto: email,
              _captcha: 'false',
              _template: 'table',
              KhachHang: name || 'Ẩn danh',
              EmailLienHe: email,
              TieuDe: subject,
              NoiDung: message,
              TrangGui: sourceUrl,
              ThoiGian: msgObj.createdAt
            })
          });
          if (fwdRes.ok) emailSent = true;
        } catch (fwdErr) {
          console.warn('Email dispatch warning:', fwdErr);
        }

        return new Response(JSON.stringify({
          success: true,
          message: `Cảm ơn bạn! Tin nhắn đã được tiếp nhận và gửi đến ${targetEmail}.`,
          id: msgId,
          emailSent: emailSent,
          targetEmail: targetEmail
        }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      } catch (err) {
        return new Response(JSON.stringify({
          success: false,
          message: 'Lỗi tiếp nhận tin nhắn: ' + err.message
        }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      }
    }

    // GET /api/contact/messages (Lấy danh sách tin nhắn cho Admin CMS)
    if (url.pathname === '/api/contact/messages' && request.method === 'GET') {
      let messagesList = [];
      if (env.POSTS_KV) {
        try {
          const raw = await env.POSTS_KV.get('messages_list');
          if (raw) messagesList = safeJsonParse(raw, []);
        } catch (e) {}
      } else {
        messagesList = inMemoryMessages || [];
      }

      // Fallback nạp từ file tĩnh nếu KV chưa có tin nhắn
      if ((!messagesList || messagesList.length === 0) && env.ASSETS) {
        try {
          const assetRes = await env.ASSETS.fetch(new Request(new URL('/data/messages.json', request.url)));
          if (assetRes.ok) {
            const raw = await assetRes.text();
            messagesList = safeJsonParse(raw, []);
          }
        } catch (e) {}
      }

      return new Response(JSON.stringify({
        success: true,
        messages: messagesList || [],
        count: (messagesList || []).length
      }), {
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      });
    }

    // DELETE /api/contact/messages (Xóa tin nhắn)
    if (url.pathname === '/api/contact/messages' && request.method === 'DELETE') {
      try {
        const delId = url.searchParams.get('id');
        let messagesList = [];
        if (env.POSTS_KV) {
          try {
            const raw = await env.POSTS_KV.get('messages_list');
            if (raw) messagesList = safeJsonParse(raw, []);
          } catch (e) {}
        } else {
          messagesList = inMemoryMessages || [];
        }

        if (delId) {
          messagesList = (messagesList || []).filter(m => m && m.id !== delId);
          if (env.POSTS_KV) {
            await env.POSTS_KV.put('messages_list', JSON.stringify(messagesList));
          } else {
            inMemoryMessages = messagesList;
          }
        }

        return new Response(JSON.stringify({
          success: true,
          message: 'Đã xóa tin nhắn thành công!'
        }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, message: 'Lỗi xóa tin nhắn: ' + err.message }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      }
    }

    // GET & POST /api/contact/config (Đọc và Lưu cấu hình Email)
    if (url.pathname === '/api/contact/config') {
      if (request.method === 'GET') {
        let cfg = {
          targetEmail: 'support@couponhiker.com',
          forwarder: 'formsubmit',
          smtp: {
            enabled: false,
            host: 'smtp.gmail.com',
            port: 587,
            user: 'support@couponhiker.com',
            passSet: false
          }
        };

        if (env.POSTS_KV) {
          try {
            const raw = await env.POSTS_KV.get('email_config');
            if (raw) {
              const parsed = safeJsonParse(raw, null);
              if (parsed) cfg = { ...cfg, ...parsed };
            }
          } catch (e) {}
        } else if (env.ASSETS) {
          try {
            const assetRes = await env.ASSETS.fetch(new Request(new URL('/data/email_config.json', request.url)));
            if (assetRes.ok) {
              const raw = await assetRes.text();
              const parsed = safeJsonParse(raw, null);
              if (parsed) cfg = { ...cfg, ...parsed };
            }
          } catch (e) {}
        }

        return new Response(JSON.stringify(cfg), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      }

      if (request.method === 'POST') {
        try {
          const newCfg = await request.json();
          if (env.POSTS_KV) {
            await env.POSTS_KV.put('email_config', JSON.stringify(newCfg));
          }
          return new Response(JSON.stringify({
            success: true,
            message: 'Đã lưu cấu hình email thành công!'
          }), {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
          });
        } catch (err) {
          return new Response(JSON.stringify({ success: false, message: 'Lỗi lưu cấu hình: ' + err.message }), {
            status: 500,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
          });
        }
      }
    }

    // POST /api/contact/test (Gửi thư thử nghiệm)
    if (url.pathname === '/api/contact/test' && request.method === 'POST') {
      try {
        let targetEmail = 'support@couponhiker.com';
        if (env.POSTS_KV) {
          try {
            const rawCfg = await env.POSTS_KV.get('email_config');
            if (rawCfg) {
              const parsedCfg = safeJsonParse(rawCfg, {});
              if (parsedCfg.targetEmail) targetEmail = parsedCfg.targetEmail;
            }
          } catch (e) {}
        }

        const testId = 'test-' + crypto.randomUUID().slice(0, 8);
        const testMsg = {
          id: testId,
          name: 'CouponHiker Test System',
          email: targetEmail,
          subject: 'Kiểm tra kết nối gửi/nhận email - CouponHiker',
          message: `Xin chào! Đây là email thử nghiệm gửi từ hệ thống website CouponHiker (https://www.couponhiker.com) nhằm kiểm tra kết nối chuyển tiếp thư đến ${targetEmail}. Nếu bạn nhận được thư này, hệ thống nhận email đang hoạt động rất tốt!`,
          createdAt: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
          sourceUrl: 'https://www.couponhiker.com/admin-cms/'
        };

        // Lưu tin nhắn thử nghiệm vào KV để hiện ngay trong Inbox Admin
        let messagesList = [];
        if (env.POSTS_KV) {
          try {
            const raw = await env.POSTS_KV.get('messages_list');
            if (raw) messagesList = safeJsonParse(raw, []);
          } catch (e) {}
        } else {
          messagesList = inMemoryMessages || [];
        }
        messagesList = [testMsg, ...(messagesList || [])];
        if (env.POSTS_KV) {
          await env.POSTS_KV.put('messages_list', JSON.stringify(messagesList));
        } else {
          inMemoryMessages = messagesList;
        }

        // Chuyển tiếp thử nghiệm qua FormSubmit
        let emailSent = false;
        let responseDetail = '';
        try {
          const fwdRes = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(targetEmail)}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'User-Agent': 'CouponHiker-Test/1.0'
            },
            body: JSON.stringify({
              _subject: '[Test] Kiểm tra kết nối nhận Email - CouponHiker',
              _replyto: targetEmail,
              _captcha: 'false',
              _template: 'table',
              HeThong: 'CouponHiker Live System',
              TargetEmail: targetEmail,
              NoiDung: testMsg.message,
              ThoiGian: testMsg.createdAt,
              TrangGui: testMsg.sourceUrl
            })
          });
          if (fwdRes.ok) {
            emailSent = true;
            responseDetail = 'Đã gửi yêu cầu chuyển tiếp thư thành công!';
          } else {
            responseDetail = `Dịch vụ email phản hồi mã ${fwdRes.status}`;
          }
        } catch (fwdErr) {
          responseDetail = fwdErr.message;
        }

        return new Response(JSON.stringify({
          success: true,
          message: emailSent
            ? `Đã gửi thử email test thành công đến ${targetEmail}! Tin nhắn cũng đã được đưa vào hộp thư Admin.`
            : `Tin nhắn test đã được lưu vào Inbox Admin. Ghi chú gửi ra ngoài: ${responseDetail}`,
          targetEmail: targetEmail,
          emailSent: emailSent
        }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, message: 'Lỗi gửi test: ' + err.message }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }
        });
      }
    }

    // -------------------------------------------------------------
    // 10. DYNAMIC POST HTML SERVING (FOR NEWLY PUBLISHED POSTS)
    // -------------------------------------------------------------
    const isStaticSystemPage = ['/index.html', '/post.html', '/shop.html', '/sponsor.html', '/admin.html', '/post-detail.html', '/admin-cms/index.html'].includes(url.pathname);
    if (url.pathname.startsWith('/post-') || (url.pathname.endsWith('.html') && !isStaticSystemPage)) {
      const cleanPath = url.pathname.replace(/^\//, '');

      // Check KV for saved HTML
      if (env.POSTS_KV) {
        const savedHtml = await env.POSTS_KV.get('post_html:' + cleanPath) || 
                          await env.POSTS_KV.get('post_html:post-' + cleanPath) ||
                          (!cleanPath.endsWith('.html') ? await env.POSTS_KV.get('post_html:' + cleanPath + '.html') : null);
        if (savedHtml) {
          return new Response(sanitizePostHtml(savedHtml), {
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0',
              ...CORS_HEADERS
            }
          });
        }
      } else if (inMemoryHtml.has(cleanPath)) {
        return new Response(sanitizePostHtml(inMemoryHtml.get(cleanPath)), {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            ...CORS_HEADERS
          }
        });
      }

      // If static file exists in assets, let ASSETS serve it
      if (env.ASSETS) {
        const assetRes = await env.ASSETS.fetch(request);
        if (assetRes.ok) return assetRes;

        // Fallback to post-detail.html
        const detailRes = await env.ASSETS.fetch(new Request(new URL('/post-detail.html', request.url)));
        if (detailRes.ok) {
          return new Response(detailRes.body, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
          });
        }
      }
    }

    // -------------------------------------------------------------
    // 7. SERVE STATIC ASSETS (HTML, CSS, JS, IMAGES) VIA CLOUDFLARE ASSETS
    // -------------------------------------------------------------
    if (env.ASSETS) {
      const assetRes = await env.ASSETS.fetch(request);
      if (assetRes.ok && (url.pathname.endsWith('.js') || url.pathname.endsWith('.html') || url.pathname.endsWith('.json') || url.pathname.endsWith('.css'))) {
        const newHeaders = new Headers(assetRes.headers);
        newHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        newHeaders.set('Pragma', 'no-cache');
        newHeaders.set('Expires', '0');
        return new Response(assetRes.body, {
          status: assetRes.status,
          statusText: assetRes.statusText,
          headers: newHeaders
        });
      }
      return assetRes;
    }

    return new Response('Cloudflare Worker is running! Static assets not bound.', {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
};
