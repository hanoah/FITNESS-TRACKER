/**
 * One-time script to scrape strength standards from strengthlevel.com.
 * Run: npx tsx scripts/scrape-strength-standards.ts
 *
 * Note: strengthlevel.com does not provide a public API. Manual data entry
 * or browser-based scraping may be needed to populate strength-standards.json.
 * The bundled src/data/strength-standards.json contains curated data for key lifts.
 */

console.log('Strength standards are in src/data/strength-standards.json')
console.log('To update: edit the JSON or use a scraping tool against strengthlevel.com')
