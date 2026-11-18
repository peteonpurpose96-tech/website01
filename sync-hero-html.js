const fs = require('fs');
const path = require('path');

const rootPath = 'C:/Web2';
const indexPath = path.join(rootPath, 'index.html');
const pinnedPath = path.join(rootPath, 'data/pinned_project.json');
const postsPath = path.join(rootPath, 'data/posts.json');

function syncHeroHtml() {
  if (!fs.existsSync(indexPath) || !fs.existsSync(pinnedPath)) {
    console.error('Missing index.html or pinned_project.json');
    return false;
  }

  let indexHtml = fs.readFileSync(indexPath, 'utf8');
  const pinnedData = JSON.parse(fs.readFileSync(pinnedPath, 'utf8'));
  const top = (pinnedData.pinnedList && pinnedData.pinnedList[0]) ? pinnedData.pinnedList[0] : pinnedData;

  if (!top || !top.title) {
    console.warn('No active pinned project found in pinned_project.json');
    return false;
  }

  const title = top.title || top.titleEn || 'Featured Hardware Spotlight';
  const brand = top.brand || top.urlDisplay || 'Verified Flagship';
  const tag = top.tag || 'FLAGSHIP HARDWARE SPOTLIGHT';
  const badge = top.badge || "Editor's Choice";
  const postUrl = top.postUrl || 'post.html';
  const affUrl = top.affiliateUrl || '#';
  const img = top.image || 'images/posts/sony-wh-1000xm5-wireless-noise-canceling-headphones-review.png';
  const priceUsd = top.priceUsd || '$199.00';
  const priceVnd = top.priceVnd || '4.975.000₫';
  const origUsd = top.priceOrigUsd || '$249.00';
  const origVnd = top.priceOrigVnd || '6.225.000₫';
  const discount = top.discountPercent || '-20%';

  // Pros & Cons
  let prosArr = [];
  if (Array.isArray(top.pros)) prosArr = top.pros;
  else if (typeof top.pros === 'string' && top.pros.trim()) prosArr = top.pros.split('\n').map(s => s.trim()).filter(Boolean);
  if (prosArr.length === 0) {
    prosArr = [
      'Pro-grade studio acoustic reproduction & high-fidelity performance',
      'Engineered with premium durable materials for long-term reliability',
      'Top-rated editorial benchmark in consumer tech evaluation'
    ];
  }

  let consArr = [];
  if (Array.isArray(top.cons)) consArr = top.cons;
  else if (typeof top.cons === 'string' && top.cons.trim()) consArr = top.cons.split('\n').map(s => s.trim()).filter(Boolean);
  if (consArr.length === 0) {
    consArr = [
      'Higher initial investment compared to budget alternatives',
      'Requires proper setup and pairing to maximize performance',
      'Limited stock availability due to high global demand'
    ];
  }

  const cleanPro = (p) => p.replace(/^[•\-\*]\s*/, '').trim();

  // 1. Update Left Floating Card Pros
  indexHtml = indexHtml.replace(
    /<div id="hero-pros-list"[\s\S]*?<\/div>/,
    `<div id="hero-pros-list" class="space-y-1.5 text-[11px] font-medium text-slate-700 dark:text-emerald-100/90 leading-relaxed transition-opacity duration-300">
            <p id="hero-pros-item-1">• ${cleanPro(prosArr[0] || prosArr[0])}</p>
            <p id="hero-pros-item-2">• ${cleanPro(prosArr[1] || prosArr[0])}</p>
            <p id="hero-pros-item-3">• ${cleanPro(prosArr[2] || prosArr[0])}</p>
          </div>`
  );

  const ratingStr = top.rating ? `${top.rating}/10 ⭐` : '9.8/10 ⭐';
  indexHtml = indexHtml.replace(
    /<span id="hero-pros-footer-text">[\s\S]*?<\/span>/,
    `<span id="hero-pros-footer-text">TOP RATED: ${ratingStr}</span>`
  );

  // 2. Update Right Floating Card Cons
  indexHtml = indexHtml.replace(
    /<div id="hero-cons-list"[\s\S]*?<\/div>/,
    `<div id="hero-cons-list" class="space-y-1.5 text-[11px] font-medium text-slate-700 dark:text-amber-100/90 leading-relaxed transition-opacity duration-300">
            <p id="hero-cons-item-1">• ${cleanPro(consArr[0] || consArr[0])}</p>
            <p id="hero-cons-item-2">• ${cleanPro(consArr[1] || consArr[0])}</p>
            <p id="hero-cons-item-3">• ${cleanPro(consArr[2] || consArr[0])}</p>
          </div>`
  );

  // 3. Update Brand Text
  indexHtml = indexHtml.replace(
    /<span id="hero-pinned-brand-text">[\s\S]*?<\/span>/,
    `<span id="hero-pinned-brand-text">${brand}</span>`
  );

  // 4. Update Badge
  indexHtml = indexHtml.replace(
    /<span id="hero-pinned-badge"[\s\S]*?>[\s\S]*?<\/span>/,
    `<span id="hero-pinned-badge" class="text-[9.5px] font-bold bg-cyan-50 dark:bg-cyan-950/80 text-cyan-700 dark:text-cyan-300 px-2.5 py-0.5 rounded-full uppercase border border-cyan-200 dark:border-cyan-500/40">${badge}</span>`
  );

  // 5. Update Image
  indexHtml = indexHtml.replace(
    /<img id="hero-pinned-img"[\s\S]*?>/,
    `<img id="hero-pinned-img" src="${img}" alt="${title.replace(/"/g, '&quot;')}" class="w-full h-full object-contain transition-transform duration-500 group-hover/hero-img:scale-105">`
  );

  // 6. Update Tag
  indexHtml = indexHtml.replace(
    /<span id="hero-pinned-tag"[\s\S]*?>[\s\S]*?<\/span>/,
    `<span id="hero-pinned-tag" class="text-xs font-bold text-cyan-600 dark:text-cyan-400 uppercase tracking-wide">${tag}</span>`
  );

  // 7. Update Title & Link
  indexHtml = indexHtml.replace(
    /<a id="hero-pinned-link"[\s\S]*?>[\s\S]*?<\/a>/,
    `<a id="hero-pinned-link" href="${postUrl}" class="hover:text-pink-500 transition-colors">${title}</a>`
  );

  // 8. Update Prices
  indexHtml = indexHtml.replace(
    /<span id="hero-pinned-price"[\s\S]*?>[\s\S]*?<\/span>/,
    `<span id="hero-pinned-price" class="price-val text-2xl sm:text-3xl font-black text-cyan-600 dark:text-cyan-400 font-display" data-vnd="${priceVnd}" data-usd="${priceUsd}">${priceUsd}</span>`
  );
  indexHtml = indexHtml.replace(
    /<span id="hero-pinned-price-orig"[\s\S]*?>[\s\S]*?<\/span>/,
    `<span id="hero-pinned-price-orig" class="strike-val text-xs sm:text-sm text-slate-400 line-through" data-vnd="${origVnd}" data-usd="${origUsd}">${origUsd}</span>`
  );
  indexHtml = indexHtml.replace(
    /<span id="hero-pinned-discount"[\s\S]*?>[\s\S]*?<\/span>/,
    `<span id="hero-pinned-discount" class="text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/80">${discount}</span>`
  );

  // 9. Update CTA Buttons
  indexHtml = indexHtml.replace(
    /<a id="hero-pinned-aff-btn"[\s\S]*?>/,
    `<a id="hero-pinned-aff-btn" href="${affUrl}" target="_blank" rel="noopener noreferrer" class="flex-1 py-3 px-5 bg-gradient-to-r from-cyan-500 via-sky-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-black rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:scale-[1.01] transition-all group">`
  );
  indexHtml = indexHtml.replace(
    /<a id="hero-pinned-review-btn"[\s\S]*?>/,
    `<a id="hero-pinned-review-btn" href="${postUrl}" class="px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-800 hover:border-cyan-500/50 text-slate-700 dark:text-cyan-300 hover:text-cyan-500 text-xs font-bold transition-all flex items-center justify-center gap-1.5 bg-slate-100 dark:bg-[#141926] whitespace-nowrap">`
  );

  fs.writeFileSync(indexPath, indexHtml, 'utf8');
  console.log(`[SyncHeroHtml] Successfully synchronized index.html with Top 1 Spotlight: "${title}"`);
  return true;
}

if (require.main === module) {
  syncHeroHtml();
}

module.exports = { syncHeroHtml };
