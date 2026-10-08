import fs from 'fs';
import path from 'path';

// 1. Clean up dist/index.html - remove the github-pages-redirect if present
const distIndexPath = path.resolve('dist/index.html');
if (fs.existsSync(distIndexPath)) {
  let content = fs.readFileSync(distIndexPath, 'utf-8');
  content = content.replace(/<!-- GH_PAGES_REDIRECT_START -->[\s\S]*?<!-- GH_PAGES_REDIRECT_END -->/g, '');
  fs.writeFileSync(distIndexPath, content, 'utf-8');
}

// 2. Ensure docs directory exists and mirror dist
fs.mkdirSync(path.resolve('docs'), { recursive: true });
fs.cpSync(path.resolve('dist'), path.resolve('docs'), { recursive: true });

// 3. Ensure assets directory in root also has the compiled assets
fs.mkdirSync(path.resolve('assets'), { recursive: true });
if (fs.existsSync(path.resolve('dist/assets'))) {
  fs.cpSync(path.resolve('dist/assets'), path.resolve('assets'), { recursive: true });
}

// 4. Create .nojekyll in root, dist, and docs to prevent Jekyll processing
fs.writeFileSync(path.resolve('.nojekyll'), '', 'utf-8');
fs.writeFileSync(path.resolve('dist/.nojekyll'), '', 'utf-8');
fs.writeFileSync(path.resolve('docs/.nojekyll'), '', 'utf-8');

// 5. Create 404.html fallback for GitHub Pages SPA in root and docs
if (fs.existsSync(path.resolve('docs/index.html'))) {
  fs.copyFileSync(path.resolve('docs/index.html'), path.resolve('docs/404.html'));
  fs.copyFileSync(path.resolve('docs/index.html'), path.resolve('404.html'));
}

console.log('Post-build completed successfully: synced to docs/ and assets/, created .nojekyll and 404 fallbacks.');
