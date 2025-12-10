#!/usr/bin/env node
import fs from 'fs';
const products = fs.readFileSync('/tmp/all-product-urls.txt', 'utf8').trim().split('\n').filter(u => u.length > 0 && !u.includes('sitemap'));

// Categorize products
const blenders = products.filter(u =>
  u.includes('ascent') || u.includes('propel') || u.includes('5200') ||
  u.includes('e310') || u.includes('e320') || u.includes('a2300') ||
  u.includes('a2500') || u.includes('a3500') || u.includes('v1200') ||
  u.includes('reconditioned') || u.includes('s55') || u.includes('turboblend') ||
  u.includes('vitamix-one') || u.includes('creations')
);
const accessories = products.filter(u => !blenders.includes(u));

const data = {
  generatedAt: new Date().toISOString(),
  source: 'https://www.vitamix.com/us/en_us/products/sitemap.xml',
  description: 'Complete list of Vitamix product URLs from sitemap',
  summary: {
    total: products.length,
    blenders: blenders.length,
    accessories: accessories.length
  },
  blenders: blenders,
  accessories: accessories
};
fs.writeFileSync('product-urls.json', JSON.stringify(data, null, 2));
console.log('Saved', blenders.length, 'blenders and', accessories.length, 'accessories');
